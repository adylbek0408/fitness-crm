import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react'
import Hls from 'hls.js'

const CloudflareStreamPlayer = forwardRef(function CloudflareStreamPlayer({
  uid,
  subdomain,
  live = true,
  className = 'w-full h-full bg-black',
  onError,
}, externalRef) {
  const videoRef = useRef(null)
  const hlsRef   = useRef(null)
  const whepRef  = useRef(null)   // RTCPeerConnection for WHEP (live only)
  const [loading,    setLoading]    = useState(true)
  const [hardError,  setHardError]  = useState(false)
  const [needsTap,   setNeedsTap]   = useState(false)
  // Browser autoplay policy will sometimes start the <video> muted even after
  // a tap. We watch for that and surface an explicit "Включить звук" button
  // so the student isn't left wondering why the broadcast is silent. Also
  // covers the case where audio is missing entirely from the SDP/HLS source.
  const [audioMuted, setAudioMuted] = useState(false)

  useImperativeHandle(externalRef, () => ({
    el: videoRef.current,
    requestFullscreen: async () => {
      const v = videoRef.current
      if (!v) return
      if (v.webkitEnterFullscreen) { v.webkitEnterFullscreen(); return }
      if (v.requestFullscreen)     { await v.requestFullscreen(); return }
    },
    play:  () => videoRef.current?.play(),
    pause: () => videoRef.current?.pause(),
  }), [])

  useEffect(() => {
    if (!uid || !subdomain) return
    const v = videoRef.current
    if (!v) return

    const hlsSrc  = `https://${subdomain}/${uid}/manifest/video.m3u8`
    const whepUrl = `https://${subdomain}/${uid}/webRTC/play`

    // Prefer hls.js whenever MSE is available (Chrome, Firefox, Edge).
    // IMPORTANT: Chrome on macOS returns 'maybe' for canPlayType('application/vnd.apple.mpegurl')
    // but cannot actually play HLS natively — it has MSE/hls.js support instead.
    // Only fall back to native HLS when hls.js is NOT supported (Safari, iOS).
    const canNative = !Hls.isSupported() && !!v.canPlayType('application/vnd.apple.mpegurl')

    console.log('[player] init hlsSrc:', hlsSrc, 'canNative:', canNative, 'hlsSupported:', Hls.isSupported(), 'live:', live)

    setLoading(true)
    setHardError(false)
    setNeedsTap(false)

    let cleanedUp  = false
    let retryTimer = null
    let hasPlayed  = false   // flips true on first 'playing' event

    const onCanPlay = () => {
      if (cleanedUp) return
      console.log('[player] canplay — readyState:', v.readyState)
      setLoading(false)
      // If data arrived but we've never played (stream came online while
      // spinner was showing), nudge the browser to autoplay.
      if (!hasPlayed) {
        v.play().catch(err => {
          if (!cleanedUp) {
            console.warn('[player] canplay-play blocked:', err?.name)
            setNeedsTap(true)
            setLoading(false)
          }
        })
      }
    }
    const onPlaying = () => {
      if (cleanedUp) return
      console.log('[player] playing ✓ muted:', v.muted, 'volume:', v.volume,
        'audioTracks:', v.srcObject?.getAudioTracks?.()?.length ?? '(via HLS)')
      hasPlayed = true
      // CRITICAL: cancel any pending retry timer.
      // Without this the timer fires v.load() mid-playback and kills the stream.
      clearTimeout(retryTimer)
      retryTimer = null
      setLoading(false)
      setNeedsTap(false)
      // Check audibility — browser may have started us muted to satisfy
      // autoplay policy, or the source may not have audio at all. Surface
      // an Unmute affordance if so.
      if (v.muted || v.volume === 0) {
        setAudioMuted(true)
      } else {
        setAudioMuted(false)
      }
    }
    // React to runtime mute/volumechange events triggered by browser/OS
    // (e.g. iOS silent switch, autoplay policy changes after tap).
    const onVolumeChange = () => {
      if (cleanedUp || !hasPlayed) return
      setAudioMuted(v.muted || v.volume === 0)
    }
    // Autoplay-blocked: video has data but is paused before any playing event.
    const onPause = () => {
      if (cleanedUp || hasPlayed) return
      if (v.readyState >= 2) {
        console.log('[player] paused before first play — showing tap overlay')
        setNeedsTap(true)
        setLoading(false)
      }
    }

    v.addEventListener('canplay',      onCanPlay)
    v.addEventListener('loadeddata',   onCanPlay)
    v.addEventListener('playing',      onPlaying)
    v.addEventListener('pause',        onPause)
    v.addEventListener('volumechange', onVolumeChange)

    // ── Stall recovery — auto-nudge if playback freezes mid-stream ──────────
    // Symptom: video element fires 'waiting' and stays there because the live
    // edge moved past the buffer. hls.js's internal nudging covers most cases,
    // but a hard freeze without 'error' events is invisible to it. We watch
    // for >5 s of 'waiting' state and (a) try to play(), (b) for live → reset
    // the source to jump back to the live edge.
    let stallTimer = null
    let stallAttempts = 0
    const clearStall = () => { if (stallTimer) { clearTimeout(stallTimer); stallTimer = null } }
    const onWaiting = () => {
      if (cleanedUp || !hasPlayed) return
      clearStall()
      stallTimer = setTimeout(() => {
        if (cleanedUp) return
        stallAttempts++
        console.warn('[player] stalled >4s — recovery attempt', stallAttempts,
          'currentTime:', v.currentTime, 'buffered:', v.buffered.length)
        v.play().catch(() => {})
        if (stallAttempts >= 2 && live) {
          stallAttempts = 0
          try {
            if (hlsRef.current) {
              // HLS path: jump back to live edge
              hlsRef.current.startLoad(-1)
            } else if (v.srcObject) {
              // WHEP path: srcObject is alive in JS but ICE may be dead —
              // close PC and restart WHEP from scratch.
              console.warn('[player] WHEP stall reconnect')
              try { whepRef.current?.close() } catch {}
              whepRef.current = null
              v.srcObject = null
              hasPlayed = false
              tryWhep().catch(() => {})
            } else {
              v.load()
              v.play().catch(() => {})
            }
          } catch {}
        }
      }, 4000)
    }
    const onTimeUpdate = () => { stallAttempts = 0; clearStall() }
    v.addEventListener('waiting',    onWaiting)
    v.addEventListener('timeupdate', onTimeUpdate)

    // ── WHEP (WebRTC egress) — runs in parallel for live streams ──────────────
    // CF Stream with WHIP ingest may not serve HLS in time (or at all).
    // WHEP is the native WebRTC receive protocol: immediately connects when the
    // trainer is broadcasting. We race WHEP against HLS — first to trigger
    // 'playing' wins. If WHEP wins it destroys the HLS instance.
    if (live) {
      const tryWhep = async () => {
        while (!cleanedUp && !hasPlayed) {
          let pc = null
          try {
            pc = new RTCPeerConnection({
              iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
              bundlePolicy: 'max-bundle',
            })
            whepRef.current = pc

            pc.addTransceiver('video', { direction: 'recvonly' })
            pc.addTransceiver('audio', { direction: 'recvonly' })

            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)

            // Wait up to 3 s for ICE gathering to complete
            await new Promise(resolve => {
              if (pc.iceGatheringState === 'complete') { resolve(); return }
              const done = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', done); resolve() } }
              pc.addEventListener('icegatheringstatechange', done)
              setTimeout(resolve, 3000)
            })

            if (cleanedUp || hasPlayed) { pc.close(); whepRef.current = null; return }

            console.log('[player] WHEP attempting connect to:', whepUrl)
            const resp = await fetch(whepUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/sdp' },
              body: pc.localDescription.sdp,
            })

            if (!resp.ok) {
              console.warn('[player] WHEP HTTP', resp.status, '— retrying in 5s')
              pc.close(); whepRef.current = null
              await new Promise(r => setTimeout(r, 5000))
              continue
            }

            // Set up handlers BEFORE setRemoteDescription — ontrack fires
            // synchronously during SDP processing and would be missed if set after.
            let trackResolve, trackReject
            const trackPromise = new Promise((resolve, reject) => {
              trackResolve = resolve; trackReject = reject
            })
            const trackTimeout = setTimeout(
              () => trackReject(new Error('WHEP: no track in 8s')), 8000
            )
            // Collect all tracks into one MediaStream. WHEP fires ontrack
            // separately for video and audio (unified-plan) — resolving on the
            // first event would miss the other track. A 100ms debounce lets
            // all synchronously-arriving tracks accumulate before we commit.
            const sharedStream = new MediaStream()
            let resolveTimer = null
            pc.ontrack = e => {
              clearTimeout(trackTimeout)
              const kind = e.track?.kind
              console.log(`[player] WHEP ontrack kind=${kind}`)
              sharedStream.addTrack(e.track)
              clearTimeout(resolveTimer)
              resolveTimer = setTimeout(() => trackResolve(sharedStream), 100)
            }
            pc.oniceconnectionstatechange = () => {
              console.log('[player] WHEP ICE:', pc.iceConnectionState)
              if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
                clearTimeout(trackTimeout)
                trackReject(new Error(`WHEP ICE ${pc.iceConnectionState}`))
              }
            }

            const sdp = await resp.text()
            console.log('[player] WHEP answer len:', sdp.length, 'first80:', sdp.slice(0, 80).replace(/\r?\n/g, '|'))
            await pc.setRemoteDescription({ type: 'answer', sdp })

            const remoteStream = await trackPromise

            if (cleanedUp || hasPlayed) { pc.close(); whepRef.current = null; return }

            console.log('[player] WHEP track received — taking over from HLS')
            // WHEP won — cancel HLS and start WebRTC playback
            clearTimeout(retryTimer); retryTimer = null
            try { hlsRef.current?.destroy() } catch {}
            hlsRef.current = null
            // Clear any HLS src so the browser doesn't try to play both
            if (!v.srcObject) {
              try { v.src = '' } catch {}
            }

            v.srcObject = remoteStream
            try {
              // First attempt: unmuted. Most browsers allow this if the page
              // had any prior gesture (which it did — user navigated here from
              // a click on a stream card).
              v.muted = false
              await v.play()
            } catch (err) {
              if (!cleanedUp) {
                console.warn('[player] WHEP unmuted play blocked:', err?.name, '— retrying muted')
                // Autoplay policy refused. Retry muted so the student at least
                // sees the video; the Unmute pill (driven by audioMuted state)
                // appears so they can flip sound on with one tap.
                try {
                  v.muted = true
                  await v.play()
                  setAudioMuted(true)
                } catch (err2) {
                  console.warn('[player] WHEP muted play also blocked:', err2?.name)
                  setNeedsTap(true)
                  setLoading(false)
                }
              }
            }

            // Replace initial ICE handler (which used trackReject) with a
            // live monitor: reconnect WHEP if ICE drops mid-stream.
            // Without this, a mid-stream ICE failure leaves v.srcObject pointing
            // to a dead MediaStream and no recovery ever happens.
            const livePc = pc
            livePc.oniceconnectionstatechange = () => {
              const state = livePc.iceConnectionState
              console.log('[player] WHEP ICE (live):', state)
              if ((state === 'failed' || state === 'disconnected') && !cleanedUp) {
                console.warn('[player] WHEP dropped mid-stream — reconnecting in 2s')
                try { livePc.close() } catch {}
                if (whepRef.current === livePc) whepRef.current = null
                v.srcObject = null
                hasPlayed = false
                stallAttempts = 0
                setTimeout(() => { if (!cleanedUp) tryWhep().catch(() => {}) }, 2000)
              }
            }
            return   // done — HLS loop will also exit because hasPlayed flips via onPlaying

          } catch (err) {
            console.warn('[player] WHEP error:', err?.message, '— retrying in 5s')
            try { pc?.close() } catch {}
            if (whepRef.current === pc) whepRef.current = null
            if (cleanedUp || hasPlayed) return
            await new Promise(r => setTimeout(r, 5000))
          }
        }
      }

      // Fire WHEP attempt immediately (don't await — runs in background)
      tryWhep().catch(() => {})
    }
    // ── End WHEP ──────────────────────────────────────────────────────────────

    if (canNative) {
      // ── iOS / Safari / Chrome-Mac — native HLS ─────────────────────────
      // For live streams the manifest may not be ready when the user joins
      // (trainer still connecting). Retry aggressively instead of giving up.
      let retries     = 0
      let ignoreError = false
      const MAX_RETRIES = live ? 1200 : 10   // ~50 min live vs 25 s VOD

      const handleError = () => {
        // Never interrupt once the user has successfully started playback.
        if (cleanedUp || ignoreError || hasPlayed) return
        const errCode = v.error?.code ?? '?'
        console.warn('[player] native HLS error code:', errCode, 'retry:', retries + 1)
        if (retries < MAX_RETRIES) {
          retries++
          ignoreError = true
          const delay = retries < 5 ? 1500 : 3000
          retryTimer  = setTimeout(() => {
            if (cleanedUp || hasPlayed) return   // don't interrupt active playback
            ignoreError = false
            v.load()
          }, delay)
        } else {
          setHardError(true)
          onError?.(new Error('stream unavailable'))
        }
      }

      v.addEventListener('error', handleError)
      v.src = hlsSrc

      // Attempt autoplay — any rejection means browser policy requires a tap.
      try {
        const p = v.play()
        if (p && typeof p.then === 'function') {
          p.catch(err => {
            if (cleanedUp) return
            console.warn('[player] autoplay rejected:', err?.name || err)
            setNeedsTap(true)
            setLoading(false)
          })
        }
      } catch (e) {
        if (!cleanedUp) { setNeedsTap(true); setLoading(false) }
      }

      // Safety net: 4 s after init, if video has data but is still paused
      // → silently-blocked autoplay (Low-Power Mode, older iOS, etc.)
      // Only show tap overlay when there is actual video data (readyState ≥ 2).
      // If readyState is 0 (stream not started yet) we just clear the spinner.
      const tapPrompt = setTimeout(() => {
        if (!cleanedUp && !hasPlayed && v.paused) {
          if (v.readyState >= 2) {
            console.warn('[player] 4 s passed, data ready, still paused — showing tap overlay')
            setNeedsTap(true)
          }
          setLoading(false)
        }
      }, 4000)

      return () => {
        cleanedUp = true
        clearTimeout(retryTimer)
        clearTimeout(tapPrompt)
        v.removeEventListener('canplay',    onCanPlay)
        v.removeEventListener('loadeddata', onCanPlay)
        v.removeEventListener('playing',    onPlaying)
        v.removeEventListener('pause',      onPause)
        v.removeEventListener('volumechange', onVolumeChange)
        v.removeEventListener('waiting',    onWaiting)
        v.removeEventListener('timeupdate', onTimeUpdate)
        clearStall()
        v.removeEventListener('error',      handleError)
        try { whepRef.current?.close() } catch {}
        whepRef.current = null
        v.srcObject = null
        try { v.src = '' } catch {}
      }

    } else if (Hls.isSupported()) {
      // ── hls.js (Chrome, Firefox, etc.) ────────────────────────────────
      // After a FATAL error hls.startLoad() does nothing — the instance is
      // dead. The only way to retry is to destroy it and create a fresh one.
      //
      // BUFFER STRATEGY — favour stability over latency.
      //
      // WHEP wins the race for true low-latency playback; HLS is only used
      // when WebRTC fails or as the long-term fallback. So the HLS path
      // doesn't need to chase the live edge — a bigger buffer absorbs network
      // hiccups (cellular drops, brief congestion) which were causing
      // mid-stream freezes for students.
      //
      //   lowLatencyMode:false  — disable LL-HLS edge-chasing on this fallback path.
      //   maxBufferLength: 30   — 30 s headroom for live (bumped from 20 after freezes
      //                            on cellular). 1080p ~5Mbps × 30s ≈ 19MB — fine on mobile.
      //   liveSyncDurationCount: 6 — start 6 segments behind edge (more headroom for jitter).
      //   liveMaxLatencyDurationCount: 14 — allow up to 14 segments of drift.
      //   maxBufferHole: 0.5    — auto-skip tiny gaps instead of stalling.
      //   nudgeMaxRetry: 10     — try nudging the media element past stalls.
      //   capLevelToPlayerSize:true — на 360px-плеере не качать 1080p; экономит
      //                                трафик и снижает шанс фриза из-за просадки сети.
      //   maxStarvationDelay:4  — если буфер пустеет, ABR быстрее даунгрейдит качество.
      let netFatalCount = 0
      const HLS_CFG = {
        lowLatencyMode:               false,
        backBufferLength:             live ? 30 : 90,
        maxBufferLength:              live ? 30 : 30,
        maxMaxBufferLength:           live ? 60 : 60,
        liveSyncDurationCount:        live ? 6  : undefined,
        liveMaxLatencyDurationCount:  live ? 14 : undefined,
        maxBufferHole:                0.5,
        highBufferWatchdogPeriod:     1,
        nudgeMaxRetry:                10,
        capLevelToPlayerSize:         true,
        maxStarvationDelay:           4,
        abrEwmaDefaultEstimate:       3_000_000,   // стартуем с 3 Mbps — хорошая точка для WiFi/4G; ABR опустит сам если нужно
        // Per-request retries before escalating to FATAL:
        manifestLoadingMaxRetry:      4,
        manifestLoadingRetryDelay:    1500,
        levelLoadingMaxRetry:         4,
        fragLoadingMaxRetry:          6,
        fragLoadingRetryDelay:        1000,
      }

      const createHlsInstance = () => {
        if (cleanedUp) return
        const h = new Hls(HLS_CFG)
        hlsRef.current = h
        h.loadSource(hlsSrc)
        h.attachMedia(v)

        h.on(Hls.Events.MANIFEST_PARSED, () => {
          netFatalCount = 0   // reset on success
          console.log('[player] hls.js manifest parsed — readyState:', v.readyState)
        })

        h.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return
          console.warn('[player] hls.js fatal:', data.type, data.details, '— attempt', netFatalCount + 1)

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            netFatalCount++
            // For live: never give up — manifest may appear once trainer starts.
            // For VOD: give up after 3 consecutive fatal network errors.
            if (live || netFatalCount <= 3) {
              const delay = Math.min(3000 * netFatalCount, 15000)
              console.log(`[player] hls.js destroying + recreating in ${delay}ms`)
              retryTimer = setTimeout(() => {
                if (cleanedUp || hasPlayed) return
                try { h.destroy() } catch {}
                createHlsInstance()
              }, delay)
            } else {
              if (!cleanedUp) setHardError(true)
              onError?.(data)
            }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try {
              h.recoverMediaError()
            } catch {
              if (!cleanedUp) setHardError(true)
            }
          } else {
            if (!cleanedUp) setHardError(true)
            onError?.(data)
          }
        })
      }

      createHlsInstance()

      return () => {
        cleanedUp = true
        clearTimeout(retryTimer)
        v.removeEventListener('canplay',    onCanPlay)
        v.removeEventListener('loadeddata', onCanPlay)
        v.removeEventListener('playing',    onPlaying)
        v.removeEventListener('pause',      onPause)
        v.removeEventListener('volumechange', onVolumeChange)
        v.removeEventListener('waiting',    onWaiting)
        v.removeEventListener('timeupdate', onTimeUpdate)
        clearStall()
        try { hlsRef.current?.destroy() } catch {}
        hlsRef.current = null
        try { whepRef.current?.close() } catch {}
        whepRef.current = null
        v.srcObject = null
      }

    } else {
      // Last-resort fallback
      const onErr = e => {
        if (!cleanedUp) { setHardError(true); onError?.(e) }
      }
      v.addEventListener('error', onErr)
      v.src = hlsSrc
      return () => {
        cleanedUp = true
        v.removeEventListener('canplay',    onCanPlay)
        v.removeEventListener('loadeddata', onCanPlay)
        v.removeEventListener('playing',    onPlaying)
        v.removeEventListener('pause',      onPause)
        v.removeEventListener('volumechange', onVolumeChange)
        v.removeEventListener('waiting',    onWaiting)
        v.removeEventListener('timeupdate', onTimeUpdate)
        clearStall()
        v.removeEventListener('error',      onErr)
        try { whepRef.current?.close() } catch {}
        whepRef.current = null
        v.srcObject = null
      }
    }
  }, [uid, subdomain, live, onError])

  if (!uid || !subdomain) return null

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoRef}
        className={className}
        autoPlay
        playsInline
        // Hide native controls while our "tap to start" overlay is active —
        // otherwise iOS shows a grey play button that visually competes.
        controls={!needsTap}
        controlsList="nodownload noremoteplayback nofullscreen"
        disablePictureInPicture={true}
      />

      {loading && !hardError && !needsTap && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="w-10 h-10 border-2 border-white/20 border-t-rose-400 rounded-full animate-spin" />
        </div>
      )}

      {/* ── Tap-to-start overlay ─────────────────────────────────────── */}
      {needsTap && !hardError && (
        <button
          type="button"
          // z-40 — above watermark (z-30) so click always reaches this button
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 cursor-pointer z-40"
          onClick={() => {
            const v = videoRef.current
            if (!v) return
            console.log('[player] tap — readyState:', v.readyState,
              'error:', v.error?.code ?? null, 'srcObject:', !!v.srcObject)

            // CRITICAL iOS rule: call v.play() FIRST (synchronously, in the gesture
            // handler) — this unlocks the media element even if it fails.
            // Only call v.load() AFTER play() finishes (in .catch), never before.
            // Calling v.load() before v.play() causes AbortError on Safari/iOS.
            // Force-unmute on tap — the user is explicitly asking to play, so
            // there is no autoplay-policy reason to keep us muted. The Unmute
            // pill (driven by audioMuted) still handles the cases where iOS
            // re-mutes us afterward (e.g. silent switch).
            try { v.muted = false; if (v.volume === 0) v.volume = 1 } catch {}
            setNeedsTap(false)
            setLoading(true)
            v.play()
              .then(() => {
                console.log('[player] tap-play succeeded muted:', v.muted)
                setNeedsTap(false)
                setLoading(false)
                setAudioMuted(v.muted || v.volume === 0)
              })
              .catch(err => {
                console.warn('[player] tap-play failed:', err?.name, err?.message)
                if (err?.name === 'NotAllowedError') {
                  // Browser still requires a gesture — show overlay again.
                  setNeedsTap(true)
                  setLoading(false)
                } else {
                  // NotSupportedError / AbortError — stream not loaded yet.
                  // Reset the video so the periodic retry can reload the source.
                  // Element is now "gesture-unlocked" for future auto-play attempts.
                  // Don't call v.load() if WHEP already set srcObject — that would clear it.
                  if (v.srcObject) {
                    setNeedsTap(false)
                    setLoading(true)
                  } else {
                    try { v.load() } catch {}   // re-trigger manifest load
                    setNeedsTap(false)
                    setLoading(true)            // keep spinner while we wait for stream
                  }
                }
              })
          }}
        >
          <div className="w-16 h-16 rounded-full bg-white/20 border-2 border-white/60 flex items-center justify-center mb-3">
            <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white" style={{ marginLeft: 3 }}>
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </div>
          <span className="text-white text-sm font-semibold">Нажмите для просмотра</span>
        </button>
      )}

      {/* ── Unmute affordance ────────────────────────────────────────────
          Some browsers (especially Safari and Chrome with autoplay policy)
          start the video element muted to allow autoplay. The student then
          watches a silent broadcast and assumes the trainer's mic is broken.
          This pill makes the issue explicit + one-tap fixable. It sits at
          z-50 so it floats above watermark, native controls, and the
          tap-to-start overlay. */}
      {audioMuted && !needsTap && !hardError && (
        <button
          type="button"
          onClick={() => {
            const v = videoRef.current
            if (!v) return
            try {
              v.muted = false
              if (v.volume === 0) v.volume = 1
              v.play().catch(() => {})
            } finally {
              setAudioMuted(v.muted || v.volume === 0)
            }
          }}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-2xl active:scale-95 transition"
        >
          {/* volume-x icon — no extra import needed */}
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
          Включить звук
        </button>
      )}

      {hardError && (
        <div className="absolute inset-0 flex items-center justify-center text-center px-6 bg-black/85 z-40">
          <div className="max-w-xs flex flex-col items-center gap-3">
            <p className="text-white text-sm font-semibold">Эфир временно недоступен</p>
            <p className="text-white/60 text-xs">Возможно тренер ещё подключается. Попробуйте ещё раз.</p>
            <button
              type="button"
              onClick={() => {
                const v = videoRef.current
                if (!v) return
                setHardError(false)
                setLoading(true)
                // Only reload HLS src if WHEP hasn't taken over
                if (!v.srcObject) {
                  try { v.load() } catch {}
                  v.play().catch(() => {})
                } else {
                  v.play().catch(() => {})
                }
              }}
              className="mt-1 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-sm font-semibold transition"
            >
              Повторить попытку
            </button>
          </div>
        </div>
      )}
    </div>
  )
})

export default CloudflareStreamPlayer
