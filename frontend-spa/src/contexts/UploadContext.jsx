import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import * as tus from 'tus-js-client'
import api from '../api/axios'

/**
 * Global upload manager for lessons.
 *
 * Why a global context?
 * The lesson upload modal lived inside LessonsAdmin, which meant closing the
 * modal or navigating to another page killed the React tree that owned the
 * upload state. The XHR/TUS request would technically survive, but the user
 * lost all visibility into progress / completion / failure.
 *
 * This provider hoists upload state to the root. UI components subscribe and
 * a floating dock (UploadDock) shows progress for any in-flight uploads,
 * regardless of what route is mounted. Closing the upload modal mid-upload
 * is now safe: the upload continues in the background and the dock keeps
 * the user informed.
 *
 * What survives:
 *   - Modal close, route navigation, modal of a different lesson.
 *
 * What does NOT survive:
 *   - Tab close: TUS/XHR is bound to the browser tab lifecycle. The dock
 *     registers a beforeunload guard while uploads are active.
 *   - Hard refresh: same as tab close.
 *
 * One upload entry per file:
 *   { id, title, lessonId?, progress, status, error?, abort?, createdAt }
 *
 * Status transitions:
 *   queued → uploading → finalizing → thumbnail → done
 *           ↘ failed (terminal)
 *           ↘ cancelled (terminal)
 */

const UploadContext = createContext(null)

export function useUploads() {
  const ctx = useContext(UploadContext)
  if (!ctx) throw new Error('useUploads must be used within <UploadProvider>')
  return ctx
}

const newId = () => `up_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`

export function UploadProvider({ children }) {
  const [uploads, setUploads] = useState([])
  // Refs to mutable per-upload control state (abort fns).
  // Live outside React state so updating them doesn't re-render every consumer.
  const controlsRef = useRef({})

  const update = useCallback((id, patch) => {
    setUploads(prev => prev.map(u => u.id === id ? { ...u, ...patch } : u))
  }, [])

  const removeUpload = useCallback((id) => {
    setUploads(prev => prev.filter(u => u.id !== id))
    delete controlsRef.current[id]
  }, [])

  const cancelUpload = useCallback((id) => {
    const ctl = controlsRef.current[id]
    try { ctl?.abort?.() } catch {}
    update(id, { status: 'cancelled', progress: 0 })
    // Auto-remove after a short delay so the user sees the state change
    setTimeout(() => removeUpload(id), 2500)
  }, [update, removeUpload])

  /**
   * startUpload(payload, callbacks)
   *
   * payload: { title, description, lesson_type, group_ids, file, thumbnailBlob? }
   * callbacks (optional):
   *   - onLessonCreated(lesson) — called once init returns; useful if caller
   *     wants to optimistically add a card to the list.
   *   - onComplete(lesson) — called on success.
   *   - onError(err) — called on terminal failure.
   *
   * Returns the upload id immediately (synchronous), so the caller can
   * close any modal without losing the handle.
   */
  const startUpload = useCallback((payload, callbacks = {}) => {
    const id = newId()
    const initial = {
      id,
      title:     payload.title,
      filename:  payload.file?.name || '',
      sizeBytes: payload.file?.size || 0,
      lessonId:  null,
      progress:  5,
      status:    'queued',
      stage:     'preparing',
      error:     null,
      createdAt: Date.now(),
    }
    setUploads(prev => [...prev, initial])

    // Fire async work but don't await — caller gets the id back synchronously.
    runUpload(id, payload, callbacks).catch(err => {
      console.warn('[upload] unexpected runUpload throw:', err)
    })

    return id
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Internal: the actual upload pipeline ─────────────────────────────────
  const runUpload = useCallback(async (id, payload, callbacks) => {
    const { title, description, lesson_type, group_ids, file, thumbnailBlob } = payload

    try {
      // Defensive: clear stale TUS fingerprints from prior failed uploads.
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i)
          if (k && k.startsWith('tus::')) localStorage.removeItem(k)
        }
      } catch {}

      update(id, { status: 'uploading', stage: 'init', progress: 5 })

      const init = await api.post('/education/lessons/upload-init/', {
        title:            title.trim(),
        description:      description?.trim() || '',
        lesson_type,
        groups:           group_ids,
        file_ext:         (file.name.split('.').pop() || '').toLowerCase(),
        max_duration_sec: 7200,  // 2h ceiling — covers lessons up to ~2 hours
      })
      const { lesson, upload } = init.data
      update(id, { lessonId: lesson.id, progress: 15 })
      callbacks.onLessonCreated?.(lesson)

      const onUploadProgress = (ratio) => {
        const pct = 15 + Math.round(ratio * 57)  // 15 → 72
        update(id, { progress: pct })
      }

      if (upload.kind === 'cf-direct') {
        // CF Stream TUS upload. Upload URL is now valid for 6 hours (set server-side),
        // so expiry mid-upload is rare. If it does happen (HEAD → 400), we fetch a
        // fresh URL and resume — tus-js-client will HEAD the new URL to find the
        // already-uploaded offset and continue from there, not from 0%.
        const runTusUpload = (uploadUrl) => new Promise((resolve, reject) => {
          const tusUpload = new tus.Upload(file, {
            uploadUrl,
            chunkSize:                   50 * 1024 * 1024,  // 50 MB chunks
            retryDelays:                 [0, 3000, 10000, 30000],  // 4 retries with backoff
            storeFingerprintForResuming: false,   // CF doesn't support cross-session resume
            removeFingerprintOnSuccess:  true,
            onProgress: (loaded, total) => {
              if (total) onUploadProgress(loaded / total)
            },
            onSuccess: resolve,
            onError:   reject,
          })
          controlsRef.current[id] = {
            abort: () => { try { tusUpload.abort(true) } catch {} },
          }
          tusUpload.start()
        })

        let tusAttempts = 0
        const MAX_REFRESH = 3
        const tryWithRefresh = async (uploadUrl) => {
          while (tusAttempts <= MAX_REFRESH) {
            try {
              await runTusUpload(uploadUrl)
              return  // success
            } catch (tusErr) {
              const msg = tusErr?.message || ''
              const isExpired = msg.includes('response code: 400') || msg.includes('unable to resume')
              if (isExpired && tusAttempts < MAX_REFRESH) {
                tusAttempts++
                console.warn(`[upload] TUS URL expired, refreshing (attempt ${tusAttempts}/${MAX_REFRESH})…`)
                update(id, { stage: 'refreshing' })
                const refreshed = await api.post(
                  `/education/lessons/${lesson.id}/refresh-upload-url/`,
                  { max_duration_sec: 7200 }
                )
                uploadUrl = refreshed.data.upload.url
              } else {
                throw tusErr
              }
            }
          }
        }
        await tryWithRefresh(upload.url)
      } else if (upload.kind === 'r2-presigned-put') {
        await xhrPut(upload.url, file, upload.content_type, onUploadProgress, (xhr) => {
          controlsRef.current[id] = { abort: () => { try { xhr.abort() } catch {} } }
        })
      } else {
        throw new Error(`Unknown upload kind: ${upload.kind}`)
      }

      update(id, { stage: 'finalizing', progress: 80 })
      await api.post(`/education/lessons/${lesson.id}/finalize/`, {})
      update(id, { progress: 88 })

      // Optional thumbnail upload — non-fatal. If thumbnail fails, lesson is
      // still saved; admin can re-attach manually from the card.
      if (lesson_type === 'video' && thumbnailBlob) {
        update(id, { stage: 'thumbnail', progress: 92 })
        try {
          const r = await api.post(`/education/lessons/${lesson.id}/thumbnail-upload-url/`)
          const put = await fetch(r.data.upload_url, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: thumbnailBlob,
          })
          if (put.ok) {
            await api.patch(`/education/lessons/${lesson.id}/metadata/`, {
              thumbnail_url: r.data.thumbnail_url,
            })
          }
        } catch (e) {
          console.warn('[upload] thumbnail step failed (non-fatal):', e)
        }
      }

      update(id, { status: 'done', stage: 'done', progress: 100 })
      callbacks.onComplete?.(lesson)

      // Auto-remove after a brief success display
      setTimeout(() => removeUpload(id), 4500)
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || 'Ошибка загрузки'
      console.warn('[upload] failed:', msg)
      update(id, { status: 'failed', error: msg })
      callbacks.onError?.(e)
      // Failed uploads stay in the dock until user dismisses — they need to
      // see WHY it failed before clearing.
    }
  }, [update, removeUpload])

  // beforeunload guard while any upload is active. Re-registered on each
  // change so handler closure always sees fresh state.
  const hasActive = uploads.some(u =>
    u.status === 'queued' || u.status === 'uploading' || u.status === 'finalizing'
  )

  return (
    <UploadContext.Provider value={{
      uploads,
      hasActive,
      startUpload,
      cancelUpload,
      removeUpload,
    }}>
      {children}
      {/* Tab-close guard. Internal navigation (SPA route change) keeps
          uploads alive, since the provider lives at the App root. */}
      <BeforeUnloadGuard enabled={hasActive} />
    </UploadContext.Provider>
  )
}

function BeforeUnloadGuard({ enabled }) {
  useEffect(() => {
    if (!enabled) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = 'Идёт загрузка урока. Если закрыть вкладку — загрузка прервётся.'
      return e.returnValue
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [enabled])
  return null
}

// ── Helpers ────────────────────────────────────────────────────────────────
function xhrPut(url, body, contentType, onProgress, registerControls) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    if (contentType) xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr)
      else reject(new Error(`Upload ${xhr.status}: ${xhr.responseText.slice(0, 200)}`))
    }
    xhr.onerror   = () => reject(new Error('Ошибка сети при загрузке'))
    xhr.ontimeout = () => reject(new Error('Таймаут загрузки'))
    registerControls?.(xhr)
    xhr.send(body)
  })
}
