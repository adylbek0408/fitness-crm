import { useEffect, useState } from 'react'
import {
  Radio, Copy, Play, Square, Plus, Link2, Check,
  Users, MessageCircle, ExternalLink, AlertCircle, Trash2,
} from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import api from '../../../api/axios'
import AdminLayout from '../../../components/AdminLayout'
import AlertModal from '../../../components/AlertModal'
import ConfirmModal from '../../../components/ConfirmModal'

/**
 * Admin page for managing live streams.
 *
 * Browser-only streaming:
 *  - Trainer creates a stream (gets the auto-generated student link).
 *  - Click "Начать с браузера" → opens BroadcastPage which streams
 *    via WebRTC (WHIP) to Cloudflare Stream — no OBS, no extra apps.
 *  - Students open the link on phone/PWA and watch in `/cabinet/stream?id=…`.
 *
 * The OBS / SRT credentials live in the model (kept for future use) but
 * are intentionally hidden from this UI — the user wants every flow
 * to work through the website.
 */
export default function StreamsAdmin() {
  const { user } = useOutletContext()
  const [streams, setStreams] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ title: '', group_ids: [] })
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState('')
  const [alertModal, setAlertModal] = useState(null)
  const [confirmEnd, setConfirmEnd] = useState(null) // { id, title }

  const reload = () => {
    setLoading(true)
    api.get('/education/streams/')
      .then(r => setStreams(r.data?.results || r.data || []))
      .catch(e => setAlertModal({
        title: 'Не удалось загрузить эфиры',
        message: e.response?.data?.detail || e.message || 'Проверьте соединение.',
        variant: 'error',
      }))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reload()
    api.get('/groups/')
      .then(r => setGroups(r.data?.results || r.data || []))
      .catch(() => {})
  }, [])

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
      reload()
      setAlertModal({
        title: 'Эфир создан',
        message: 'Скопируйте ссылку и отправьте ученикам в WhatsApp. Когда будете готовы — нажмите «Начать трансляцию».',
        variant: 'success',
      })
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

  const start = id => api.post(`/education/streams/${id}/start/`).then(reload)
    .catch(e => setAlertModal({ title: 'Ошибка', message: e.response?.data?.detail || 'Попробуйте ещё раз.', variant: 'error' }))

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

  const copy = (text, key) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(''), 2000)
    })
  }

  // Cabinet link the student sees on their phone (works in browser + PWA)
  const studentLink = (id) => `${window.location.origin}/cabinet/stream?id=${id}`

  const summary = {
    live: streams.filter(s => s.status === 'live').length,
    scheduled: streams.filter(s => s.status === 'scheduled').length,
    archived: streams.filter(s => ['ended', 'archived'].includes(s.status)).length,
  }

  return (
    <AdminLayout user={user}>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        {/* Hero */}
        <div className="rounded-3xl bg-gradient-to-br from-rose-500 via-pink-500 to-purple-500 p-6 sm:p-8 text-white shadow-xl mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-rose-100 text-xs font-medium mb-1">
                <Radio size={14} /> Прямой эфир
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold">Эфиры</h1>
              <p className="text-rose-100 text-sm mt-1 max-w-md">
                Создайте эфир — отправьте ссылку ученикам в WhatsApp — нажмите «Начать с браузера». Ничего устанавливать не нужно.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm shrink-0">
              <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3 text-center">
                <div className="text-xs text-rose-100">В эфире</div>
                <div className="text-2xl font-bold">{summary.live}</div>
              </div>
              <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3 text-center">
                <div className="text-xs text-rose-100">Готовы</div>
                <div className="text-2xl font-bold">{summary.scheduled}</div>
              </div>
              <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3 text-center">
                <div className="text-xs text-rose-100">Архив</div>
                <div className="text-2xl font-bold">{summary.archived}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick create */}
        <div className="bg-white rounded-3xl border border-rose-100 p-5 sm:p-6 mb-6 shadow-sm">
          <h2 className="font-semibold mb-4 flex items-center gap-2 text-rose-700">
            <Plus size={18} /> Новый эфир
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className="block text-xs text-gray-500 font-medium mb-1">Название</label>
              <input
                type="text"
                placeholder="Например, Тренировка вечер"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-300"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-500 font-medium mb-1 flex items-center gap-1">
                <Users size={12} /> Группы (доступ к эфиру)
              </label>
              <div className="rounded-xl border border-gray-200 max-h-32 overflow-y-auto p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
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
                      {g.trainer && (
                        <span className="text-xs text-gray-400 truncate">
                          · {g.trainer.first_name} {g.trainer.last_name}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          </div>

          <button
            onClick={create}
            disabled={creating}
            className="mt-4 px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white font-semibold shadow-md hover:shadow-lg disabled:opacity-50 flex items-center gap-2"
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
              <p className="text-xs text-gray-400 mt-1">
                Создайте первый — заполните форму выше.
              </p>
            </div>
          )}

          {streams.map(s => (
            <StreamCard
              key={s.id}
              stream={s}
              onStart={() => start(s.id)}
              onEnd={() => setConfirmEnd({ id: s.id, title: s.title })}
              onCopy={copy}
              copied={copied}
              studentLink={studentLink(s.id)}
            />
          ))}
        </div>
      </div>

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
        message={confirmEnd ? `Эфир «${confirmEnd.title}» будет закрыт.\nЗрители больше не смогут к нему подключиться.` : ''}
        confirmText="Завершить"
        variant="danger"
      />
    </AdminLayout>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Stream card
// ───────────────────────────────────────────────────────────────────────────
function StreamCard({ stream: s, onStart, onEnd, onCopy, copied, studentLink }) {
  const [viewers, setViewers] = useState([])

  // Live viewer polling — only when stream is actually live
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

  const status = s.status
  const isLive = status === 'live'
  const isScheduled = status === 'scheduled'
  const isArchived = ['ended', 'archived'].includes(status)

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
                {status === 'archived' ? 'Архив' : 'Завершён'}
              </span>
            )}
          </div>
          {isLive && (
            <div className="flex items-center gap-1 text-xs text-emerald-700 mt-1">
              <Users size={11} /> {viewers.length} {viewers.length === 1 ? 'зритель' : 'зрителей'} в эфире
            </div>
          )}
          {!isLive && !isArchived && (
            <p className="text-xs text-gray-400 mt-1">
              Скопируйте ссылку и отправьте ученикам, потом нажмите «Начать с браузера».
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {isScheduled && (
            <button
              onClick={onStart}
              className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm flex items-center gap-1.5 font-medium shadow"
            >
              <Play size={14} /> Готов
            </button>
          )}
          {isLive && (
            <button
              onClick={onEnd}
              className="px-3 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm flex items-center gap-1.5 font-medium shadow"
            >
              <Square size={14} /> Завершить
            </button>
          )}
        </div>
      </div>

      {/* Body — only for active streams */}
      {!isArchived && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Streaming launcher (BIG button) */}
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
              {isLive ? 'Открыть студию эфира' : 'Начать с браузера'}
            </div>
            <div className="text-sm text-rose-100">
              Камера + микрофон прямо с телефона или компьютера. Без OBS.
            </div>
          </a>

          {/* Student link card */}
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
            <p className="text-xs text-emerald-700/80">
              Ученики откроют ссылку с телефона прямо в браузере.
            </p>
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
      {isArchived && (
        <div className="p-5">
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-gray-50 border border-gray-100">
            <AlertCircle size={18} className="text-gray-400 shrink-0 mt-0.5" />
            <div className="text-sm text-gray-600">
              Эфир завершён. {s.archived_lesson
                ? 'Запись добавлена в архив — ученики могут пересмотреть её в кабинете.'
                : 'Запись появится автоматически после обработки Cloudflare Stream.'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
