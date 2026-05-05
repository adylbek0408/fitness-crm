import { useRef } from 'react'
import { MediaPlayer, MediaOutlet, MediaCommunitySkin } from '@vidstack/react'
import Hls from 'hls.js'
import 'vidstack/styles/defaults.css'
import 'vidstack/styles/community-skin/video.css'
import './VodPlayer.css'

/**
 * VOD player built on @vidstack/react (community skin).
 *
 * Replaces the previous custom HlsPlayer for recorded lessons and
 * stream archives. Uses our bundled hls.js (not the CDN copy vidstack
 * loads by default) so playback works in CSP-locked envs and behind
 * unreliable networks.
 *
 * Quality is pinned to the highest available rendition on
 * MANIFEST_PARSED — admins explicitly asked for "100% sharp" instead
 * of the default ABR which starts low and ramps slowly. The user can
 * still drop quality manually via the community skin's quality menu.
 *
 * Props mirror the old HlsPlayer signature so call sites stay simple.
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

  const handleProviderChange = (event) => {
    const provider = event?.detail
    if (provider?.type !== 'hls') return
    // Use the bundled hls.js (avoids the default CDN fetch).
    provider.library = Hls
    // Override hls.js defaults — never cap quality by player size, give
    // ABR a high initial bandwidth estimate so the first segments are
    // already in HD instead of 360p, and skip the pre-roll bandwidth test.
    provider.config = {
      capLevelToPlayerSize: false,
      abrEwmaDefaultEstimate: 5_000_000,
      testBandwidth: false,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
    }
    provider.onInstance((hls) => {
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (Array.isArray(hls.levels) && hls.levels.length > 1) {
          // Pin to highest rendition. Quality menu still works — selecting
          // there sets currentLevel to a different value and overrides this.
          hls.currentLevel = hls.levels.length - 1
        }
      })
    })
  }

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
      onProviderChange={handleProviderChange}
      onTimeUpdate={handleTimeUpdate}
      onCanPlay={handleCanPlay}
      onContextMenu={e => e.preventDefault()}
      className="vod-player block w-full h-full bg-black"
      style={{ '--media-brand': '#e11d48', '--media-focus-ring': '0 0 0 3px rgba(225,29,72,0.4)' }}
    >
      <MediaOutlet />
      <MediaCommunitySkin />
      {children}
    </MediaPlayer>
  )
}
