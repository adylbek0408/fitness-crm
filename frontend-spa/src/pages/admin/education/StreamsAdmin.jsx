import { useEffect, useRef, useState } from 'react'
import {
  Radio, Copy, Square, Plus, Check, Search,
  Users, MessageCircle, ExternalLink, AlertCircle, Trash2,
  Eye, X, BookMarked, Clock, Pencil, CheckSquare,
  Square as SquareIcon, Play,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useOutletContext } from 'react-router-dom'
import api from '../../../api/axios'
import { pickList } from '../../../utils/format'
import AdminLayout from '../../../components/AdminLayout'
import AlertModal from '../../../components/AlertModal'
import ConfirmModal from '../../../components/ConfirmModal'
import Pagination from '../../../components/Pagination'
import VodPlayer from '../../../components/education/VodPlayer'
import GroupPicker, { GroupPickerLabel } from '../../../components/ui/GroupPicker'

const PAGE_SIZE = 12

const fmtDate = iso => {
  if (!iso) return ''
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
const fmtDuration = sec => {
  if (!sec || sec <= 0) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`
}
const relDate = iso => {
  if (!iso) return ''
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ru }) }
  catch { return '' }
}

const STATUS_TABS = [
  { key: 'all', label: 'Все' },
  { key: 'live', label: 'Live' },
  { key: 'archived', label: 'Архив' },
]

export default function StreamsAdmin() {
  const { user } = useOutletContext()
  const [streams, setStreams] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', group_ids: [] })
  const [creating, setCreating] = useState(false)

  const [copied, setCopied] = useState('')
  const [alertModal, setAlertModal] = useState(null)
  const [confirmEnd, setConfirmEnd] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Bulk select
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const toggleSelected = id => setSelectedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()) }

  // Preview
  const [previewInfo, setPreviewInfo] = useState(null)
  const [previewTitle, setPreviewTitle] = useState('')

  // Edit archived lesson
  const [editStream, setEditStream] = useState(null) // stream object
  const [editForm, setEditForm] = useState({ title: '', description: '', group_ids: [] })
  const [editSaving, setEditSaving] = useState(false)

  // Archive job polling
  const [archiveJob, setArchiveJob] = useState(null)
  const archiveCancelledRef = useRef(false)
  const archiveTimerRef = useRef(null)

  const reload = () => {
    setLoading(true)
    api.get(`/education/streams/?page=${page}&page_size=${PAGE_SIZE}`)
      .then(r => {
        if (Array.isArray(r.data)) { setStreams(r.data); setTotalCount(r.data.length) }
        else { setStreams(r.data?.results || []); setTotalCount(r.data?.count ?? 0) }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [page]) // eslint-disable-line

  // Recording preparation progress per stream id.
  // Sources merged in priority order:
  //   1. sessionStorage `recording_upload:{id}` — set by BroadcastPage while
  //      the WebM is being POSTed; survives navigation away from BroadcastPage.
  //   2. backend recording-status — CF transcoding pct after upload completes.
  // Cleared once the recording is ready (full archive available).
  const [recProgress, setRecProgress] = useState({}) // { [streamId]: { stage, pct } }
  // Tracks which streams already triggered reload() on becoming ready, so we
  // don't trigger a fresh reload every poll cycle (= visible flicker).
  const reloadedReadyRef = useRef(new Set())
  // Tracks which streams CF has confirmed ready, so we can skip them in
  // subsequent poll cycles instead of hammering the API forever.
  const readyStreamsRef = useRef(new Set())

  useEffect(() => {
    // Poll only ended/archived streams whose recording isn't confirmed ready yet.
    const targets = streams.filter(s =>
      ['ended', 'archived'].includes(s.status)
      && !readyStreamsRef.current.has(s.id)
    )
    if (targets.length === 0) { return }

    let stopped = false

    const readSessionStorage = (sid) => {
      try {
        const raw = sessionStorage.getItem(`recording_upload:${sid}`)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        // Stale entries (older than 30 min) are ignored — guards against
        // sessionStorage sticking around after a failed upload tab close.
        if (Date.now() - (parsed.ts || 0) > 30 * 60 * 1000) return null
        return parsed
      } catch { return null }
    }

    const refreshOne = async (s) => {
      const local = readSessionStorage(s.id)
      // While the browser upload is in flight, trust sessionStorage —
      // recording-status would falsely report 'missing' (no recording_uid yet).
      if (local && local.stage === 'uploading') {
        if (!stopped) setRecProgress(p => ({ ...p, [s.id]: { stage: 'uploading', pct: local.pct ?? 0 } }))
        return
      }
      try {
        const r = await api.get(`/education/streams/${s.id}/recording-status/`)
        if (stopped) return
        const d = r.data || {}
        // 'missing' with no local upload → don't render a bar (stays as
        // existing "manual archive" affordance).
        setRecProgress(p => {
          const next = { ...p }
          if (d.stage === 'ready') delete next[s.id]
          else if (d.stage === 'missing' && !local) delete next[s.id]
          else next[s.id] = { stage: d.stage, pct: d.pct ?? 0 }
          return next
        })
        // Auto-refresh card list ONCE per stream when it transitions to ready,
        // so the archive badge + preview button appear without flickering the
        // list every poll cycle.
        if (d.stage === 'ready') {
          readyStreamsRef.current.add(s.id)
          if (!reloadedReadyRef.current.has(s.id)) {
            reloadedReadyRef.current.add(s.id)
            reload()
          }
        }
      } catch {}
    }

    targets.forEach(refreshOne)
    const t = setInterval(() => { targets.forEach(refreshOne) }, 6000)
    return () => { stopped = true; clearInterval(t) }
  }, [streams]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.get('/groups/?page_size=200&training_format=online').then(r => setGroups(pickList(r.data))).catch(() => {})
  }, [])

  // Client-side filter
  const filtered = streams.filter(s => {
    const matchSearch = !search || s.title.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all'
      || (statusFilter === 'archived' && ['ended', 'archived'].includes(s.status))
      || s.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const counts = {
    live: streams.filter(s => s.status === 'live').length,
    scheduled: streams.filter(s => s.status === 'scheduled').length,
    archived: streams.filter(s => ['ended', 'archived'].includes(s.status)).length,
  }

  // Create
  const create = async () => {
    if (!form.title.trim()) {
      setAlertModal({ title: 'Заполните название', message: '', variant: 'error' }); return
    }
    if (!form.group_ids.length) {
      setAlertModal({ title: 'Выберите хотя бы одну группу', message: '', variant: 'error' }); return
    }
    setCreating(true)
    try {
      await api.post('/education/streams/', { title: form.title.trim(), description: '', groups: form.group_ids })
      setForm({ title: '', group_ids: [] }); setShowForm(false); reload()
    } catch (e) {
      setAlertModal({ title: 'Ошибка', message: e.response?.data?.detail || e.message, variant: 'error' })
    } finally { setCreating(false) }
  }

  // End
  const performEnd = async () => {
    if (!confirmEnd) return
    try { await api.post(`/education/streams/${confirmEnd.id}/end/`); setConfirmEnd(null); reload() }
    catch (e) { setConfirmEnd(null); setAlertModal({ title: 'Ошибка', message: e.response?.data?.detail || e.message, variant: 'error' }) }
  }

  // Single delete
  const performDelete = async () => {
    if (!confirmDelete) return
    try { await api.delete(`/education/streams/${confirmDelete.id}/`); setConfirmDelete(null); reload() }
    catch (e) { setConfirmDelete(null); setAlertModal({ title: 'Ошибка', message: e.response?.data?.detail || e.message, variant: 'error' }) }
  }

  // Bulk delete — Promise.allSettled so a single failed delete doesn't
  // abandon the others. We always reload at the end so the list reflects
  // whichever rows actually got removed.
  const performBulkDelete = async () => {
    setBulkDeleting(true)
    try {
      const ids = [...selectedIds]
      const results = await Promise.allSettled(
        ids.map(id => api.delete(`/education/streams/${id}/`))
      )
      const failed = results.filter(r => r.status === 'rejected').length
      exitSelectMode(); setConfirmBulkDelete(false); reload()
      if (failed > 0) {
        const first = results.find(r => r.status === 'rejected')
        setAlertModal({
          title: `Удалено ${ids.length - failed} из ${ids.length}`,
          message: first?.reason?.response?.data?.detail || first?.reason?.message || 'Часть эфиров не удалось удалить — попробуйте ещё раз.',
          variant: 'error',
        })
      }
    } finally { setBulkDeleting(false) }
  }

  // Edit archived lesson
  const openEdit = s => {
    setEditStream(s)
    setEditForm({
      title: s.title || '',
      description: '',
      group_ids: (s.groups || []).map(g => (typeof g === 'object' ? g.id : g)),
    })
  }
  const saveEdit = async () => {
    if (!editStream) return
    setEditSaving(true)
    try {
      // Edit the archived lesson metadata (title, description, groups)
      if (editStream.archived_lesson) {
        await api.patch(`/education/lessons/${editStream.archived_lesson}/metadata/`, {
          title: editForm.title,
          description: editForm.description,
          groups: editForm.group_ids,
        })
      }
      setEditStream(null); reload()
    } catch (e) {
      setAlertModal({ title: 'Ошибка сохранения', message: e.response?.data?.detail || e.message, variant: 'error' })
    } finally { setEditSaving(false) }
  }

  // Archive job
  const performManualArchive = (id, title = '') => {
    archiveCancelledRef.current = false
    if (archiveTimerRef.current) { clearTimeout(archiveTimerRef.current); archiveTimerRef.current = null }
    setArchiveJob({ id, title, attempt: 1, status: 'working', lastMsg: 'Запрашиваем у Cloudflare…' })
    let attempt = 0
    const tryOnce = async () => {
      if (archiveCancelledRef.current) return
      attempt++
      try {
        const cfResp = await api.get(`/education/streams/${id}/cf-status/`).catch(() => null)
        if (archiveCancelledRef.current) return
        const cf = cfResp?.data || {}

        // CF has no recording and stream is not live → video was never received,
        // retrying won't help; stop immediately and show a clear explanation.
        if (cf.recordings_count === 0 && cf.live_input_state !== 'connected') {
          setArchiveJob({
            id, title, attempt, status: 'failed',
            lastMsg: 'Cloudflare не получил видеоданных этого эфира. '
              + 'Это бывает, если эфир вёлся через страницу «Начать эфир» и запись не была '
              + 'загружена. Откройте тот эфир через кнопку «Студия» и используйте загрузку записи вручную.',
          })
          return
        }

        let msg = cf.live_input_state === 'connected'
          ? 'Эфир ещё идёт в CF — дождитесь окончания.'
          : cf.has_ready_recording
            ? 'Запись готова — публикуем…'
            : `Cloudflare обрабатывает (${(cf.recordings || []).map(r => r.state || '?').join(', ')}). 1–3 мин.`
        setArchiveJob(j => j ? { ...j, attempt, lastMsg: msg } : j)
        await api.post(`/education/streams/${id}/manual-archive/`)
        if (archiveCancelledRef.current) return
        setArchiveJob({ id, title, attempt, status: 'done', lastMsg: 'Архив создан ✓' })
        reload()
        archiveTimerRef.current = setTimeout(() => { if (!archiveCancelledRef.current) setArchiveJob(null) }, 1500)
      } catch (e) {
        if (archiveCancelledRef.current) return
        const msg = e.response?.data?.detail || e.message || 'Ошибка'
        if (attempt >= 40) { setArchiveJob({ id, title, attempt, status: 'failed', lastMsg: msg }); return }
        setArchiveJob(j => j ? { ...j, attempt, lastMsg: msg } : j)
        archiveTimerRef.current = setTimeout(tryOnce, 15000)
      }
    }
    tryOnce()
  }

  const cancelArchiveJob = () => {
    archiveCancelledRef.current = true
    if (archiveTimerRef.current) { clearTimeout(archiveTimerRef.current); archiveTimerRef.current = null }
    setArchiveJob(null)
  }

  useEffect(() => () => {
    archiveCancelledRef.current = true
    if (archiveTimerRef.current) clearTimeout(archiveTimerRef.current)
  }, [])

  const openRecordingPreview = async (lessonId, title) => {
    try {
      const r = await api.get(`/education/lessons/${lessonId}/preview/`)
      setPreviewInfo(r.data); setPreviewTitle(title)
    } catch (e) {
      setAlertModal({ title: 'Ошибка', message: e.response?.data?.detail || e.message, variant: 'error' })
    }
  }

  const copy = (text, key) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 2000) })
  }

  const studentLink = id => `${window.location.origin}/cabinet/stream?id=${id}`

  return (
    <AdminLayout user={user}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center text-white shadow-md shrink-0">
            <Radio size={20} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">Эфиры</h1>
            <p className="text-xs text-gray-500 flex gap-2">
              <span className="text-rose-600 font-semibold">{counts.live} live</span>·
              <span>{counts.scheduled} готовы</span>·
              <span>{counts.archived} архив</span>
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white font-semibold shadow-md hover:shadow-lg transition"
        >
          <Plus size={18} /> Новый эфир
        </button>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 shrink-0">
          {STATUS_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setStatusFilter(t.key); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${statusFilter === t.key ? 'bg-white shadow text-rose-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { selectMode ? exitSelectMode() : setSelectMode(true) }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition ${selectMode ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
        >
          <CheckSquare size={14} /> {selectMode ? 'Отменить' : 'Выбрать'}
        </button>
      </div>

      {/* Bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3 px-4 py-2.5 bg-rose-50 border border-rose-200 rounded-xl">
          <span className="text-sm font-medium text-rose-700">Выбрано: {selectedIds.size}</span>
          <button
            onClick={() => setConfirmBulkDelete(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500 text-white text-xs font-medium hover:bg-rose-600"
          >
            <Trash2 size={13} /> Удалить выбранные
          </button>
          <button onClick={exitSelectMode} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Stream list */}
      <div className="space-y-2">
        {loading && (
          <div className="p-10 text-center text-gray-400">
            <div className="w-8 h-8 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin mx-auto mb-2" />
            Загрузка…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-rose-100 py-14 text-center">
            <Radio size={40} className="mx-auto text-rose-200 mb-3" />
            <p className="text-gray-500 font-medium">{streams.length === 0 ? 'Эфиров ещё нет' : 'Ничего не найдено'}</p>
          </div>
        )}
        {filtered.map(s => (
          <StreamCard
            key={s.id}
            stream={s}
            selectMode={selectMode}
            selected={selectedIds.has(s.id)}
            onToggleSelect={() => toggleSelected(s.id)}
            onEnd={() => setConfirmEnd({ id: s.id, title: s.title })}
            onDelete={() => setConfirmDelete({ id: s.id, title: s.title })}
            onManualArchive={() => performManualArchive(s.id, s.title)}
            onPreviewRecording={() => openRecordingPreview(s.archived_lesson, s.title)}
            onEdit={() => openEdit(s)}
            onCopy={copy}
            copied={copied}
            studentLink={studentLink(s.id)}
            recProgress={recProgress[s.id]}
          />
        ))}
        {totalPages > 1 && (
          <div className="pt-2">
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>
        )}
      </div>

      {/* Create modal */}
      {showForm && (
        <StreamCreateModal
          form={form} setForm={setForm} groups={groups} creating={creating}
          onClose={() => { setShowForm(false); setForm({ title: '', group_ids: [] }) }}
          onSubmit={create}
        />
      )}

      {/* Edit modal */}
      {editStream && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setEditStream(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between bg-rose-50 rounded-t-3xl">
              <h2 className="font-semibold text-rose-700 flex items-center gap-2"><Pencil size={16} /> Редактировать эфир</h2>
              <button onClick={() => setEditStream(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Название</label>
                <input
                  value={editForm.title}
                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Описание</label>
                <textarea
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 resize-none"
                />
              </div>
              {editStream.archived_lesson && (
                <div>
                  <GroupPickerLabel>Группы доступа к записи</GroupPickerLabel>
                  <GroupPicker
                    groups={groups}
                    value={editForm.group_ids}
                    onChange={ids => setEditForm(f => ({ ...f, group_ids: ids }))}
                    accent="rose"
                  />
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setEditStream(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">Отмена</button>
                <button onClick={saveEdit} disabled={editSaving} className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-semibold hover:bg-rose-600 disabled:opacity-50">
                  {editSaving ? 'Сохраняем…' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recording preview modal */}
      {previewInfo && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-4" onClick={() => setPreviewInfo(null)}>
          <div className="bg-gray-950 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col" style={{ maxHeight: '92dvh' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
              <div>
                <h3 className="font-semibold text-white">{previewTitle}</h3>
                <p className="text-xs text-white/40">Запись эфира</p>
              </div>
              <button onClick={() => setPreviewInfo(null)} className="p-2 rounded-xl text-white/60 hover:bg-white/10 hover:text-white transition"><X size={20} /></button>
            </div>
            {/* Player — fills available height, works for landscape AND portrait */}
            {!previewInfo.playback_url ? (
              <div className="flex flex-col items-center py-14 text-gray-500 gap-3 px-4">
                <AlertCircle size={36} className="text-amber-400" />
                <p className="font-medium text-white/70">Видеозапись ещё обрабатывается</p>
                <p className="text-xs text-white/40 text-center max-w-xs">Cloudflare Stream обычно тратит 5–15 минут. Попробуйте позже.</p>
              </div>
            ) : (
              <div className="bg-black flex-1 overflow-hidden" style={{ minHeight: '200px', maxHeight: '75dvh' }}>
                <VodPlayer src={previewInfo.playback_url} kind={previewInfo.video_kind || 'hls'} autoPlay />
              </div>
            )}
          </div>
        </div>
      )}

      <AlertModal open={!!alertModal} onClose={() => setAlertModal(null)} title={alertModal?.title || ''} message={alertModal?.message || ''} variant={alertModal?.variant || 'info'} />
      <ConfirmModal open={!!confirmEnd} onClose={() => setConfirmEnd(null)} onConfirm={performEnd} title="Завершить эфир?" message={confirmEnd ? `Эфир «${confirmEnd.title}» будет закрыт.` : ''} confirmText="Завершить" variant="danger" />
      <ConfirmModal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={performDelete} title="Удалить эфир?" message={confirmDelete ? `«${confirmDelete.title}» переместится в корзину.` : ''} confirmText="В корзину" variant="danger" />
      <ConfirmModal
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={performBulkDelete}
        title={`Удалить ${selectedIds.size} эфир(а)?`}
        message="Выбранные эфиры переместятся в корзину. Восстановить можно из раздела «Корзина»."
        confirmText={bulkDeleting ? 'Удаляем…' : 'Удалить'}
        variant="danger"
      />

      {/* Archive job modal */}
      {archiveJob && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-3">
              {archiveJob.status === 'working' && <div className="w-10 h-10 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin" />}
              {archiveJob.status === 'done' && <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl">✓</div>}
              {archiveJob.status === 'failed' && <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xl">!</div>}
              <div>
                <h3 className="font-semibold">{archiveJob.status === 'done' ? 'Архив создан' : archiveJob.status === 'failed' ? 'Не удалось' : 'Создаём архив…'}</h3>
                {archiveJob.title && <p className="text-xs text-gray-400 truncate max-w-xs">{archiveJob.title}</p>}
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-1">{archiveJob.lastMsg}</p>
            {archiveJob.status === 'working' && <p className="text-xs text-gray-400">Попытка {archiveJob.attempt} из 40</p>}
            <div className="flex justify-end mt-4">
              <button onClick={cancelArchiveJob} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
                {archiveJob.status === 'working' ? 'Отменить' : 'Закрыть'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function StreamCreateModal({ form, setForm, groups, creating, onClose, onSubmit }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between bg-rose-50 rounded-t-3xl">
          <h2 className="font-semibold text-rose-700 flex items-center gap-2"><Plus size={18} /> Новый эфир</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-white"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Название</label>
            <input
              type="text" placeholder="Например, Тренировка вечер"
              value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} autoFocus
              onKeyDown={e => e.key === 'Enter' && onSubmit()}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          </div>
          <div>
            <GroupPickerLabel>Группы</GroupPickerLabel>
            <GroupPicker
              groups={groups}
              value={form.group_ids}
              onChange={ids => setForm(f => ({ ...f, group_ids: ids }))}
              accent="rose"
              emptyText="Загрузка…"
            />
          </div>
          <button onClick={onSubmit} disabled={creating}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white font-semibold shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
            {creating ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Создание…</> : <><Plus size={16} /> Создать эфир</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function StreamCard({ stream: s, selectMode, selected, onToggleSelect, onEnd, onDelete, onManualArchive, onPreviewRecording, onEdit, onCopy, copied, studentLink, recProgress }) {
  const [viewers, setViewers] = useState([])

  useEffect(() => {
    if (s.status !== 'live') return
    let stopped = false
    const pull = () => api.get(`/education/streams/${s.id}/viewers/`).then(r => { if (!stopped) setViewers(r.data || []) }).catch(() => {})
    pull()
    const t = setInterval(pull, 5000)
    return () => { stopped = true; clearInterval(t) }
  }, [s.id, s.status])

  const isLive      = s.status === 'live'
  const isScheduled = s.status === 'scheduled'
  const isArchived  = ['ended', 'archived'].includes(s.status)
  const hasRecording = isArchived && s.archived_lesson
  const wa = encodeURIComponent(`Прямой эфир «${s.title}» — заходи: ${studentLink}`)

  const showRecProgress = isArchived && !!recProgress && recProgress.stage !== 'ready'
  const recPct  = Math.max(0, Math.min(100, Number(recProgress?.pct) || 0))
  const recLabel = recProgress?.stage === 'uploading' ? 'Загрузка записи' : 'Подготовка записи'

  const dateIso = s.started_at || s.scheduled_at || s.created_at

  // ── LIVE — "breaking news" full card ──────────────────────────────────────
  if (isLive) {
    return (
      <div
        className={`rounded-2xl overflow-hidden shadow-md border border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50 ${selected ? 'ring-2 ring-rose-400' : ''}`}
        onClick={selectMode ? onToggleSelect : undefined}
        style={selectMode ? { cursor: 'pointer' } : {}}
      >
        {/* Top bar */}
        <div className="px-4 sm:px-5 pt-4 pb-3 flex items-start gap-3">
          {/* Checkbox (selectMode) or pulsing live dot */}
          <div className="shrink-0 mt-1" onClick={e => { if (selectMode) { e.stopPropagation(); onToggleSelect() } }}>
            {selectMode
              ? selected
                ? <CheckSquare size={20} className="text-rose-500" />
                : <SquareIcon size={20} className="text-gray-400" />
              : (
                <div className="w-8 h-8 rounded-full bg-rose-600 flex items-center justify-center shadow-[0_0_12px_rgba(225,29,72,0.5)]">
                  <span className="w-3 h-3 rounded-full bg-white animate-pulse" />
                </div>
              )
            }
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-black tracking-widest text-rose-600 uppercase">● Live</span>
              {viewers.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                  <Users size={10} /> {viewers.length} зрит.
                </span>
              )}
            </div>
            <h3 className="font-bold text-gray-900 text-[15px] leading-tight mt-0.5 truncate">{s.title}</h3>
            <p className="text-xs text-rose-400 mt-0.5">{fmtDate(dateIso)}</p>
          </div>

          {/* Actions — hidden in selectMode */}
          {!selectMode && (
            <div className="flex items-center gap-1.5 shrink-0">
              <a href={`/admin/education/broadcast/${s.id}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 shadow-sm active:scale-95 transition">
                <ExternalLink size={13} /> Студия
              </a>
              <button onClick={onEnd}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-rose-200 text-rose-600 text-xs font-semibold hover:bg-rose-50 active:scale-95 transition">
                <Square size={11} fill="currentColor" /> Завершить
              </button>
              <button onClick={onDelete} title="В корзину"
                className="p-2 rounded-xl text-rose-300 hover:text-rose-500 hover:bg-white/60 transition active:scale-95">
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Link bar + Viewers — hidden in selectMode */}
        {!selectMode && (
          <>
            <div className="px-4 sm:px-5 pb-3 flex items-center gap-2 border-t border-rose-100/60 pt-2.5">
              <span className="text-[11px] text-rose-400 truncate flex-1 font-mono">{studentLink}</span>
              <button onClick={() => onCopy(studentLink, `link-${s.id}`)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-rose-100 text-xs text-gray-600 hover:bg-gray-50 transition shrink-0">
                {copied === `link-${s.id}` ? <><Check size={11} className="text-emerald-500" /> Скопировано</> : <><Copy size={11} /> Копировать</>}
              </button>
              <a href={`https://wa.me/?text=${wa}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition shrink-0">
                <MessageCircle size={11} /> WA
              </a>
            </div>
            {viewers.length > 0 && (
              <div className="px-4 sm:px-5 pb-3 flex flex-wrap gap-1.5">
                {viewers.map(v => (
                  <div key={v.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 border border-rose-100 text-xs">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 text-white flex items-center justify-center text-[10px] font-bold">
                      {(v.client_name || '?').charAt(0).toUpperCase()}
                    </div>
                    {v.client_name || 'Гость'}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ── Compact row — scheduled / archived ────────────────────────────────────
  return (
    <div
      className={`bg-white rounded-xl border overflow-hidden transition-all hover:shadow-sm hover:border-gray-300 ${selected ? 'border-rose-300 ring-2 ring-rose-100' : 'border-gray-200'}`}
      onClick={selectMode ? onToggleSelect : undefined}
      style={selectMode ? { cursor: 'pointer' } : {}}
    >
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Checkbox or status dot */}
        <div className="shrink-0" onClick={e => { if (selectMode) { e.stopPropagation(); onToggleSelect() } }}>
          {selectMode
            ? selected
              ? <CheckSquare size={18} className="text-rose-500" />
              : <SquareIcon size={18} className="text-gray-300" />
            : (
              <div className={`w-2.5 h-2.5 rounded-full ${isScheduled ? 'bg-violet-400' : hasRecording ? 'bg-emerald-400' : 'bg-gray-300'}`} />
            )
          }
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-gray-900 text-[14px] truncate">{s.title}</span>
            {isScheduled && (
              <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 font-semibold border border-violet-100">Готов</span>
            )}
            {isArchived && (
              <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold border border-gray-200">
                {s.status === 'archived' ? 'Архив' : 'Завершён'}
              </span>
            )}
            {hasRecording && (
              <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-semibold border border-emerald-100 flex items-center gap-1">
                <BookMarked size={9} /> Запись
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-400">
            {dateIso && <span>{fmtDate(dateIso)}</span>}
            {s.duration_sec > 0 && <><span>·</span><span>{fmtDuration(s.duration_sec)}</span></>}
            {dateIso && relDate(dateIso) && <><span>·</span><span className="text-gray-300">{relDate(dateIso)}</span></>}
          </div>
        </div>

        {/* Actions */}
        {!selectMode && (
          <div className="flex items-center gap-1 shrink-0">
            {isScheduled && (
              <a href={`/admin/education/broadcast/${s.id}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-600 text-white text-[11px] font-semibold hover:bg-violet-700 transition active:scale-95 shadow-sm">
                <Play size={11} fill="white" /> Начать
              </a>
            )}
            {isScheduled && (
              <>
                <button onClick={() => onCopy(studentLink, `link-${s.id}`)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition" title="Скопировать ссылку">
                  {copied === `link-${s.id}` ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
                <a href={`https://wa.me/?text=${wa}`} target="_blank" rel="noreferrer"
                  className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50 transition" title="Отправить в WhatsApp">
                  <MessageCircle size={14} />
                </a>
              </>
            )}
            {hasRecording && (
              <button onClick={onPreviewRecording} title="Просмотреть запись"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-[11px] font-semibold hover:bg-violet-100 transition active:scale-95">
                <Eye size={12} /> Запись
              </button>
            )}

            {isArchived && (
              <button onClick={onEdit} title="Редактировать"
                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition active:scale-95">
                <Pencil size={14} />
              </button>
            )}
            <button onClick={onDelete} title="В корзину"
              className="p-1.5 rounded-lg text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition active:scale-95">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Recording progress bar */}
      {showRecProgress && !selectMode && (
        <div className="px-4 pb-3 border-t border-gray-50 pt-2">
          <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-1.5">
            <span className="w-3 h-3 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
            <span className="font-medium">{recLabel}</span>
            <span className="ml-auto font-mono text-gray-600 tabular-nums">{recPct}%</span>
          </div>
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all duration-500"
              style={{ width: `${recPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
