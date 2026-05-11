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
  let swapped = false   // when true: guest is fullscreen, trainer is PIP
  let rvfcSupported = currentTrainer && typeof currentTrainer.requestVideoFrameCallback === 'function'

  // Helper: cover-fit a video element into a target rect with rounded corners.
  const drawVideoInRect = (vid, dx, dy, dw, dh, radius = 0, withBorder = false) => {
    if (!vid || vid.readyState < 2) {
      // Black placeholder
      ctx.save()
      if (radius) { ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, radius); ctx.clip() }
      ctx.fillStyle = '#000'
      ctx.fillRect(dx, dy, dw, dh)
      ctx.restore()
      return
    }
    const vw = vid.videoWidth || 1
    const vh = vid.videoHeight || 1
    const targetRatio = dw / dh
    const sourceRatio = vw / vh
    let sx = 0, sy = 0, sw = vw, sh = vh
    if (sourceRatio > targetRatio) {
      sw = vh * targetRatio; sx = (vw - sw) / 2
    } else {
      sh = vw / targetRatio; sy = (vh - sh) / 2
    }
    ctx.save()
    if (radius) { ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, radius); ctx.clip() }
    ctx.drawImage(vid, sx, sy, sw, sh, dx, dy, dw, dh)
    ctx.restore()
    if (withBorder) {
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.roundRect(dx, dy, dw, dh, radius)
      ctx.stroke()
      ctx.restore()
    }
  }

  // PIP geometry: 25% width, 16:9 ratio, bottom-right with margin
  const pipRect = () => {
    const gw = Math.round(width * 0.25)
    const gh = Math.round(gw * 9 / 16)
    const margin = Math.round(width * 0.025)
    return { gw, gh, gx: width - gw - margin, gy: height - gh - margin }
  }

  // ── Frame draw — no manual throttle; captureStream(fps) does the sampling. ──
  // The previous throttle (`if now - lastDraw < minFrameMs: skip`) produced
  // uneven cadence when source was 30fps and target was 20fps (drew at 0, 67,
  // 133, … → visible micro-jitter for the trainer alone, hidden once the
  // guest PIP added a second moving element to mask it). Drawing on every
  // rVFC tick is cheap (single drawImage + optional PIP) and lets captureStream
  // decimate to fps internally — output cadence is smooth.
  const drawAll = () => {
    if (!running) return
    const trainerVideo = currentTrainer
    const guestVideo   = currentGuest
    const hasGuest = !!(guestVideo && guestVideo.readyState >= 2 && !guestVideo.paused)

    // Decide composition: if swapped + we have a guest → guest big, trainer PIP.
    // Otherwise → trainer big (with optional guest PIP).
    const guestBig = swapped && hasGuest
    const bigSource   = guestBig ? guestVideo   : trainerVideo
    const smallSource = guestBig ? trainerVideo : (hasGuest ? guestVideo : null)

    // Fullscreen layer
    if (bigSource && bigSource.readyState >= 2) {
      drawVideoInRect(bigSource, 0, 0, width, height, 0, false)
    } else {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)
    }

    // PIP layer
    if (smallSource) {
      const { gw, gh, gx, gy } = pipRect()
      // shadow
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.beginPath()
      ctx.roundRect(gx + 2, gy + 4, gw, gh, 16)
      ctx.fill()
      ctx.restore()
      drawVideoInRect(smallSource, gx, gy, gw, gh, 16, true)
    }

    // Schedule next frame — prefer rVFC on the *currently big* source so we
    // redraw whenever its frames arrive. If big has rVFC, hook it; otherwise
    // fall back to rAF (~60fps, captureStream still decimates).
    if (bigSource && typeof bigSource.requestVideoFrameCallback === 'function') {
      try { bigSource.requestVideoFrameCallback(drawAll); return } catch {}
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
  // Swap composition: when true, guest takes the fullscreen slot and trainer
  // goes into the PIP. The change is reflected in everything fed by this
  // canvas — WHIP stream to viewers AND the local MediaRecorder archive — so
  // the recording matches what the trainer chose to show during the broadcast.
  const setSwapped = (v) => { swapped = !!v }

  return { canvas, stream, stop, setGuestVideo, setTrainerVideo, setSwapped }
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
