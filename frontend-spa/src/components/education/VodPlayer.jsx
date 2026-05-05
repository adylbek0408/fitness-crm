import { useRef } from 'react'
import { MediaPlayer, MediaOutlet, MediaCommunitySkin } from '@vidstack/react'
import 'vidstack/styles/defaults.css'
import 'vidstack/styles/community-skin/video.css'

/**
 * VOD player built on @vidstack/react (community skin).
 *
 * Replaces the previous custom HlsPlayer for recorded lessons and
 * stream archives. Vidstack handles HLS via hls.js automatically when
 * the src ends in .m3u8, falls back to native playback otherwise.
 *
 * Props mirror the old HlsPlayer signature so call sites stay simple:
 *   src           — HLS manifest URL or R2 presigned MP4 URL
 *   kind          — 'hls' (default) | 'r2'
 *   poster        — optional poster URL
 *   autoPlay      — bool
 *   startAt       — resume position in seconds
 *   onTimeUpdate({position, duration, percent}) — fired ~every 0.5s
 *   onReady(player) — fired on canplay; receives MediaPlayerElement
 *   children      — overlay layers (Watermark) rendered on top of the skin
 */
export default function VodPlayer({
  src,
  kind = 'hls',
  poster = '',
  autoPlay = false,
  startAt = 0,
  onTimeUpdate,
  onReady,
  children,
}) {
  const playerRef = useRef(null)
  const lastEmittedRef = useRef(-10)
  const seekedRef = useRef(false)

  const source = kind === 'r2' ? { src, type: 'video/mp4' } : src

  const handleCanPlay = () => {
    const player = playerRef.current
    if (!player) return
    if (!seekedRef.current && startAt > 0) {
      try { player.currentTime = startAt } catch {}
      seekedRef.current = true
    }
    onReady?.(player)
  }

  const handleTimeUpdate = (e) => {
    if (!onTimeUpdate) return
    const currentTime = e?.detail?.currentTime ?? 0
    if (Math.abs(currentTime - lastEmittedRef.current) < 0.5) return
    lastEmittedRef.current = currentTime
    const duration = playerRef.current?.duration || 0
    const percent = duration > 0
      ? Math.min(100, Math.round((currentTime / duration) * 100))
      : 0
    onTimeUpdate({ position: currentTime, duration, percent })
  }

  return (
    <MediaPlayer
      ref={playerRef}
      src={source}
      poster={poster}
      autoplay={autoPlay}
      playsinline
      load="visible"
      onTimeUpdate={handleTimeUpdate}
      onCanPlay={handleCanPlay}
      onContextMenu={e => e.preventDefault()}
      className="block w-full h-full bg-black"
      style={{ '--media-brand': '#e11d48', '--media-focus-ring': '0 0 0 3px rgba(225,29,72,0.4)' }}
    >
      <MediaOutlet />
      <MediaCommunitySkin />
      {children}
    </MediaPlayer>
  )
}
