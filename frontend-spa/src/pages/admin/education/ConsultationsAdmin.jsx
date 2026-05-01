import { useEffect, useRef, useState } from 'react'
import {
  Video, Copy, MessageCircle, Plus, Check,
  Clock, Users, AlertCircle,
  StopCircle, LogIn, Calendar, Trash2, X,
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

  // Form open/close
  const [showForm, setShowForm] = useState(false)

  // Inline Jitsi
  const [jitsiInfo, setJitsiInfo] = useState(null)
  const [joiningId, setJoiningId] = useState(null)


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

  useEffect(() => {
    reload()
    api.get('/trainers/').then(r => setTrainers(r.data?.results || r.data || [])).catch(() => {})
    api.get('/clients/?limit=200').then(r => setClients(r.data?.results || r.data || [])).catch(() => {})
  }, [])

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
      setShowForm(false)
      reload()
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
    } catch (e) {
      setConfirmDelete(null)
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

        {/* Compact header */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4 sm:mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white shadow-md shrink-0">
              <Video size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">Консультации</h1>
              <p className="text-xs text-gray-500">
                Активных <span className="font-semibold text-violet-600">{activeCount}</span>
                {' · '}
                Всего <span className="font-semibold text-gray-700">{items.length}</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white font-semibold shadow-md hover:shadow-lg transition focus:outline-none focus:ring-2 focus:ring-violet-300"
          >
            <Plus size={18} /> Новая консультация
          </button>
        </div>

        {/* Create modal */}
        {showForm && (
          <ConsultationCreateModal
            form={form}
            setForm={setForm}
            trainers={trainers}
            clients={clients}
            creating={creating}
            onClose={() => { setShowForm(false); setForm({ title: '', trainer: '', client: '' }) }}
            onSubmit={create}
          />
        )}

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
          ? `Консультация «${confirmDelete.title}» переместится в корзину. Восстановить можно из раздела «Корзина».`
          : ''}
        confirmText="В корзину"
        variant="danger"
      />
    </AdminLayout>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Create modal
// ─────────────────────────────────────────────────────────────────────────────
function ConsultationCreateModal({ form, setForm, trainers, clients, creating, onClose, onSubmit }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-violet-100 flex items-center justify-between bg-gradient-to-r from-violet-50 to-purple-50 rounded-t-3xl">
          <h2 className="font-semibold flex items-center gap-2 text-violet-700">
            <Plus size={18} /> Новая консультация
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">Тема / название</label>
            <input
              type="text"
              placeholder="Например, Разбор питания"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && onSubmit()}
              autoFocus
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

          <button
            onClick={onSubmit}
            disabled={creating}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white font-semibold shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 transition"
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
      </div>
    </div>
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
    <div className={`bg-white rounded-2xl shadow-sm overflow-hidden transition border ${
      isActive ? 'border-violet-200' : 'border-gray-100'
    }`}>
      {/* Top row: icon + meta + primary actions */}
      <div className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          isActive
            ? 'bg-gradient-to-br from-violet-500 to-purple-500 text-white shadow shadow-violet-200'
            : 'bg-gray-100 text-gray-400'
        }`}>
          <Video size={18} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{item.title || 'Консультация'}</h3>
            <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full font-semibold ${statusBadge.cls}`}>
              {statusBadge.label}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-500">
            {item.trainer_name && (
              <span className="flex items-center gap-1"><Users size={11} />{item.trainer_name}</span>
            )}
            {item.started_at && (
              <span className="flex items-center gap-1">
                <Calendar size={11} />{fmtDate(item.started_at)}
              </span>
            )}
            {item.duration_sec > 0 && (
              <span className="flex items-center gap-1">
                <Clock size={11} />{fmtDuration(item.duration_sec)}
              </span>
            )}
            {!item.started_at && isActive && (
              <span className="text-violet-500">Ожидает участников</span>
            )}
          </div>
        </div>

        {/* Primary actions, right side */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isActive && (
            <>
              <button
                onClick={onJoinRoom}
                disabled={isJoining}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-sm font-semibold shadow-sm disabled:opacity-60"
              >
                {isJoining
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <LogIn size={14} />}
                <span className="hidden sm:inline">{isJoining ? 'Подключение…' : 'Войти'}</span>
              </button>
              <button
                onClick={onStop}
                className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 transition border border-rose-100"
                title="Завершить"
              >
                <StopCircle size={16} />
              </button>
            </>
          )}
          <button
            onClick={onDelete}
            className="p-2 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition"
            title="В корзину"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Link section — slim sub-bar, only for active */}
      {isActive && (
        <div className="px-4 pb-3 -mt-1">
          <div className="flex items-center gap-1.5 bg-violet-50/70 border border-violet-100 rounded-xl p-1 pl-3">
            <code className="flex-1 min-w-0 text-xs text-violet-900/80 truncate font-mono">
              {roomUrl}
            </code>
            <button
              onClick={() => onCopy(roomUrl, `link-${item.id}`)}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white text-violet-700 text-xs font-medium hover:bg-violet-100 border border-violet-100 transition"
              title="Копировать ссылку"
            >
              {copied === `link-${item.id}` ? <Check size={13} /> : <Copy size={13} />}
              <span className="hidden sm:inline">
                {copied === `link-${item.id}` ? 'Готово' : 'Копировать'}
              </span>
            </button>
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition"
              title="Отправить в WhatsApp"
            >
              <MessageCircle size={13} />
              <span className="hidden sm:inline">WhatsApp</span>
            </a>
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
          prejoinConfig: { enabled: false },
          disableDeepLinking: true,
          enableWelcomePage: false,
          enableClosePage: false,
          requireDisplayName: false,
          disableInviteFunctions: true,
          toolbarButtons: [
            'microphone', 'camera', 'desktop', 'fullscreen',
            'hangup', 'chat', 'tileview', 'videoquality', 'settings',
          ],
        },
        interfaceConfigOverwrite: {
          MOBILE_APP_PROMO: false,
          SHOW_JITSI_WATERMARK: false,
          SHOW_BRAND_WATERMARK: false,
          SHOW_POWERED_BY: false,
          DISABLE_VIDEO_BACKGROUND: false,
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
