import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Radio, Mic, Video, MicOff, VideoOff, Square } from 'lucide-react'
import api from '../../../api/axios'

/**
 * Browser-based live streaming via WebRTC (WHIP protocol → Cloudflare Stream).
 * Route: /admin/education/broadcast/:id
 *
 * No OBS needed. Works on mobile Chrome/Firefox.
 */
export default function BroadcastPage() {
  const { id } = useParams()
  const [stream, setStream] = useState(null)
  const [error, setError] = useState('')
  const [broadcasting, setBroadcasting] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [status, setStatus] = useState('idle') // idle | connecting | live | ended

  const localVideoRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)

  // Load stream info
  useEffect(() => {
    api.get('/education/streams/')
      .then(r => {
        const all = r.data?.results || r.data || []
        const found = all.find(s => s.id === id)
        if (found) setStream(found)
        else setError('Эфир не найден')
      })
      .catch(() => setError('Ошибка загрузки'))
  }, [id])

  const startBroadcast = async () => {
    if (!stream?.cf_webrtc_url) {
      setError('WebRTC URL не найден. Пересоздайте эфир.'); return
    }
    setError(''); setStatus('connecting')
    try {
      // Get camera + mic
      const local = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, frameRate: 30 },
        audio: true,
      })
      localStreamRef.current = local
      if (localVideoRef.current) localVideoRef.current.srcObject = local

      // Create peer connection
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] })
      pcRef.current = pc

      // Add tracks
      local.getTracks().forEach(t => pc.addTrack(t, local))

      // Create offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Wait for ICE gathering
      await new Promise(resolve => {
        if (pc.iceGatheringState === 'complete') { resolve(); return }
        const check = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', check); resolve() } }
        pc.addEventListener('icegatheringstatechange', check)
        setTimeout(resolve, 3000) // fallback
      })

      // Send offer to Cloudflare WHIP endpoint
      const resp = await fetch(stream.cf_webrtc_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription.sdp,
      })
      if (!resp.ok) throw new Error(`WHIP error: ${resp.status} ${await resp.text()}`)
      const answer = await resp.text()
      await pc.setRemoteDescription({ type: 'answer', sdp: answer })

      setBroadcasting(true)
      setStatus('live')
    } catch (e) {
      setError('Ошибка: ' + (e.message || e))
      setStatus('idle')
      localStreamRef.current?.getTracks().forEach(t => t.stop())
    }
  }

  const stopBroadcast = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    pcRef.current?.close()
    setBroadcasting(false)
    setStatus('ended')
    if (localVideoRef.current) localVideoRef.current.srcObject = null
  }

  const toggleMic = () => {
    const at = localStreamRef.current?.getAudioTracks()?.[0]
    if (at) { at.enabled = !at.enabled; setMicOn(at.enabled) }
  }
  const toggleCam = () => {
    const vt = localStreamRef.current?.getVideoTracks()?.[0]
    if (vt) { vt.enabled = !vt.enabled; setCamOn(vt.enabled) }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800">
        <Radio size={20} className="text-rose-400" />
        <h1 className="font-semibold text-lg">Трансляция из браузера</h1>
        {status === 'live' && (
          <span className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-600 text-sm font-bold">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> LIVE
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        {error && (
          <div className="w-full max-w-xl p-4 bg-rose-900/60 rounded-xl text-rose-200 text-sm">{error}</div>
        )}

        {stream && (
          <div className="text-center text-gray-300 text-sm">
            Эфир: <b className="text-white">{stream.title}</b>
          </div>
        )}

        {/* Preview */}
        <div className="w-full max-w-xl aspect-video bg-black rounded-2xl overflow-hidden relative shadow-2xl">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          {!broadcasting && status !== 'live' && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
              {status === 'ended' ? 'Трансляция завершена' : 'Предпросмотр появится после нажатия «Начать»'}
            </div>
          )}
          {!camOn && broadcasting && (
            <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
              <VideoOff size={48} className="text-gray-600" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          {broadcasting && (
            <>
              <button
                onClick={toggleMic}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition ${micOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-rose-600 hover:bg-rose-700'}`}
              >
                {micOn ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
              <button
                onClick={toggleCam}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition ${camOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-rose-600 hover:bg-rose-700'}`}
              >
                {camOn ? <Video size={20} /> : <VideoOff size={20} />}
              </button>
            </>
          )}

          {!broadcasting && status !== 'ended' && (
            <button
              onClick={startBroadcast}
              disabled={status === 'connecting' || !stream?.cf_webrtc_url}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 font-semibold text-lg transition"
            >
              <Radio size={20} />
              {status === 'connecting' ? 'Подключение…' : 'Начать трансляцию'}
            </button>
          )}

          {broadcasting && (
            <button
              onClick={stopBroadcast}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 font-semibold text-lg transition"
            >
              <Square size={20} /> Завершить
            </button>
          )}
        </div>

        {status === 'idle' && (
          <p className="text-gray-500 text-xs text-center max-w-md">
            Разрешите доступ к камере и микрофону. Трансляция идёт напрямую в Cloudflare Stream — студенты увидят её на странице «Эфир» в кабинете.
          </p>
        )}
        {status === 'ended' && (
          <p className="text-gray-400 text-sm">Трансляция завершена. Закройте эту вкладку.</p>
        )}
      </div>
    </div>
  )
}
