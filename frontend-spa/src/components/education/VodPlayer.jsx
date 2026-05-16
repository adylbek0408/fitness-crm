/**
 * VodPlayer — Vidstack 1.x  (PlyrLayout skin)
 *
 * Replaces the 0.6.x build that used the removed MediaOutlet / MediaCommunitySkin API.
 *
 * Props (same signature as before so all call-sites work unchanged):
 *   src               — HLS manifest URL or R2 presigned MP4 URL
 *   kind              — 'hls' (default) | 'r2'
 *   poster            — optional poster image URL
 *   autoPlay          — bool
 *   startAt           — resume position in seconds
 *   onTimeUpdate({position, duration, percent}) — fired ~every 0.5 s
 *   onReady(player)   — fired once video can play
 *   live              — bool: live HLS stream (hides scrubber)
 */
import { useRef } from 'react'
import { MediaPlayer, MediaProvider, isHLSProvider } from '@vidstack/react'
import { PlyrLayout, plyrLayoutIcons } from '@vidstack/react/player/layouts/plyr'
import Hls from 'hls.js'
import '@vidstack/react/player/styles/base.css'
import '@vidstack/react/player/styles/plyr/theme.css'
import './VodPlayer.css'
import Watermark from './Watermark'

export default function VodPlayer({
  src,
  kind = 'hls',
  poster = '',
  autoPlay = false,
  startAt = 0,
  onTimeUpdate,
  onReady,
  live = false,
  watermarkText = '',
  load = 'visible',
}) {
  const playerRef   = useRef(null)
  const seekedRef   = useRef(false)
  const lastEmitRef = useRef(-10)

  // Vidstack auto-detects HLS from .m3u8; for R2 MP4 we pass explicit type.
  const source = kind === 'r2' ? { src, type: 'video/mp4' } : src

  // ── Provider setup: inject bundled hls.js + quality pin ──────────────────
  const handleProviderChange = (provider) => {
    // v1.x passes the provider directly (not wrapped in event.detail)
    const p = provider?.detail ?? provider        // handle both shapes
    if (!isHLSProvider(p)) return
    p.library = Hls
    p.config = {
      capLevelToPlayerSize:    true,
      abrEwmaDefaultEstimate:  2_000_000,         // start at ~2 Mbps, ABR ramps up quickly
      startFragPrefetch:       true,              // prefetch first segment in parallel with manifest
      testBandwidth:           false,
      maxBufferLength:         30,
      maxMaxBufferLength:      60,
      maxStarvationDelay:      2,                 // downgrade quality fast on slow networks
    }
  }

  // ── Ensure volume is audible on first play ────────────────────────────────
  // Plyr persists volume in localStorage. If the student had previously muted
  // or set volume=0, every subsequent lesson opens silent. On mobile the
  // volume slider is hidden (CSS), so there was no way to recover.
  // We force volume=1 / unmuted on the first canPlay event only.
  const audioFixedRef = useRef(false)

  // ── Resume position ────────────────────────────────────────────────────────
  const handleCanPlay = () => {
    const player = playerRef.current
    if (!player) return
    if (!audioFixedRef.current) {
      audioFixedRef.current = true
      try {
        if (player.muted) player.muted = false
        if (player.volume === 0) player.volume = 1
      } catch {}
    }
    if (!seekedRef.current && startAt > 0) {
      try { player.currentTime = startAt } catch {}
      seekedRef.current = true
    }
    onReady?.(player)
  }

  // ── Progress callback (throttled to 0.5 s) ────────────────────────────────
  const handleTimeUpdate = (detail) => {
    if (!onTimeUpdate) return
    const currentTime = detail?.currentTime ?? detail?.detail?.currentTime ?? 0
    if (Math.abs(currentTime - lastEmitRef.current) < 0.5) return
    lastEmitRef.current = currentTime
    const duration = playerRef.current?.duration || 0
    const percent  = duration > 0
      ? Math.min(100, Math.round((currentTime / duration) * 100))
      : 0
    onTimeUpdate({ position: currentTime, duration, percent })
  }

  return (
    <MediaPlayer
      ref={playerRef}
      src={source}
      poster={poster}
      autoPlay={autoPlay}
      playsInline
      load={load}
      streamType={live ? 'live' : 'on-demand'}
      onProviderChange={handleProviderChange}
      onTimeUpdate={handleTimeUpdate}
      onCanPlay={handleCanPlay}
      onContextMenu={e => e.preventDefault()}
      className="vod-player w-full h-full"
    >
      <MediaProvider />
      <PlyrLayout
        icons={plyrLayoutIcons}
        displayDuration
      />
      {/* Watermark rendered AFTER PlyrLayout so it sits on top of all
          player UI in every stacking context including fullscreen. */}
      <Watermark text={watermarkText} />
    </MediaPlayer>
  )
}
