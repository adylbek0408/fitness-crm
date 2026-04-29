import { useEffect, useRef, useState } from 'react'
import {
  Video, Copy, MessageCircle, Plus, Check,
  Clock, Users, AlertCircle,
  StopCircle, LogIn, Calendar, Trash2, Trash, RotateCcw, X,
} from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import api from '../../../api/axios'
import AdminLayout from '../../../components/AdminLayout'
import AlertModal from '../../../components/AlertModal'
import ConfirmModal from '../../../components/ConfirmModal'

/**
 * Консультации — 1-на-1 видеозвонки (Jitsi iframe, без перехода на другой сайт).
 *
 * Тренер нажимает «Войти» → Jitsi открывается прямо в окне поверх страницы.
 * Ученик открывает /room/{uuid} — тот же Jitsi в его браузере.
 */
export default function ConsultationsAdmin() {
  const { user } = useOutletContext()
  const [items, setItems] = useState([])
  const [trainers, setTrainers] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState('')
  const [form, setForm] = useState({ title: '', trainer: '', client: '' })

  const [alertModal, setAlertModal] = useState(null)
  const [confirmStop, setConfirmStop] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  // Inline Jitsi
  const [jitsiInfo, setJitsiInfo] = useState(null)
  const [joiningId, setJoiningId] = useState(null)

  // Trash
  const [showTrash, setShowTrash] = useState(false)
  const [trashItems, setTrashItems] = useState([])
  const [trashLoading, setTrashLoading] = useState(false)
  const [confirmPermanent, setConfirmPermanent] = useState(null)

  const reload = () => {
    setLoading(true)
    api.get('/education/consultations/')
      .then(r => setItems(r.data?.results || r.data || []))
      .catch(e => setAlertModal({
        title: 'Не удалось загрузить консультации',
        message: e.response?.data?.detail || e.message,
        variant: 'error',
      }))
      .finally(() => setLoading(false))
  }

  const loadTrash = () => {
    setTrashLoading(true)
    api.get('/education/consultations/trash/')
      .then(r => setTrashItems(r.data || []))
      .catch(() => {})
      .finally(() => setTrashLoading(false))
  }

  useEffect(() => {
    reload()
    api.get('/trainers/').then(r => setTrainers(r.data?.results || r.data || [])).catch(() => {})
    api.get('/clients/?limit=200').then(r => setClients(r.data?.results || r.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (showTrash) loadTrash()
  }, [showTrash])

  const create = async () => {
    if (!form.title.trim()) {
      setAlertModal({ title: 'Заполните название', message: 'Напишите тему консультации.', variant: 'error' })
      return
    }
    setCreating(true)
    try {
      await api.post('/education/consultations/', {
        title: form.title.trim(),
        trainer: form.trainer || null,
        client: form.client || null,
      })
      setForm({ title: '', trainer: '', client: '' })
      reload()
      setAlertModal({
        title: 'Ссылка создана',
        message: 'Скопируйте ссылку и отправьте ученику в WhatsApp. Ученик откроет видеозвонок прямо в браузере — ничего устанавливать не нужно.',
        variant: 'success',
      })
    } catch (e) {
      setAlertModal({
        title: 'Ошибка создания',
        message: e.response?.data?.detail || e.message,
        variant: 'error',
      })
    } finally {
      setCreating(false)
    }
  }

  const joinAsTrainer = async (id) => {
    setJoiningId(id)
    try {
      const r = await api.get(`/education/consultations/${id}/join-as-trainer/`)
      if (!r.data?.valid) {
        setAlertModal({ title: 'Не удалось войти', message: r.data?.reason || 'Консультация недоступна.', variant: 'error' })
        return
      }
      setJitsiInfo(r.data)
    } catch (e) {
      setAlertModal({ title: 'Ошибка', message: e.response?.data?.detail || e.message, variant: 'error' })
    } finally {
      setJoiningId(null)
    }
  }

  const performStop = async () => {
    if (!confirmStop) return
    try {
      await api.post(`/education/consultations/${confirmStop.id}/stop/`)
      setConfirmStop(null)
      reload()
      setAlertModal({
        title: 'Консультация завершена',
        message: 'Комната закрыта. Ученик увидит сообщение о завершении в течение 10 секунд.',
        variant: 'success',
      })
    } catch (e) {
      setConfirmStop(null)
      setAlertModal({ title: 'Ошибка', message: e.response?.data?.detail || e.message, variant: 'error' })
    }
  }

  const performDelete = async () => {
    if (!confirmDelete) return
    try {
      await api.delete(`/education/consultations/${confirmDelete.id}/`)
      setConfirmDelete(null)
      reload()
      if (showTrash) loadTrash()
    } catch (e) {
      setConfirmDelete(null)
      setAlertModal({ title: 'Ошибка', message: e.response?.data?.detail || e.message, variant: 'error' })
    }
  }

  const performRestore = async (id) => {
    try {
      await api.post(`/education/consultations/${id}/restore/`)
      loadTrash()
      reload()
    } catch (e) {
      setAlertModal({ title: 'Ошибка', message: e.response?.data?.detail || e.message, variant: 'error' })
    }
  }

  const performPermanentDelete = async () => {
    if (!confirmPermanent) return
    try {
      await api.delete(`/education/consultations/${confirmPermanent.id}/permanent/`)
      setConfirmPermanent(null)
      loadTrash()
    } catch (e) {
      setConfirmPermanent(null)
      setAlertModal({ title: 'Ошибка', message: e.response?.data?.detail || e.message, variant: 'error' })
    }
  }

  const copy = (text, key) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(''), 2000)
    })
  }

  const roomUrl = uuid => `${window.location.origin}/room/${uuid}`
  const wa = (uuid, title) =>
    `https://wa.me/?text=${encodeURIComponent(`Онлайн-консультация «${title}» — открывай по ссылке прямо в браузере: ${roomUrl(uuid)}`)}`

  const fmtDate = iso => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('ru', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const fmtDuration = sec => {
    if (!sec) return null
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m} мин ${s} с`
  }

  const activeCount = items.filter(i => i.status === 'active').length

  return (
    <AdminLayout user={user}>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">

        {/* Hero */}
        <div className="rounded-3xl bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-500 p-6 sm:p-8 text-white shadow-xl mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-violet-100 text-xs font-medium mb-1">
                <Video size={14} /> 1-на-1 консультации
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold">Консультации</h1>
              <p className="text-violet-100 text-sm mt-1 max-w-md">
                Создайте ссылку — отправьте ученику в WhatsApp. Видеозвонок откроется прямо в браузере без установки приложений.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm shrink-0">
              <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3 text-center">
                <div className="text-xs text-violet-100">Активных</div>
                <div className="text-2xl font-bold">{activeCount}</div>
              </div>
              <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3 text-center">
                <div className="text-xs text-violet-100">Всего</div>
                <div className="text-2xl font-bold">{items.length}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Create form */}
        <div className="bg-white rounded-3xl border border-violet-100 p-5 sm:p-6 mb-6 shadow-sm">
          <h2 className="font-semibold mb-4 flex items-center gap-2 text-violet-700">
            <Plus size={18} /> Новая консультация
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-500 font-medium mb-1">Тема / название</label>
              <input
                type="text"
                placeholder="Например, Разбор питания"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && create()}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-300"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 font-medium mb-1">Тренер (необязательно)</label>
              <select
                value={form.trainer}
                onChange={e => setForm({ ...form, trainer: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
              >
                <option value="">Не указан</option>
                {trainers.map(t => (
                  <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 font-medium mb-1">Ученик (необязательно)</label>
              <select
                value={form.client}
                onChange={e => setForm({ ...form, client: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
              >
                <option value="">Открытая ссылка</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={create}
            disabled={creating}
            className="mt-4 px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white font-semibold shadow-md hover:shadow-lg disabled:opacity-50 flex items-center gap-2"
          >
            {creating ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Создание…
              </>
            ) : (
              <>
                <Plus size={16} /> Создать ссылку
              </>
            )}
          </button>
        </div>

        {/* List */}
        <div className="space-y-3">
          {loading && (
            <div className="p-8 text-center text-gray-400">
              <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-500 rounded-full animate-spin mx-auto mb-2" />
              Загрузка…
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="bg-white rounded-3xl border border-violet-100 shadow-sm py-16 text-center">
              <Video size={48} className="mx-auto text-violet-200 mb-3" />
              <p className="text-gray-500 font-medium">Консультаций ещё нет</p>
              <p className="text-xs text-gray-400 mt-1">Создайте первую — заполните форму выше.</p>
            </div>
          )}

          {items.map(item => (
            <ConsultationCard
              key={item.id}
              item={item}
              roomUrl={roomUrl(item.room_uuid)}
              waLink={wa(item.room_uuid, item.title || 'Консультация')}
              copied={copied}
              onCopy={copy}
              onJoinRoom={() => joinAsTrainer(item.id)}
              joiningId={joiningId}
              onStop={() => setConfirmStop({ id: item.id, title: item.title || 'Консультация' })}
              onDelete={() => setConfirmDelete({ id: item.id, title: item.title || 'Консультация' })}
              fmtDate={fmtDate}
              fmtDuration={fmtDuration}
            />
          ))}

          {/* Trash */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowTrash(v => !v)}
              className="w-full px-5 py-4 flex items-center gap-3 hover:bg-gray-50 transition text-left"
            >
              <Trash size={18} className="text-gray-400" />
              <span className="font-medium text-gray-600">Корзина</span>
              {trashItems.length > 0 && (
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
                  {trashItems.length}
                </span>
              )}
              <span className="ml-auto text-xs text-gray-400">
                {showTrash ? '▲ Скрыть' : '▼ Показать'}
              </span>
            </button>

            {showTrash && (
              <div className="border-t border-gray-100">
                {trashLoading && (
                  <div className="p-6 text-center text-gray-400 text-sm">Загрузка…</div>
                )}
                {!trashLoading && trashItems.length === 0 && (
                  <div className="p-6 text-center text-gray-400 text-sm">Корзина пуста.</div>
                )}
                {!trashLoading && trashItems.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 last:border-0 bg-gray-50/50">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 text-gray-400">
                      <Video size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{c.title || 'Консультация'}</p>
                      <p className="text-xs text-gray-400">{c.status}</p>
                    </div>
                    <button
                      onClick={() => performRestore(c.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition"
                    >
                      <RotateCcw size={13} /> Восстановить
                    </button>
                    <button
                      onClick={() => setConfirmPermanent({ id: c.id, title: c.title || 'Консультация' })}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 transition"
                    >
                      <Trash2 size={13} /> Удалить
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inline Jitsi room modal */}
      {jitsiInfo && (
        <JitsiRoomModal
          info={jitsiInfo}
          onClose={() => { setJitsiInfo(null); reload() }}
        />
      )}

      <AlertModal
        open={!!alertModal}
        onClose={() => setAlertModal(null)}
        title={alertModal?.title || ''}
        message={alertModal?.message || ''}
        variant={alertModal?.variant || 'info'}
      />
      <ConfirmModal
        open={!!confirmStop}
        onClose={() => setConfirmStop(null)}
        onConfirm={performStop}
        title="Завершить консультацию?"
        message={confirmStop
          ? `Консультация «${confirmStop.title}» будет завершена.\nУченик увидит сообщение о завершении и комната закроется.`
          : ''}
        confirmText="Завершить"
        variant="danger"
      />
      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={performDelete}
        title="Удалить консультацию?"
        message={confirmDelete
          ? `Консультация «${confirmDelete.title}» переместится в корзину.`
          : ''}
        confirmText="В корзину"
        variant="danger"
      />
      <ConfirmModal
        open={!!confirmPermanent}
        onClose={() => setConfirmPermanent(null)}
        onConfirm={performPermanentDelete}
        title="Удалить навсегда?"
        message={confirmPermanent
          ? `Консультация «${confirmPermanent.title}» будет удалена безвозвратно.`
          : ''}
        confirmText="Удалить навсегда"
        variant="danger"
      />
    </AdminLayout>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Consultation card
// ─────────────────────────────────────────────────────────────────────────────
function ConsultationCard({ item, roomUrl, waLink, copied, onCopy, onJoinRoom, joiningId, onStop, onDelete, fmtDate, fmtDuration }) {
  const isActive = item.status === 'active'
  const isCancelled = item.status === 'cancelled'
  const isExpired = item.status === 'expired'
  const isUsed = item.status === 'used'

  const statusBadge = {
    active:    { label: 'Активна',   cls: 'bg-emerald-100 text-emerald-700' },
    cancelled: { label: 'Завершена', cls: 'bg-gray-100 text-gray-600'       },
    expired:   { label: 'Истекла',   cls: 'bg-amber-100 text-amber-700'     },
    used:      { label: 'Завершена', cls: 'bg-gray-100 text-gray-600'       },
  }[item.status] || { label: item.status, cls: 'bg-gray-100 text-gray-500' }

  const isJoining = joiningId === item.id

  return (
    <div className="bg-white rounded-3xl border border-violet-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 flex items-start gap-4 flex-wrap border-b border-violet-50">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
          isActive
            ? 'bg-gradient-to-br from-violet-500 to-purple-500 text-white shadow-lg shadow-violet-200'
            : 'bg-gray-100 text-gray-500'
        }`}>
          <Video size={20} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold truncate">{item.title || 'Консультация'}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusBadge.cls}`}>
              {statusBadge.label}
            </span>
          </div>

          <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
            {item.trainer_name && (
              <span className="flex items-center gap-1">
                <Users size={11} /> {item.trainer_name}
              </span>
            )}
            {item.started_at && (
              <span className="flex items-center gap-1">
                <Calendar size={11} /> Начата: {fmtDate(item.started_at)}
              </span>
            )}
            {item.duration_sec > 0 && (
              <span className="flex items-center gap-1">
                <Clock size={11} /> Длительность: {fmtDuration(item.duration_sec)}
              </span>
            )}
            {!item.started_at && isActive && (
              <span className="text-violet-500">Ожидает участников</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          {isActive && (
            <>
              <button
                onClick={onJoinRoom}
                disabled={isJoining}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium shadow disabled:opacity-60"
              >
                {isJoining ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <LogIn size={14} />
                )}
                {isJoining ? 'Подключение…' : 'Войти в комнату'}
              </button>
              <button
                onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 text-sm font-medium border border-rose-100"
              >
                <StopCircle size={14} /> Завершить
              </button>
            </>
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

      {/* Link section — only for active */}
      {isActive && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flex flex-col gap-3 p-5 rounded-2xl bg-violet-50/60 border border-violet-100">
            <div className="flex items-center gap-2 text-violet-700 font-semibold text-sm">
              Ссылка для ученика
            </div>
            <code className="text-xs text-gray-700 bg-white border border-violet-100 rounded-lg px-3 py-2 truncate block">
              {roomUrl}
            </code>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => onCopy(roomUrl, `link-${item.id}`)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 shadow"
              >
                {copied === `link-${item.id}` ? <Check size={14} /> : <Copy size={14} />}
                {copied === `link-${item.id}` ? 'Скопировано' : 'Копировать'}
              </button>
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-violet-200 text-violet-700 text-sm font-medium hover:bg-violet-50"
              >
                <MessageCircle size={14} /> WhatsApp
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-2 p-5 rounded-2xl bg-gray-50 border border-gray-100">
            <div className="font-semibold text-sm text-gray-700 mb-1">Как это работает</div>
            {[
              ['1', 'Скопируйте ссылку и отправьте ученику в WhatsApp'],
              ['2', 'Нажмите «Войти в комнату» — видеозвонок откроется здесь'],
              ['3', 'Ученик открывает ссылку в браузере и входит'],
              ['4', 'Когда закончите — нажмите «Завершить»'],
            ].map(([num, text]) => (
              <div key={num} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs flex items-center justify-center shrink-0 font-bold mt-0.5">
                  {num}
                </span>
                {text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Finished state */}
      {!isActive && (
        <div className="p-5">
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-gray-50 border border-gray-100">
            <AlertCircle size={18} className="text-gray-400 shrink-0 mt-0.5" />
            <div className="text-sm text-gray-600">
              {isCancelled || isUsed
                ? `Консультация завершена${item.ended_at ? ` — ${fmtDate(item.ended_at)}` : ''}${item.duration_sec > 0 ? `. Продолжительность: ${fmtDuration(item.duration_sec)}` : ''}.`
                : isExpired
                  ? 'Ссылка истекла.'
                  : 'Консультация закрыта.'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline Jitsi modal — trainer joins the room directly in the admin panel
// ─────────────────────────────────────────────────────────────────────────────
function JitsiRoomModal({ info, onClose }) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)

  useEffect(() => {
    if (!info?.jitsi_domain || !info?.room_name) return
    const domain = info.jitsi_domain
    const scriptId = 'jitsi-external-api'

    const init = () => {
      if (!window.JitsiMeetExternalAPI || !containerRef.current) return
      if (apiRef.current) return

      apiRef.current = new window.JitsiMeetExternalAPI(domain, {
        roomName: info.room_name,
        parentNode: containerRef.current,
        width: '100%',
        height: '100%',
        userInfo: { displayName: info.display_name || 'Тренер' },
        ...(info.jitsi_token ? { jwt: info.jitsi_token } : {}),
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          prejoinPageEnabled: false,
          disableDeepLinking: true,
        },
        interfaceConfigOverwrite: {
          MOBILE_APP_PROMO: false,
          SHOW_JITSI_WATERMARK: false,
        },
      })

      apiRef.current.addEventListener('readyToClose', () => {
        try { apiRef.current.dispose() } catch {}
        apiRef.current = null
        onClose()
      })
    }

    if (!document.getElementById(scriptId)) {
      const s = document.createElement('script')
      s.id = scriptId
      s.src = `https://${domain}/external_api.js`
      s.async = true
      s.onload = init
      document.body.appendChild(s)
    } else {
      init()
    }

    return () => {
      if (apiRef.current) {
        try { apiRef.current.dispose() } catch {}
        apiRef.current = null
      }
    }
  }, [info, onClose])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="absolute top-3 right-3 z-10">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white hover:bg-white/20 text-sm font-medium backdrop-blur"
        >
          <X size={16} /> Закрыть
        </button>
      </div>
      <div ref={containerRef} style={{ width: '100%', flex: 1 }} />
    </div>
  )
}
