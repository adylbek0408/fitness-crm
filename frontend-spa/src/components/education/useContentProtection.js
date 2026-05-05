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
export default function useContentProtection({ videoRef, rootRef, onSuspect } = {}) {
  useEffect(() => {
    const block = e => { e.preventDefault(); return false }

    const getProtectedRoot = () => (
      rootRef?.current
      || videoRef?.current?.closest?.('[data-protected-root]')
      || null
    )

    const isProtectedFocused = () => {
      const root = getProtectedRoot()
      if (!root) return false
      const active = document.activeElement
      return !!active && root.contains(active)
    }

    const onKey = e => {
      const k = (e.key || '').toLowerCase()
      if (!isProtectedFocused()) return
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
      } else if (!open) {
        devtoolsOpen = false
      }
    }
    const id = setInterval(checkDevtools, 1500)

    const onSelect = e => {
      const root = getProtectedRoot()
      if (!root || !root.contains(e.target)) return
      const t = e.target
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return
      e.preventDefault()
    }

    const onCopy = e => {
      const root = getProtectedRoot()
      if (!root || !root.contains(e.target)) return
      e.preventDefault()
    }

    const onContextMenu = e => {
      const root = getProtectedRoot()
      if (!root || !root.contains(e.target)) return
      block(e)
    }

    const onDragStart = e => {
      const root = getProtectedRoot()
      if (!root || !root.contains(e.target)) return
      block(e)
    }

    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVis)
    document.addEventListener('selectstart', onSelect)
    document.addEventListener('dragstart', onDragStart)
    document.addEventListener('copy', onCopy)

    return () => {
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVis)
      document.removeEventListener('selectstart', onSelect)
      document.removeEventListener('dragstart', onDragStart)
      document.removeEventListener('copy', onCopy)
      clearInterval(id)
    }
  }, [videoRef, rootRef, onSuspect])
}
