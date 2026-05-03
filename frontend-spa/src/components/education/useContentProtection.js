import { useEffect } from 'react'

/**
 * Anti-piracy hardening for the cabinet video player.
 *
 * What we CAN do (defence-in-depth, all best-effort — true DRM requires
 * Widevine/PlayReady/FairPlay licensing which we don't have):
 *   - Block the right-click menu (no "Save video as…")
 *   - Block common save / print / view-source shortcuts (Ctrl+S/P/U,
 *     Ctrl+Shift+I/J/C/K, F12) on Windows AND Mac (Cmd equivalents)
 *   - Block Print Screen on Windows + try to wipe the clipboard
 *   - Detect DevTools open (window-size delta heuristic)
 *   - Pause the video when the tab goes to background or window loses focus
 *     (catches OBS / QuickTime starting to record)
 *   - Block drag-and-drop and text selection of the video element
 *   - Block clipboard `copy` events on the page
 *   - Emit `onSuspect(kind)` so the parent can show a warning + pause
 *
 * What we CANNOT do (browser sandbox limits):
 *   - Block OS-level screen recording (QuickTime, OBS, phone camera)
 *   - Block external screenshot tools running before page load
 *   - Block macOS Cmd+Shift+5 — the OS swallows this shortcut
 *
 * The real deterrent is the visible WATERMARK with the user's name/email
 * embedded into the player — see <Watermark/>. If a recording leaks,
 * the watermark identifies the source.
 */
export default function useContentProtection({ videoRef, onSuspect } = {}) {
  useEffect(() => {
    const block = e => { e.preventDefault(); return false }

    const onKey = e => {
      const k = (e.key || '').toLowerCase()
      // Print Screen — clear clipboard so any captured screenshot is wiped.
      // Note: only works if the page is focused; OS-level screenshot tools
      // bypass this entirely.
      if (k === 'printscreen') {
        try { navigator.clipboard?.writeText?.('') } catch {}
        onSuspect?.('printscreen')
        try { videoRef?.current?.pause?.() } catch {}
        return
      }
      // F12, Ctrl/Cmd + S/P/U, Ctrl/Cmd + Shift + I/J/C/K
      if (
        k === 'f12' ||
        ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'p' || k === 'u')) ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'i' || k === 'j' || k === 'c' || k === 'k'))
      ) {
        e.preventDefault()
        onSuspect?.('shortcut')
        try { videoRef?.current?.pause?.() } catch {}
      }
    }

    const onVis = () => {
      // Tab switched away — pause to thwart side-by-side recordings
      if (document.hidden) {
        try { videoRef?.current?.pause?.() } catch {}
      }
    }

    const onBlur = () => {
      // Window lost focus — could be a screen-recording app activating
      try { videoRef?.current?.pause?.() } catch {}
    }

    // DevTools detection — debounced so transient resizes don't false-positive
    let devtoolsOpen = false
    const checkDevtools = () => {
      const widthDelta = window.outerWidth - window.innerWidth
      const heightDelta = window.outerHeight - window.innerHeight
      // Threshold: docked DevTools shifts viewport by 200+ px
      const open = widthDelta > 200 || heightDelta > 200
      if (open && !devtoolsOpen) {
        devtoolsOpen = true
        onSuspect?.('devtools')
        try { videoRef?.current?.pause?.() } catch {}
      } else if (!open) {
        devtoolsOpen = false
      }
    }
    const id = setInterval(checkDevtools, 1500)

    // Block large text selections (limits page-source copy)
    const onSelect = e => {
      const t = e.target
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return
      e.preventDefault()
    }

    document.addEventListener('contextmenu', block)
    document.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', onBlur)
    document.addEventListener('selectstart', onSelect)
    document.addEventListener('dragstart', block)
    document.addEventListener('copy', block)

    return () => {
      document.removeEventListener('contextmenu', block)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('selectstart', onSelect)
      document.removeEventListener('dragstart', block)
      document.removeEventListener('copy', block)
      clearInterval(id)
    }
  }, [videoRef, onSuspect])
}
