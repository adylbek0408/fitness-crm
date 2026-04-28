import { useEffect } from 'react'

/**
 * Anti-piracy hardening: blocks context menu, common save/print shortcuts,
 * detects DevTools by viewport delta, and pauses the player when the tab
 * goes to the background.
 *
 * Pass `onSuspect` to receive a "suspicious activity" event the page
 * can react to (pause video, show a warning).
 */
export default function useContentProtection({ videoRef, onSuspect } = {}) {
  useEffect(() => {
    const block = e => { e.preventDefault(); return false }
    const onKey = e => {
      const k = (e.key || '').toLowerCase()
      // Print Screen, Ctrl+S/P, F12, Ctrl+Shift+I/J/C
      if (
        k === 'printscreen' ||
        k === 'f12' ||
        (e.ctrlKey && (k === 's' || k === 'p' || k === 'u')) ||
        (e.ctrlKey && e.shiftKey && (k === 'i' || k === 'j' || k === 'c'))
      ) {
        e.preventDefault()
        onSuspect?.('shortcut')
        try { videoRef?.current?.pause?.() } catch {}
      }
    }
    const onVis = () => {
      if (document.hidden) {
        try { videoRef?.current?.pause?.() } catch {}
      }
    }
    const checkDevtools = () => {
      const open = window.outerHeight - window.innerHeight > 250
                || window.outerWidth - window.innerWidth > 250
      if (open) {
        onSuspect?.('devtools')
        try { videoRef?.current?.pause?.() } catch {}
      }
    }
    const id = setInterval(checkDevtools, 1500)

    document.addEventListener('contextmenu', block)
    document.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('contextmenu', block)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVis)
      clearInterval(id)
    }
  }, [videoRef, onSuspect])
}
