import { useEffect, useState } from 'react'
import {
  Video, Copy, MessageCircle, Plus, Check,
  Clock, Users, AlertCircle, Search,
  StopCircle, LogIn, Calendar, Trash2, X,
  CheckSquare, Square as SquareIcon, PhoneCall,
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
import AppSelect from '../../../components/ui/AppSelect'

const PAGE_SIZE = 15

const fmtDate = iso => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
const fmtDuration = sec => {
  if (!sec || sec <= 0) return null
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m} мин ${s} с`
}
const relDate = iso => {
  if (!iso) return ''
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ru }) }
  catch { return '' }
}

const STATUS_TABS = [
  { key: 'all',    label: 'Все' },
  { key: 'active', label: 'Активные' },
  { key: 'used',   label: 'Завершённые' },
]

const STATUS_MAP = {
  active:    { label: 'Активна',   cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Отменена',  cls: 'bg-rose-100 text-rose-700' },
  expired:   { label: 'Истекла',   cls: 'bg-amber-100 text-amber-700' },
  used:      { label: 'Завершена', cls: 'bg-gray-100 text-gray-600' },
}

export default function ConsultationsAdmin() {
  const { user } = useOutletContext()
  const [items, setItems] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [trainers, setTrainers] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', trainer: '', client: '' })
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState('')

  const [alertModal, setAlertModal] = useState(null)
  const [confirmStop, setConfirmStop] = useState(null)
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

  const [joiningId, setJoiningId] = useState(null)

  const reload = () => {
    setLoading(true)
    // Load all consultations at once so client-side search works across the
    // full dataset, not just the current page. Consultations are typically
    // few hundred at most.
    api.get('/education/consultations/?page_size=500')
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : (r.data?.results || [])
        setItems(list)
        setTotalCount(list.length)
      })
      .catch(e => setAlertModal({ title: 'Не удалось загрузить', message: e.response?.data?.detail || e.message, variant: 'error' }))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, []) // eslint-disable-line
  useEffect(() => {
    api.get('/trainers/?page_size=200').then(r => setTrainers(pickList(r.data))).catch(() => {})
    api.get('/clients/?page_size=200').then(r => setClients(pickList(r.data))).catch(() => {})
  }, [])

  // Client-side filter
  const filtered = items.filter(item => {
    const matchSearch = !search || (item.title || '').toLowerCase().includes(search.toLowerCase())
      || (item.trainer_name || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all'
      || (statusFilter === 'used' && ['used', 'cancelled'].includes(item.status))
      || item.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const counts = {
    active:  items.filter(i => i.status === 'active').length,
    used:    items.filter(i => ['used', 'cancelled'].includes(i.status)).length,
    expired: items.filter(i => i.status === 'expired').length,
  }

  // Create
  const create = async () => {
    if (!form.title.trim()) {
      setAlertModal({ title: 'Заполните название', message: 'Напишите тему консультации.', variant: 'error' }); return
    }
    setCreating(true)
    try {
      await api.post('/education/consultations/', {
        title: form.title.trim(),
        trainer: form.trainer || null,
        client: form.client || null,
      })
      setForm({ title: '', trainer: '', client: '' }); setShowForm(false); reload()
    } catch (e) {
      setAlertModal({ title: 'Ошибка создания', message: e.response?.data?.detail || e.message, variant: 'error' })
    } finally { setCreating(false) }
  }

  // Join — open Jitsi directly in browser, no embed modal
  const joinAsTrainer = async id => {
    setJoiningId(id)
    try {
      const r = await api.get(`/education/consultations/${id}/join-as-trainer/`)
      if (!r.data?.valid) {
        setAlertModal({ title: 'Не удалось войти', message: r.data?.reason || 'Консультация недоступна.', variant: 'error' }); return
      }
      const info = r.data
      const url = info.jitsi_domain && info.room_name
        ? `https://${info.jitsi_domain}/${info.room_name}${info.jitsi_token ? `?jwt=${info.jitsi_token}` : ''}`
        : null
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer')
      } else {
        setAlertModal({ title: 'Ошибка', message: 'Не удалось получить ссылку на комнату.', variant: 'error' })
      }
    } catch (e) {
      setAlertModal({ title: 'Ошибка', message: e.response?.data?.detail || e.message, variant: 'error' })
    } finally { setJoiningId(null) }
  }

  // Stop
  const performStop = async () => {
    if (!confirmStop) return
    try {
      await api.post(`/education/consultations/${confirmStop.id}/stop/`)
      setConfirmStop(null); reload()
      setAlertModal({ title: 'Консультация завершена', message: 'Комната закрыта. Ученик увидит сообщение в течение 10 секунд.', variant: 'success' })
    } catch (e) {
      setConfirmStop(null)
      setAlertModal({ title: 'Ошибка', message: e.response?.data?.detail || e.message, variant: 'error' })
    }
  }

  // Single delete
  const performDelete = async () => {
    if (!confirmDelete) return
    try { await api.delete(`/education/consultations/${confirmDelete.id}/`); setConfirmDelete(null); reload() }
    catch (e) {
      setConfirmDelete(null)
      setAlertModal({ title: 'Ошибка', message: e.response?.data?.detail || e.message, variant: 'error' })
    }
  }

  // Bulk delete — allSettled so a single failure doesn't abort the rest
  const performBulkDelete = async () => {
    setBulkDeleting(true)
    const ids = [...selectedIds]
    try {
      const results = await Promise.allSettled(ids.map(id => api.delete(`/education/consultations/${id}/`)))
      const failed = results.filter(r => r.status === 'rejected').length
      exitSelectMode(); setConfirmBulkDelete(false); reload()
      if (failed > 0) {
        setAlertModal({ title: `Удалено ${ids.length - failed} из ${ids.length}`, message: 'Часть консультаций не удалось удалить — попробуйте ещё раз.', variant: 'error' })
      }
    } finally { setBulkDeleting(false) }
  }

  const copy = (text, key) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 2000) })
  }

  const roomUrl = uuid => `${window.location.origin}/room/${uuid}`
  const waLink = (uuid, title) =>
    `https://wa.me/?text=${encodeURIComponent(`Онлайн-консультация «${title}» — открывай по ссылке прямо в браузере: ${roomUrl(uuid)}`)}`

  return (
    <AdminLayout user={user}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center text-white shadow-md shrink-0">
            <Video size={20} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">Консультации</h1>
            <p className="text-xs text-gray-500 flex gap-2">
              <span className="text-violet-600 font-semibold">{counts.active} активных</span>·
              <span>{counts.used} завершено</span>·
              <span>{counts.expired} истекло</span>
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white font-semibold shadow-sm hover:bg-violet-700 transition"
        >
          <Plus size={18} /> Новая консультация
        </button>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по теме или тренеру…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-100"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 shrink-0">
          {STATUS_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setStatusFilter(t.key); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${statusFilter === t.key ? 'bg-white shadow text-violet-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { selectMode ? exitSelectMode() : setSelectMode(true) }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition ${selectMode ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
        >
          <CheckSquare size={14} /> {selectMode ? 'Отменить' : 'Выбрать'}
        </button>
      </div>

      {/* Bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3 px-4 py-2.5 bg-violet-50 border border-violet-200 rounded-xl">
          <span className="text-sm font-medium text-violet-800">Выбрано: {selectedIds.size}</span>
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

      {/* List */}
      <div className="space-y-2">
        {loading && (
          <div className="p-10 text-center text-gray-400">
            <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-500 rounded-full animate-spin mx-auto mb-2" />
            Загрузка…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-violet-100 py-14 text-center">
            <Video size={40} className="mx-auto text-violet-200 mb-3" />
            <p className="text-gray-500 font-medium">{items.length === 0 ? 'Консультаций ещё нет' : 'Ничего не найдено'}</p>
          </div>
        )}
        {filtered.map(item => (
          <ConsultationCard
            key={item.id}
            item={item}
            selectMode={selectMode}
            selected={selectedIds.has(item.id)}
            onToggleSelect={() => toggleSelected(item.id)}
            roomUrl={roomUrl(item.room_uuid)}
            waLink={waLink(item.room_uuid, item.title || 'Консультация')}
            copied={copied}
            onCopy={copy}
            onJoinRoom={() => joinAsTrainer(item.id)}
            joiningId={joiningId}
            onStop={() => setConfirmStop({ id: item.id, title: item.title || 'Консультация' })}
            onDelete={() => setConfirmDelete({ id: item.id, title: item.title || 'Консультация' })}
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
        <ConsultationCreateModal
          form={form} setForm={setForm} trainers={trainers} clients={clients}
          creating={creating}
          onClose={() => { setShowForm(false); setForm({ title: '', trainer: '', client: '' }) }}
          onSubmit={create}
        />
      )}

      <AlertModal open={!!alertModal} onClose={() => setAlertModal(null)} title={alertModal?.title || ''} message={alertModal?.message || ''} variant={alertModal?.variant || 'info'} />
      <ConfirmModal open={!!confirmStop} onClose={() => setConfirmStop(null)} onConfirm={performStop}
        title="Завершить консультацию?"
        message={confirmStop ? `Консультация «${confirmStop.title}» будет завершена.\nУченик увидит сообщение об окончании.` : ''}
        confirmText="Завершить" variant="danger"
      />
      <ConfirmModal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={performDelete}
        title="Удалить консультацию?"
        message={confirmDelete ? `«${confirmDelete.title}» переместится в корзину.` : ''}
        confirmText="В корзину" variant="danger"
      />
      <ConfirmModal
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={performBulkDelete}
        title={`Удалить ${selectedIds.size} консультац.?`}
        message="Выбранные консультации переместятся в корзину."
        confirmText={bulkDeleting ? 'Удаляем…' : 'Удалить'}
        variant="danger"
      />
    </AdminLayout>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function ConsultationCard({ item, selectMode, selected, onToggleSelect, roomUrl, waLink, copied, onCopy, onJoinRoom, joiningId, onStop, onDelete }) {
  const isActive = item.status === 'active'
  const isExpired = item.status === 'expired'
  const isJoining = joiningId === item.id
  const dateIso = item.started_at || item.created_at

  // ── ACTIVE — "live call" full card ─────────────────────────────────────────
  if (isActive) {
    return (
      <div
        className={`rounded-2xl overflow-hidden shadow-md border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 ${selected ? 'ring-2 ring-violet-400' : ''}`}
        onClick={selectMode ? onToggleSelect : undefined}
        style={selectMode ? { cursor: 'pointer' } : {}}
      >
        <div className="px-4 sm:px-5 pt-4 pb-3 flex items-start gap-3">
          {/* Checkbox or pulsing dot */}
          <div className="shrink-0 mt-1" onClick={e => { if (selectMode) { e.stopPropagation(); onToggleSelect() } }}>
            {selectMode
              ? selected
                ? <CheckSquare size={20} className="text-violet-500" />
                : <SquareIcon size={20} className="text-gray-400" />
              : (
                <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center shadow-[0_0_12px_rgba(109,40,217,0.4)]">
                  <PhoneCall size={14} className="text-white" />
                </div>
              )
            }
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-black tracking-widest text-violet-600 uppercase">● Активна</span>
              {!item.started_at && (
                <span className="text-[11px] text-violet-400">Ожидает участников</span>
              )}
            </div>
            <h3 className="font-bold text-gray-900 text-[15px] leading-tight mt-0.5 truncate">
              {item.title || 'Консультация'}
            </h3>
            <p className="text-xs text-violet-400 mt-0.5 flex items-center gap-2">
              {item.trainer_name && <span className="flex items-center gap-1"><Users size={10} />{item.trainer_name}</span>}
              {dateIso && <span>{fmtDate(dateIso)}</span>}
            </p>
          </div>

          {/* Actions — hidden in selectMode */}
          {!selectMode && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={onJoinRoom} disabled={isJoining}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 shadow-sm active:scale-95 transition disabled:opacity-60">
                {isJoining
                  ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <LogIn size={13} />}
                {isJoining ? 'Подкл…' : 'Войти'}
              </button>
              <button onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-violet-200 text-violet-600 text-xs font-semibold hover:bg-violet-50 active:scale-95 transition">
                <StopCircle size={13} /> Завершить
              </button>
              <button onClick={onDelete} title="В корзину"
                className="p-2 rounded-xl text-violet-300 hover:text-rose-500 hover:bg-white/60 transition active:scale-95">
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Link bar — hidden in selectMode */}
        {!selectMode && (
          <div className="px-4 sm:px-5 pb-3 flex items-center gap-2 border-t border-violet-100/60 pt-2.5">
            <span className="text-[11px] text-violet-400 truncate flex-1 font-mono">{roomUrl}</span>
            <button onClick={() => onCopy(roomUrl, `link-${item.id}`)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-violet-100 text-xs text-gray-600 hover:bg-gray-50 transition shrink-0">
              {copied === `link-${item.id}` ? <><Check size={11} className="text-emerald-500" /> Скопировано</> : <><Copy size={11} /> Копировать</>}
            </button>
            <a href={waLink} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition shrink-0">
              <MessageCircle size={11} /> WA
            </a>
          </div>
        )}
      </div>
    )
  }

  // ── Compact row — completed / expired ─────────────────────────────────────
  const badge = STATUS_MAP[item.status] || { label: item.status, cls: 'bg-gray-100 text-gray-500' }

  return (
    <div
      className={`bg-white rounded-xl border transition-all hover:shadow-sm hover:border-gray-200 ${selected ? 'border-violet-300 ring-2 ring-violet-100' : 'border-gray-100'}`}
      onClick={selectMode ? onToggleSelect : undefined}
      style={selectMode ? { cursor: 'pointer' } : {}}
    >
      <div className="px-4 py-3 flex items-center gap-3">

        {/* Checkbox or status dot */}
        <div className="shrink-0" onClick={e => { if (selectMode) { e.stopPropagation(); onToggleSelect() } }}>
          {selectMode
            ? selected
              ? <CheckSquare size={18} className="text-violet-500" />
              : <SquareIcon size={18} className="text-gray-300" />
            : (
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                isExpired ? 'bg-amber-50 text-amber-400' : 'bg-gray-100 text-gray-400'
              }`}>
                <PhoneCall size={14} />
              </div>
            )
          }
        </div>

        {/* Title + trainer */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-gray-800 text-[13px] truncate">{item.title || 'Консультация'}</span>
            <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold border ${badge.cls}`}>{badge.label}</span>
          </div>
          {item.trainer_name && (
            <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1 truncate">
              <Users size={9} /> {item.trainer_name}
            </p>
          )}
        </div>

        {/* Right side: date + duration + delete */}
        <div className="shrink-0 flex flex-col items-end gap-0.5">
          {dateIso && (
            <span className="text-[12px] font-medium text-gray-600">{fmtDate(dateIso)}</span>
          )}
          <div className="flex items-center gap-2">
            {item.duration_sec > 0 && (
              <span className="text-[11px] text-gray-400">{fmtDuration(item.duration_sec)}</span>
            )}
            {dateIso && relDate(dateIso) && (
              <span className="text-[11px] text-gray-300">{relDate(dateIso)}</span>
            )}
            {!selectMode && (
              <button onClick={onDelete} title="В корзину"
                className="p-1.5 rounded-lg text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition active:scale-95 ml-1">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function ConsultationCreateModal({ form, setForm, trainers, clients, creating, onClose, onSubmit }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg border border-gray-200" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-3xl">
          <h2 className="font-semibold flex items-center gap-2 text-violet-700"><Plus size={18} /> Новая консультация</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-white"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">Тема / название</label>
            <input
              type="text" placeholder="Например, Разбор питания"
              value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && onSubmit()} autoFocus
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">Тренер (необязательно)</label>
            <AppSelect value={form.trainer} onChange={e => setForm({ ...form, trainer: e.target.value })}
              className="w-full">
              <option value="">Не указан</option>
              {trainers.map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
            </AppSelect>
          </div>
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">Ученик (необязательно)</label>
            <AppSelect value={form.client} onChange={e => setForm({ ...form, client: e.target.value })}
              className="w-full">
              <option value="">Открытая ссылка</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </AppSelect>
          </div>
          <button onClick={onSubmit} disabled={creating}
            className="w-full py-3 rounded-xl bg-violet-600 text-white font-semibold shadow-sm hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {creating ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Создание…</> : <><Plus size={16} /> Создать ссылку</>}
          </button>
        </div>
      </div>
    </div>
  )
}

