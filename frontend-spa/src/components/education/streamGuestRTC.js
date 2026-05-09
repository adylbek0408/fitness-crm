/**
 * streamGuestRTC.js — WebRTC P2P helpers for "guest on stage" feature.
 *
 * Architecture:
 *   1. Trainer broadcasts to Cloudflare via WHIP (existing).
 *   2. When guest accepts invite, trainer ⇄ guest open a separate P2P PC.
 *   3. Trainer mixes (camera + guest's video) onto a Canvas, mixes audio
 *      via Web Audio API, then `replaceTrack`s on the WHIP sender — so
 *      every viewer sees both, and Cloudflare records the composite.
 *
 * Phone-first optimisations:
 *   - PIP layout (small guest in bottom-right, ~25% width)
 *   - requestVideoFrameCallback: redraws only on new video frames
 *   - canvas alpha=false
 *   - replaceTrack on existing PC (no renegotiation with CF)
 *   - Web Audio mixing (hardware-accelerated)
 *   - When no guest, raw camera track flows directly (zero canvas overhead)
 */

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
]

// ── Canvas mixer ────────────────────────────────────────────────────────────

/**
 * Builds a canvas that draws trainer's video full-frame + (optional) guest in PIP.
 * Returns { canvas, stream, stop, setGuestVideo, setTrainerVideo }.
 *
 * `guestVideo` is optional. Use `setGuestVideo(elOrNull)` to attach/detach a
 * guest stream after creation. The canvas keeps drawing — replaceTrack on the
 * WHIP sender / MediaRecorder is unnecessary, since both are already wired to
 * `mixer.stream` and pick up the new layout automatically.
 */
export function createMixerCanvas({ trainerVideo, guestVideo, width = 1280, height = 720, fps = 24 }) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
  // initial fill so MediaRecorder/captureStream gets data immediately
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  let running = true
  let currentTrainer = trainerVideo
  let currentGuest = guestVideo || null
  let rvfcSupported = currentTrainer && typeof currentTrainer.requestVideoFrameCallback === 'function'
  let lastDraw = 0
  const minFrameMs = 1000 / fps

  const drawPip = () => {
    const guestVideo = currentGuest
    // PIP: 25% width, 16:9 ratio, bottom-right with margin
    const gw = Math.round(width * 0.25)
    const gh = Math.round(gw * 9 / 16)
    const margin = Math.round(width * 0.025)
    const gx = width - gw - margin
    const gy = height - gh - margin
    const r = 16

    if (guestVideo && guestVideo.readyState >= 2 && !guestVideo.paused) {
      // shadow
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.beginPath()
      ctx.roundRect(gx + 2, gy + 4, gw, gh, r)
      ctx.fill()
      ctx.restore()

      // clipped guest video
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(gx, gy, gw, gh, r)
      ctx.clip()
      ctx.fillStyle = '#000'
      ctx.fill()
      // Cover-fit guest video into target rect
      const vw = guestVideo.videoWidth || 1
      const vh = guestVideo.videoHeight || 1
      const targetRatio = gw / gh
      const sourceRatio = vw / vh
      let sx = 0, sy = 0, sw = vw, sh = vh
      if (sourceRatio > targetRatio) {
        // crop horizontally
        sw = vh * targetRatio
        sx = (vw - sw) / 2
      } else {
        // crop vertically
        sh = vw / targetRatio
        sy = (vh - sh) / 2
      }
      ctx.drawImage(guestVideo, sx, sy, sw, sh, gx, gy, gw, gh)
      ctx.restore()

      // border
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.roundRect(gx, gy, gw, gh, r)
      ctx.stroke()
      ctx.restore()
    }
  }

  const drawAll = (now = performance.now()) => {
    if (!running) return
    const trainerVideo = currentTrainer
    if (now - lastDraw < minFrameMs) {
      // throttle
      if (rvfcSupported && trainerVideo) {
        try { trainerVideo.requestVideoFrameCallback(drawAll); return } catch {}
      }
      requestAnimationFrame(drawAll); return
    }
    lastDraw = now

    if (trainerVideo && trainerVideo.readyState >= 2) {
      // Cover-fit trainer (object-cover behaviour)
      const vw = trainerVideo.videoWidth || width
      const vh = trainerVideo.videoHeight || height
      const targetRatio = width / height
      const sourceRatio = vw / vh
      let sx = 0, sy = 0, sw = vw, sh = vh
      if (sourceRatio > targetRatio) {
        sw = vh * targetRatio; sx = (vw - sw) / 2
      } else {
        sh = vw / targetRatio; sy = (vh - sh) / 2
      }
      ctx.drawImage(trainerVideo, sx, sy, sw, sh, 0, 0, width, height)
    } else {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)
    }

    drawPip()

    if (rvfcSupported && trainerVideo) {
      try { trainerVideo.requestVideoFrameCallback(drawAll); return } catch {}
    }
    requestAnimationFrame(drawAll)
  }

  // Polyfill roundRect for older browsers (Safari < 16)
  if (typeof CanvasRenderingContext2D.prototype.roundRect !== 'function') {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const radius = typeof r === 'number' ? r : 0
      this.moveTo(x + radius, y)
      this.lineTo(x + w - radius, y)
      this.quadraticCurveTo(x + w, y, x + w, y + radius)
      this.lineTo(x + w, y + h - radius)
      this.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
      this.lineTo(x + radius, y + h)
      this.quadraticCurveTo(x, y + h, x, y + h - radius)
      this.lineTo(x, y + radius)
      this.quadraticCurveTo(x, y, x + radius, y)
    }
  }

  drawAll()

  const stream = canvas.captureStream(fps)
  const stop = () => { running = false }
  const setGuestVideo = (el) => { currentGuest = el || null }
  const setTrainerVideo = (el) => {
    currentTrainer = el
    rvfcSupported = el && typeof el.requestVideoFrameCallback === 'function'
  }

  return { canvas, stream, stop, setGuestVideo, setTrainerVideo }
}

// ── Audio mixer (Web Audio API) ─────────────────────────────────────────────

/**
 * Always-on audio mixer. Trainer audio is required at creation. Guest audio
 * can be added/removed dynamically via the returned methods, and the trainer
 * source can be swapped (used during flip-camera) without rebuilding the
 * destination track — so MediaRecorder and WHIP keep working.
 *
 * Signature is overloaded for backwards compatibility:
 *   createAudioMixer(trainerStream)                 — preferred
 *   createAudioMixer(trainerStream, guestStream)    — legacy 2-arg form
 */
export function createAudioMixer(trainerStream, guestStream) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return null
  const audioCtx = new AudioCtx()
  const dest = audioCtx.createMediaStreamDestination()

  let trainerSrc = audioCtx.createMediaStreamSource(trainerStream)
  trainerSrc.connect(dest)

  let guestSrc = null
  if (guestStream) {
    try {
      guestSrc = audioCtx.createMediaStreamSource(guestStream)
      guestSrc.connect(dest)
    } catch {}
  }

  // iOS Safari suspends AudioContext when the tab is backgrounded — the
  // mixed track then carries silence and the recording goes mute.
  // Resume the context whenever we come back to the foreground.
  const onVisibility = () => {
    if (!document.hidden && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  const addGuest = (s) => {
    if (!s) return
    try { guestSrc?.disconnect() } catch {}
    try {
      guestSrc = audioCtx.createMediaStreamSource(s)
      guestSrc.connect(dest)
    } catch {}
  }
  const removeGuest = () => {
    try { guestSrc?.disconnect() } catch {}
    guestSrc = null
  }
  const replaceTrainer = (s) => {
    if (!s) return
    try { trainerSrc.disconnect() } catch {}
    try {
      trainerSrc = audioCtx.createMediaStreamSource(s)
      trainerSrc.connect(dest)
    } catch {}
  }

  const close = () => {
    try { document.removeEventListener('visibilitychange', onVisibility) } catch {}
    try { trainerSrc.disconnect() } catch {}
    try { guestSrc?.disconnect() } catch {}
    try { audioCtx.close() } catch {}
  }

  return {
    audioCtx,
    mixedTrack: dest.stream.getAudioTracks()[0],
    addGuest, removeGuest, replaceTrainer, close,
  }
}

// ── Trainer-side P2P (offerer) ──────────────────────────────────────────────

/**
 * Trainer creates a P2P PC, sends camera/mic to guest, receives guest's tracks.
 * Returns { pc, remoteStream, close }.
 *
 * @param {object} opts
 * @param {MediaStream} opts.localStream  — trainer's getUserMedia stream
 * @param {function} opts.postOffer       — (sdp) => Promise
 * @param {function} opts.postIce         — (candidate) => Promise
 * @param {function} opts.poll            — () => Promise<{answer_sdp, guest_ice}>
 * @param {function} opts.onConnected     — () => void (called when track flows)
 * @param {function} opts.onRemoteStream  — (MediaStream) => void
 */
export async function startTrainerP2P({
  localStream, postOffer, postIce, poll, onConnected, onRemoteStream, onFailed,
  iceServers,
}) {
  const pc = new RTCPeerConnection({ iceServers: iceServers || DEFAULT_ICE_SERVERS })
  let pollTimer = null
  let appliedAnswer = false
  const appliedIceSet = new Set()

  // Send local tracks to guest
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream))

  // Receive guest tracks. We must use BOTH e.track and e.streams[0] —
  // some browsers (notably Safari on iOS) fire 'track' with empty `streams`
  // array, and we'd lose the track. Notify on every event so the consumer
  // re-binds the latest stream to its <video> element.
  const remoteStream = new MediaStream()
  pc.addEventListener('track', (e) => {
    console.log('[trainer P2P] ontrack:', e.track?.kind, 'streams:', e.streams?.length)
    if (e.streams && e.streams[0]) {
      e.streams[0].getTracks().forEach(t => {
        if (!remoteStream.getTracks().some(rt => rt.id === t.id)) remoteStream.addTrack(t)
      })
    } else if (e.track) {
      if (!remoteStream.getTracks().some(rt => rt.id === e.track.id)) remoteStream.addTrack(e.track)
    }
    onRemoteStream?.(remoteStream)
  })

  pc.addEventListener('icecandidate', (e) => {
    if (e.candidate) {
      postIce(e.candidate.toJSON()).catch(() => {})
    }
  })

  pc.addEventListener('iceconnectionstatechange', () => {
    console.log('[trainer P2P] ice:', pc.iceConnectionState)
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      onConnected?.()
    }
    if (pc.iceConnectionState === 'failed') onFailed?.()
  })

  // Create offer
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  await postOffer(offer.sdp)

  // Poll for answer + guest ICE
  const tick = async () => {
    try {
      const data = await poll()
      if (!appliedAnswer && data.answer_sdp) {
        try {
          await pc.setRemoteDescription({ type: 'answer', sdp: data.answer_sdp })
          appliedAnswer = true
        } catch (e) { console.warn('[trainer P2P] setRemoteDescription:', e) }
      }
      if (appliedAnswer && Array.isArray(data.guest_ice)) {
        for (const c of data.guest_ice) {
          const key = JSON.stringify(c)
          if (appliedIceSet.has(key)) continue
          appliedIceSet.add(key)
          try { await pc.addIceCandidate(c) } catch {}
        }
      }
    } catch {}
  }
  pollTimer = setInterval(tick, 1500)
  tick()

  const close = () => {
    clearInterval(pollTimer)
    try { pc.getSenders().forEach(s => s.track && s.track.stop && null) } catch {}
    try { pc.close() } catch {}
  }

  return { pc, remoteStream, close }
}

// ── Guest-side P2P (answerer) ───────────────────────────────────────────────

export async function startGuestP2P({
  localStream, poll, postAnswer, postIce, onConnected, onRemoteStream, onFailed,
  iceServers,
}) {
  const pc = new RTCPeerConnection({ iceServers: iceServers || DEFAULT_ICE_SERVERS })
  let pollTimer = null
  let appliedOffer = false
  let answered = false
  const appliedIceSet = new Set()

  // Send our camera/mic to trainer
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream))

  // Receive trainer's tracks (so we hear/see the trainer in real-time).
  // Same Safari-iOS robustness as the trainer side: handle empty streams[].
  const remoteStream = new MediaStream()
  pc.addEventListener('track', (e) => {
    console.log('[guest P2P] ontrack:', e.track?.kind, 'streams:', e.streams?.length)
    if (e.streams && e.streams[0]) {
      e.streams[0].getTracks().forEach(t => {
        if (!remoteStream.getTracks().some(rt => rt.id === t.id)) remoteStream.addTrack(t)
      })
    } else if (e.track) {
      if (!remoteStream.getTracks().some(rt => rt.id === e.track.id)) remoteStream.addTrack(e.track)
    }
    onRemoteStream?.(remoteStream)
  })

  pc.addEventListener('icecandidate', (e) => {
    if (e.candidate) postIce(e.candidate.toJSON()).catch(() => {})
  })

  pc.addEventListener('iceconnectionstatechange', () => {
    console.log('[guest P2P] ice:', pc.iceConnectionState)
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      onConnected?.()
    }
    if (pc.iceConnectionState === 'failed') onFailed?.()
  })

  const tick = async () => {
    try {
      const data = await poll()
      if (!appliedOffer && data.offer_sdp) {
        await pc.setRemoteDescription({ type: 'offer', sdp: data.offer_sdp })
        appliedOffer = true
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await postAnswer(answer.sdp)
        answered = true
      }
      if (appliedOffer && answered && Array.isArray(data.trainer_ice)) {
        for (const c of data.trainer_ice) {
          const key = JSON.stringify(c)
          if (appliedIceSet.has(key)) continue
          appliedIceSet.add(key)
          try { await pc.addIceCandidate(c) } catch {}
        }
      }
    } catch {}
  }
  pollTimer = setInterval(tick, 1500)
  tick()

  const close = () => {
    clearInterval(pollTimer)
    try { pc.close() } catch {}
  }

  return { pc, remoteStream, close }
}
