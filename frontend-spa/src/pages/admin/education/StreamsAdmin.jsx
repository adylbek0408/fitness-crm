import { useEffect, useRef, useState } from 'react'
import {
  Radio, Copy, Square, Plus, Link2, Check,
  Users, MessageCircle, ExternalLink, AlertCircle, Trash2,
  Eye, X, BookMarked,
} from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import api from '../../../api/axios'
import AdminLayout from '../../../components/AdminLayout'
import AlertModal from '../../../components/AlertModal'
import ConfirmModal from '../../../components/ConfirmModal'
import Pagination from '../../../components/Pagination'
import HlsPlayer from '../../../components/education/HlsPlayer'

const STREAMS_PAGE_SIZE = 12

export default function StreamsAdmin() {
  const { user } = useOutletContext()
  const [streams, setStreams] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', group_ids: [] })
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState('')
  const [alertModal, setAlertModal] = useState(null)
  const [confirmEnd, setConfirmEnd] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  // Preview
  const [previewInfo, setPreviewInfo] = useState(null)
  const [previewTitle, setPreviewTitle] = useState('')
  // Archive polling — when admin clicks "Создать архив", auto-retry every 15s
  // and show progress instead of a one-shot "wait 5-10 minutes" error.
  const [archiveJob, setArchiveJob] = useState(null) // {id, title, attempt, lastMsg, status}
  // Refs survive across closures — needed so the "cancel" button actually
  // stops the polling loop, and so we can clear pending timeouts on unmount.
  const archiveCancelledRef = useRef(false)
  const archiveTimerRef = useRef(null)

  const reload = () => {
    setLoading(true)
    api.get(`/education/streams/?page=${page}&page_size=${STREAMS_PAGE_SIZE}`)
      .then(r => {
        // DRF paginated response: {count, next, previous, results}.
        // Non-paginated fallback for small/dev datasets.
        if (Array.isArray(r.data)) {
          setStreams(r.data)
          setTotalCount(r.data.length)
        } else {
          setStreams(r.data?.results || [])
          setTotalCount(r.data?.count ?? 0)
        }
      })
      .catch(e => setAlertModal({
        title: 'Не удалось загрузить эфиры',
        message: e.response?.data?.detail || e.message || 'Проверьте соединение.',
        variant: 'error',
      }))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  useEffect(() => {
    api.get('/groups/?page_size=200')
      .then(r => setGroups(r.data?.results || r.data || []))
      .catch(() => {})
  }, [])

  const totalPages = Math.max(1, Math.ceil(totalCount / STREAMS_PAGE_SIZE))

  const create = async () => {
    if (!form.title.trim()) {
      setAlertModal({ title: 'Заполните название', message: 'Без названия эфир не создать.', variant: 'error' })
      return
    }
    if (form.group_ids.length === 0) {
      setAlertModal({
        title: 'Выберите хотя бы одну группу',
        message: 'Эфир увидят только те ученики, у которых есть доступ.',
        variant: 'error',
      })
      return
    }
    setCreating(true)
    try {
      await api.post('/education/streams/', {
        title: form.title.trim(),
        description: '',
        groups: form.group_ids,
      })
      setForm({ title: '', group_ids: [] })
      setShowForm(false)
      reload()
    } catch (e) {
      setAlertModal({
        title: 'Не удалось создать эфир',
        message: e.response?.data?.detail || e.message || 'Возможно, не настроен Cloudflare Stream.',
        variant: 'error',
      })
    } finally {
      setCreating(false)
    }
  }

  const performEnd = async () => {
    if (!confirmEnd) return
    try {
      await api.post(`/education/streams/${confirmEnd.id}/end/`)
      setConfirmEnd(null)
      reload()
    } catch (e) {
      setConfirmEnd(null)
      setAlertModal({ title: 'Ошибка', message: e.response?.data?.detail || 'Не удалось завершить.', variant: 'error' })
    }
  }

  const performDelete = async () => {
    if (!confirmDelete) return
    try {
      await api.delete(`/education/streams/${confirmDelete.id}/`)
      setConfirmDelete(null)
      reload()
    } catch (e) {
      setConfirmDelete(null)
      setAlertModal({ title: 'Ошибка', message: e.response?.data?.detail || e.message, variant: 'error' })
    }
  }

  // Auto-retry archive: keep trying every 15s for up to 10 minutes. Show
  // live diagnostic from CF so admin understands what's happening.
  const performManualArchive = async (id, title = '') => {
    // Reset cancellation state for a fresh job
    archiveCancelledRef.current = false
    if (archiveTimerRef.current) {
      clearTimeout(archiveTimerRef.current)
      archiveTimerRef.current = null
    }
    setArchiveJob({ id, title, attempt: 1, status: 'working', lastMsg: 'Запрашиваем у Cloudflare…' })
    let attempt = 0
    const MAX_ATTEMPTS = 40 // 40 × 15s = 10 minutes
    const tryOnce = async () => {
      if (archiveCancelledRef.current) return
      attempt += 1
      try {
        // First, query CF status — gives us a real picture of what's available
        const cfResp = await api.get(`/education/streams/${id}/cf-status/`).catch(() => null)
        if (archiveCancelledRef.current) return
        const cf = cfResp?.data || {}
        let progressMsg = ''
        if (cf.live_input_state === 'connected') {
          progressMsg = 'Эфир ещё идёт в CF — дождитесь окончания.'
        } else if (cf.recordings_count === 0) {
          progressMsg = 'Cloudflare не получил видео. Проверьте что эфир был на HTTPS.'
        } else if (cf.has_ready_recording) {
          progressMsg = 'Запись готова — публикуем…'
        } else {
          // Has recordings but none ready yet
          const states = (cf.recordings || []).map(r => r.state || '?').join(', ')
          progressMsg = `Cloudflare обрабатывает запись (${states}). Обычно 1–3 минуты.`
        }
        setArchiveJob(j => j ? { ...j, attempt, lastMsg: progressMsg } : j)

        // Try to publish
        await api.post(`/education/streams/${id}/manual-archive/`)
        if (archiveCancelledRef.current) return
        setArchiveJob({ id, title, attempt, status: 'done', lastMsg: 'Архив создан ✓' })
        reload()
        // Auto-close after 1.5s
        archiveTimerRef.current = setTimeout(() => {
          if (!archiveCancelledRef.current) setArchiveJob(null)
        }, 1500)
      } catch (e) {
        if (archiveCancelledRef.current) return
        const msg = e.response?.data?.detail || e.message || 'Ошибка'
        if (attempt >= MAX_ATTEMPTS) {
          setArchiveJob({ id, title, attempt, status: 'failed', lastMsg: msg })
          return
        }
        setArchiveJob(j => j ? { ...j, attempt, lastMsg: msg } : j)
        archiveTimerRef.current = setTimeout(tryOnce, 15000)
      }
    }
    tryOnce()
  }

  // Hard-cancel the polling loop and dismiss the modal.
  // Without setting the ref, queued setTimeouts keep firing in the background
  // and surprise the admin with "Архив создан" toasts after they closed it.
  const cancelArchiveJob = () => {
    archiveCancelledRef.current = true
    if (archiveTimerRef.current) {
      clearTimeout(archiveTimerRef.current)
      archiveTimerRef.current = null
    }
    setArchiveJob(null)
  }

  // Clean up any pending timer when the page unmounts.
  useEffect(() => () => {
    archiveCancelledRef.current = true
    if (archiveTimerRef.current) clearTimeout(archiveTimerRef.current)
  }, [])

  const openRecordingPreview = async (lessonId, title) => {
    try {
      const r = await api.get(`/education/lessons/${lessonId}/preview/`)
      setPreviewInfo(r.data)
      setPreviewTitle(title)
    } catch (e) {
      setAlertModal({ title: 'Ошибка', message: e.response?.data?.detail || e.message, variant: 'error' })
    }
  }

  const copy = (text, key) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(''), 2000)
    })
  }

  const studentLink = (id) => `${window.location.origin}/cabinet/stream?id=${id}`

  // Counts on the CURRENT page only — backend returns the active page slice.
  // Total across all pages comes from `totalCount`.
  const summary = {
    live: streams.filter(s => s.status === 'live').length,
    scheduled: streams.filter(s => s.status === 'scheduled').length,
    archived: streams.filter(s => ['ended', 'archived'].includes(s.status)).length,
  }

  return (
    <AdminLayout user={user}>
        {/* Compact header */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4 sm:mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center text-white shadow-md shrink-0">
              <Radio size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">Эфиры</h1>
              <p className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                <span className="text-rose-600 font-semibold">{summary.live} live</span>
                <span className="text-gray-300">·</span>
                <span><span className="font-semibold text-gray-700">{summary.scheduled}</span> готовы</span>
                <span className="text-gray-300">·</span>
                <span><span className="font-semibold text-gray-700">{summary.archived}</span> архив</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white font-semibold shadow-md hover:shadow-lg transition focus:outline-none focus:ring-2 focus:ring-rose-300"
          >
            <Plus size={18} /> Новый эфир
          </button>
        </div>

        {/* Create modal */}
        {showForm && (
          <StreamCreateModal
            form={form}
            setForm={setForm}
            groups={groups}
            creating={creating}
            onClose={() => { setShowForm(false); setForm({ title: '', group_ids: [] }) }}
            onSubmit={create}
          />
        )}

        {/* Stream list */}
        <div className="space-y-4">
          {loading && (
            <div className="p-8 text-center text-gray-400">
              <div className="w-8 h-8 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin mx-auto mb-2" />
              Загрузка эфиров…
            </div>
          )}

          {!loading && streams.length === 0 && (
            <div className="bg-white rounded-3xl border border-rose-100 shadow-sm py-16 text-center">
              <Radio size={48} className="mx-auto text-rose-200 mb-3" />
              <p className="text-gray-500 font-medium">Эфиров ещё нет</p>
              <p className="text-xs text-gray-400 mt-1">Нажмите «Новый эфир» — заполните форму.</p>
            </div>
          )}

          {streams.map(s => (
            <StreamCard
              key={s.id}
              stream={s}
              onEnd={() => setConfirmEnd({ id: s.id, title: s.title })}
              onDelete={() => setConfirmDelete({ id: s.id, title: s.title })}
              onManualArchive={() => performManualArchive(s.id, s.title)}
              onPreviewRecording={() => openRecordingPreview(s.archived_lesson, s.title)}
              onCopy={copy}
              copied={copied}
              studentLink={studentLink(s.id)}
            />
          ))}

          {/* Pagination — visible only when there's more than one page */}
          {totalPages > 1 && (
            <div className="pt-2 pb-4">
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
              <p className="text-center text-xs text-gray-400 mt-2">
                Всего эфиров: {totalCount}
              </p>
            </div>
          )}
        </div>

      {/* Recording preview modal */}
      {previewInfo && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPreviewInfo(null)}>
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-rose-100">
              <div>
                <h3 className="font-semibold text-lg">{previewTitle}</h3>
                <p className="text-sm text-gray-500">Запись эфира</p>
              </div>
              <button onClick={() => setPreviewInfo(null)} className="p-2 rounded-xl hover:bg-rose-50">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              {!previewInfo.playback_url ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-4">
                  <AlertCircle size={40} className="text-amber-400" />
                  <div className="text-sm text-center space-y-1.5 max-w-sm">
                    <p className="font-medium text-gray-700">Видеозапись ещё не готова</p>
                    <p className="text-xs text-gray-400">
                      Cloudflare Stream обрабатывает запись — обычно 5–15 минут после завершения эфира.
                    </p>
                    <p className="text-xs text-amber-600 font-medium">
                      Если запись так и не появилась — закройте это окно и нажмите «Создать архив» на карточке эфира.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="aspect-video bg-black rounded-2xl overflow-hidden">
                  <HlsPlayer
                    src={previewInfo.playback_url}
                    kind={previewInfo.video_kind || 'hls'}
                    autoPlay
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <AlertModal
        open={!!alertModal}
        onClose={() => setAlertModal(null)}
        title={alertModal?.title || ''}
        message={alertModal?.message || ''}
        variant={alertModal?.variant || 'info'}
      />
      <ConfirmModal
        open={!!confirmEnd}
        onClose={() => setConfirmEnd(null)}
        onConfirm={performEnd}
        title="Завершить эфир?"
        message={confirmEnd ? `Эфир «${confirmEnd.title}» будет закрыт. Зрители больше не смогут к нему подключиться.` : ''}
        confirmText="Завершить"
        variant="danger"
      />
      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={performDelete}
        title="Удалить эфир?"
        message={confirmDelete ? `Эфир «${confirmDelete.title}» переместится в корзину. Восстановить можно из раздела «Корзина».` : ''}
        confirmText="В корзину"
        variant="danger"
      />

      {/* Archive progress modal — auto-polls until ready */}
      {archiveJob && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-3">
              {archiveJob.status === 'working' && (
                <div className="w-10 h-10 border-3 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
              )}
              {archiveJob.status === 'done' && (
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl">✓</div>
              )}
              {archiveJob.status === 'failed' && (
                <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xl">!</div>
              )}
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {archiveJob.status === 'done'
                    ? 'Архив создан'
                    : archiveJob.status === 'failed'
                      ? 'Не удалось создать архив'
                      : 'Создаём архив…'}
                </h3>
                {archiveJob.title && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[300px]">{archiveJob.title}</p>
                )}
              </div>
            </div>
            <div className="text-sm text-gray-700 mb-1 leading-snug">{archiveJob.lastMsg}</div>
            {archiveJob.status === 'working' && (
              <div className="text-xs text-gray-400 mt-2">
                Попытка {archiveJob.attempt} из 40 (повтор каждые 15 секунд)
              </div>
            )}
            <div className="flex justify-end mt-4">
              <button
                onClick={cancelArchiveJob}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition"
              >
                {archiveJob.status === 'working' ? 'Отменить' : 'Закрыть'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Stream create modal
// ───────────────────────────────────────────────────────────────────────────
function StreamCreateModal({ form, setForm, groups, creating, onClose, onSubmit }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between bg-gradient-to-r from-rose-50 to-pink-50 rounded-t-3xl">
          <h2 className="font-semibold flex items-center gap-2 text-rose-700">
            <Plus size={18} /> Новый эфир
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">Название</label>
            <input
              type="text"
              placeholder="Например, Тренировка вечер"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              autoFocus
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-300"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1 flex items-center gap-1">
              <Users size={12} /> Группы (доступ к эфиру)
            </label>
            <div className="rounded-xl border border-gray-200 max-h-44 overflow-y-auto p-2 space-y-1">
              {groups.length === 0 && (
                <p className="text-xs text-gray-400 p-2">Группы загружаются…</p>
              )}
              {groups.map(g => {
                const checked = form.group_ids.includes(g.id)
                return (
                  <label
                    key={g.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition ${
                      checked ? 'bg-rose-50 text-rose-700' : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => setForm(f => ({
                        ...f,
                        group_ids: e.target.checked
                          ? [...f.group_ids, g.id]
                          : f.group_ids.filter(x => x !== g.id),
                      }))}
                      className="rounded text-rose-500 focus:ring-rose-300"
                    />
                    <span>Группа {g.number}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <button
            onClick={onSubmit}
            disabled={creating}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white font-semibold shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 transition"
          >
            {creating ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Создание…
              </>
            ) : (
              <>
                <Plus size={16} /> Создать эфир
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Stream card — single big CTA, no double action
// ───────────────────────────────────────────────────────────────────────────
function StreamCard({ stream: s, onEnd, onDelete, onManualArchive, onPreviewRecording, onCopy, copied, studentLink }) {
  const [viewers, setViewers] = useState([])

  useEffect(() => {
    if (s.status !== 'live') return
    let stopped = false
    const pull = () => {
      api.get(`/education/streams/${s.id}/viewers/`)
        .then(r => { if (!stopped) setViewers(r.data || []) })
        .catch(() => {})
    }
    pull()
    const id = setInterval(pull, 5000)
    return () => { stopped = true; clearInterval(id) }
  }, [s.id, s.status])

  const isLive = s.status === 'live'
  const isScheduled = s.status === 'scheduled'
  const isArchived = ['ended', 'archived'].includes(s.status)
  const hasRecording = isArchived && s.archived_lesson

  const wa = encodeURIComponent(`Прямой эфир «${s.title}» — заходи по ссылке: ${studentLink}`)

  return (
    <div className="bg-white rounded-3xl border border-rose-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 flex items-start gap-4 flex-wrap border-b border-rose-50">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
          isLive
            ? 'bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-200'
            : isScheduled
              ? 'bg-rose-100 text-rose-600'
              : 'bg-gray-100 text-gray-500'
        }`}>
          <Radio size={20} className={isLive ? 'animate-pulse' : ''} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold truncate">{s.title}</h3>
            {isLive && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-600 text-white">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
              </span>
            )}
            {isScheduled && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-semibold">
                Готов к эфиру
              </span>
            )}
            {isArchived && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">
                {s.status === 'archived' ? 'Архив' : 'Завершён'}
              </span>
            )}
            {hasRecording && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 font-semibold flex items-center gap-1">
                <BookMarked size={11} /> Запись готова
              </span>
            )}
          </div>
          {isLive && (
            <div className="flex items-center gap-1 text-xs text-emerald-700 mt-1">
              <Users size={11} /> {viewers.length} {viewers.length === 1 ? 'зритель' : 'зрителей'} в эфире
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {isLive && (
            <button
              onClick={onEnd}
              className="px-3 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm flex items-center gap-1.5 font-medium shadow"
            >
              <Square size={14} /> Завершить
            </button>
          )}
          {hasRecording && (
            <button
              onClick={onPreviewRecording}
              className="px-3 py-2 rounded-xl bg-violet-100 hover:bg-violet-200 text-violet-700 text-sm flex items-center gap-1.5 font-medium"
            >
              <Eye size={14} /> Смотреть запись
            </button>
          )}
          {isArchived && !hasRecording && (
            <button
              onClick={onManualArchive}
              className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm flex items-center gap-1.5 font-medium border border-amber-200"
            >
              <BookMarked size={14} /> Создать архив
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-2 rounded-xl text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition"
            title="В корзину"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Body — only for active (scheduled or live) streams */}
      {!isArchived && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Single big CTA — opens broadcast studio (auto-goes-live on start) */}
          <a
            href={`/admin/education/broadcast/${s.id}`}
            target="_blank"
            rel="noreferrer"
            className="group flex flex-col gap-2 p-5 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white hover:shadow-xl transition shadow-md"
          >
            <div className="flex items-center justify-between">
              <Radio size={28} className="opacity-90" />
              <ExternalLink size={16} className="opacity-60 group-hover:opacity-100" />
            </div>
            <div className="font-bold text-lg">
              {isLive ? 'Открыть студию эфира' : 'Открыть студию и начать эфир'}
            </div>
            <div className="text-sm text-rose-100">
              Камера + микрофон в браузере. Эфир запустится автоматически.
            </div>
          </a>

          <div className="flex flex-col gap-3 p-5 rounded-2xl bg-emerald-50/60 border border-emerald-100">
            <div className="flex items-center gap-2 text-emerald-700">
              <Link2 size={16} />
              <div className="font-semibold text-sm">Ссылка для учеников</div>
            </div>
            <code className="text-xs text-gray-700 bg-white border border-emerald-100 rounded-lg px-3 py-2 truncate block">
              {studentLink}
            </code>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onCopy(studentLink, `link-${s.id}`)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 shadow"
              >
                {copied === `link-${s.id}` ? <Check size={14} /> : <Copy size={14} />}
                {copied === `link-${s.id}` ? 'Скопировано' : 'Копировать'}
              </button>
              <a
                href={`https://wa.me/?text=${wa}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-50"
              >
                <MessageCircle size={14} /> WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Live viewer panel */}
      {isLive && viewers.length > 0 && (
        <div className="px-5 pb-5">
          <div className="rounded-2xl bg-white border border-rose-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users size={16} className="text-rose-500" />
              <h4 className="font-semibold text-sm">На эфире сейчас ({viewers.length})</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {viewers.map(v => (
                <div
                  key={v.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-50 border border-rose-100"
                >
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-rose-300 to-pink-400 text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                    {(v.client_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-medium text-gray-700">
                    {v.client_name || 'Гость'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Archived hint */}
      {isArchived && !hasRecording && (
        <div className="p-5">
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-100">
            <AlertCircle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              Запись появится автоматически после обработки Cloudflare Stream.
              Если этого не произошло — нажмите «Создать архив».
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
