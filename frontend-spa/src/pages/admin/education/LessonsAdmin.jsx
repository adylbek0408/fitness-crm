import { useEffect, useRef, useState } from 'react'
import {
  Upload, Trash2, Plus, CheckCircle2, Headphones, Play,
  Mic, Square, Video, FileAudio, Search, Users,
} from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import api from '../../../api/axios'
import AdminLayout from '../../../components/AdminLayout'
import AlertModal from '../../../components/AlertModal'
import ConfirmModal from '../../../components/ConfirmModal'

/**
 * Admin: list / create / delete / publish lessons.
 *
 * GetCourse-style layout:
 *  - Top hero card with quick action (upload).
 *  - Two-column grid: form on left, list on right (mobile = stacked).
 *  - Lesson cards with thumbnail, type badge, duration, group chips.
 *  - Site-wide AlertModal/ConfirmModal — no native confirm()/alert().
 *
 * Upload flow:
 *   1) POST /api/education/lessons/upload-init/  → returns { lesson, upload }
 *   2a) upload.kind === 'cf-direct'           → POST to upload.url with video
 *   2b) upload.kind === 'r2-presigned-put'    → PUT to upload.url with file
 *   3) POST /api/education/lessons/{id}/finalize/  → publishes
 *
 * Audio can also be recorded directly in the browser (MediaRecorder).
 */
export default function LessonsAdmin() {
  const { user } = useOutletContext()
  const [lessons, setLessons]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [groups, setGroups]     = useState([])
  const [search, setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // all | video | audio

  // Modals
  const [alertModal, setAlertModal] = useState(null) // { title, message, variant }
  const [confirmDelete, setConfirmDelete] = useState(null) // { id, title }

  // Recording state
  const [recording, setRecording]   = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const recorderRef  = useRef(null)
  const recTimerRef  = useRef(null)
  const recChunksRef = useRef([])

  const [form, setForm] = useState({
    title: '', lesson_type: 'video', file: null, group_ids: [],
  })

  const reload = () => {
    setLoading(true)
    api.get('/education/lessons/')
      .then(r => setLessons(r.data?.results || r.data || []))
      .catch(e => setAlertModal({
        title: 'Не удалось загрузить уроки',
        message: e.response?.data?.detail || e.message || 'Проверьте соединение с сервером.',
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

  // ── Audio recording ──────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const mr = new MediaRecorder(stream, { mimeType: mime })
      recChunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) recChunksRef.current.push(e.data) }
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(recChunksRef.current, { type: mime })
        const file = new File([blob], 'recording.webm', { type: 'audio/webm' })
        setForm(f => ({ ...f, file, lesson_type: 'audio' }))
        setRecSeconds(0)
      }
      mr.start(250)
      recorderRef.current = mr
      setRecording(true)
      setRecSeconds(0)
      recTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000)
    } catch (e) {
      setAlertModal({
        title: 'Нет доступа к микрофону',
        message: 'Разрешите браузеру использовать микрофон и попробуйте снова.\n\n' + (e.message || ''),
        variant: 'error',
      })
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
    clearInterval(recTimerRef.current)
    setRecording(false)
  }

  const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const fmtDuration = sec => {
    if (!sec) return ''
    const m = Math.floor(sec / 60), s = sec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  // ── Upload lesson ────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!form.title.trim()) {
      setAlertModal({ title: 'Заполните название', message: 'Без названия урок не сохранится.', variant: 'error' })
      return
    }
    if (!form.file) {
      setAlertModal({
        title: 'Выберите файл',
        message: form.lesson_type === 'audio'
          ? 'Загрузите аудиофайл или запишите его прямо с микрофона.'
          : 'Загрузите видеофайл (MP4 или другой поддерживаемый формат).',
        variant: 'error',
      })
      return
    }
    setUploading(true); setProgress(5)
    try {
      const init = await api.post('/education/lessons/upload-init/', {
        title: form.title.trim(),
        description: '',
        lesson_type: form.lesson_type,
        groups: form.group_ids,
        file_ext: form.file.name.split('.').pop().toLowerCase(),
      })
      const { lesson, upload } = init.data
      setProgress(20)

      if (upload.kind === 'cf-direct') {
        const r = await fetch(upload.url, {
          method: 'POST',
          headers: { 'Content-Type': 'video/mp4' },
          body: form.file,
        })
        if (!r.ok) throw new Error('Cloudflare Stream: ' + r.status)
      } else if (upload.kind === 'r2-presigned-put') {
        const r = await fetch(upload.url, {
          method: 'PUT',
          headers: { 'Content-Type': upload.content_type },
          body: form.file,
        })
        if (!r.ok) throw new Error('R2: ' + r.status)
      }

      setProgress(85)
      await api.post(`/education/lessons/${lesson.id}/finalize/`, {})
      setProgress(100)
      setForm({ title: '', lesson_type: 'video', file: null, group_ids: [] })
      reload()
      setAlertModal({
        title: 'Урок сохранён',
        message: 'Урок добавлен в список и виден ученикам выбранных групп.',
        variant: 'success',
      })
    } catch (e) {
      setAlertModal({
        title: 'Не удалось сохранить урок',
        message: e.response?.data?.detail || e.message || 'Попробуйте ещё раз.',
        variant: 'error',
      })
    } finally {
      setUploading(false)
      setTimeout(() => setProgress(0), 1500)
    }
  }

  const performDelete = async () => {
    if (!confirmDelete) return
    try {
      await api.delete(`/education/lessons/${confirmDelete.id}/`)
      setConfirmDelete(null)
      reload()
    } catch (e) {
      setConfirmDelete(null)
      setAlertModal({
        title: 'Не удалось удалить',
        message: e.response?.data?.detail || e.message || 'Попробуйте позже.',
        variant: 'error',
      })
    }
  }

  // ── Filtering ────────────────────────────────────────────────────────────
  const filtered = lessons.filter(l => {
    if (typeFilter !== 'all' && l.lesson_type !== typeFilter) return false
    if (search && !l.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Group lookup for chips on lesson cards
  const groupById = Object.fromEntries(groups.map(g => [g.id, g]))

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <AdminLayout user={user}>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        {/* Hero */}
        <div className="rounded-3xl bg-gradient-to-br from-rose-500 via-pink-500 to-purple-500 p-6 sm:p-8 text-white shadow-xl mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-rose-100 text-xs font-medium mb-1">
                <Video size={14} /> Обучение
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold">Уроки</h1>
              <p className="text-rose-100 text-sm mt-1 max-w-md">
                Видео и аудио для учеников. Загрузите файл — он автоматически обработается и появится у студентов выбранной группы.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm shrink-0">
              <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3">
                <div className="text-xs text-rose-100">Всего</div>
                <div className="text-2xl font-bold">{lessons.length}</div>
              </div>
              <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3">
                <div className="text-xs text-rose-100">Опубликовано</div>
                <div className="text-2xl font-bold">{lessons.filter(l => l.is_published).length}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ────────── Upload form ────────── */}
          <div className="lg:col-span-2 lg:sticky lg:top-4 self-start">
            <div className="bg-white rounded-3xl border border-rose-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-rose-100 bg-gradient-to-r from-rose-50 to-pink-50">
                <h2 className="font-semibold flex items-center gap-2 text-rose-700">
                  <Plus size={18} /> Новый урок
                </h2>
              </div>

              <div className="p-5 space-y-4">
                {/* Type tabs */}
                <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl">
                  {[
                    { key: 'video', label: 'Видео', Icon: Video },
                    { key: 'audio', label: 'Аудио', Icon: FileAudio },
                  ].map(t => (
                    <button
                      key={t.key}
                      onClick={() => setForm(f => ({ ...f, lesson_type: t.key, file: null }))}
                      className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                        form.lesson_type === t.key
                          ? 'bg-white shadow text-rose-600'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <t.Icon size={16} /> {t.label}
                    </button>
                  ))}
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs text-gray-500 font-medium mb-1">Название</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    placeholder="Например, Тренировка №1 — основы"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-300"
                  />
                </div>

                {/* Groups */}
                <div>
                  <label className="block text-xs text-gray-500 font-medium mb-1 flex items-center gap-1">
                    <Users size={12} /> Доступ для групп
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
                          {g.trainer && (
                            <span className="text-xs text-gray-400 truncate">
                              · {g.trainer.first_name} {g.trainer.last_name}
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                  {form.group_ids.length > 0 && (
                    <p className="text-xs text-emerald-600 mt-1">
                      Доступ открыт {form.group_ids.length} {form.group_ids.length === 1 ? 'группе' : 'группам'}.
                    </p>
                  )}
                </div>

                {/* File picker */}
                <div>
                  <label className="block text-xs text-gray-500 font-medium mb-1">
                    Файл ({form.lesson_type === 'video' ? 'MP4 / MOV / WebM' : 'MP3 / WAV / M4A'})
                  </label>
                  <label className={`flex flex-col items-center justify-center px-4 py-6 rounded-2xl border-2 border-dashed cursor-pointer transition ${
                    form.file
                      ? 'border-emerald-300 bg-emerald-50/50'
                      : 'border-rose-200 bg-rose-50/40 hover:bg-rose-50'
                  }`}>
                    <input
                      type="file"
                      accept={form.lesson_type === 'video' ? 'video/mp4,video/*' : 'audio/*'}
                      onChange={e => setForm({ ...form, file: e.target.files?.[0] || null })}
                      className="hidden"
                    />
                    {form.file ? (
                      <>
                        <CheckCircle2 size={24} className="text-emerald-500 mb-1" />
                        <p className="text-sm font-medium text-emerald-700 truncate max-w-full">
                          {form.file.name}
                        </p>
                        <p className="text-xs text-emerald-600">
                          {(form.file.size / 1024 / 1024).toFixed(1)} МБ — файл готов к загрузке
                        </p>
                      </>
                    ) : (
                      <>
                        <Upload size={24} className="text-rose-400 mb-1" />
                        <p className="text-sm font-medium text-rose-600">Выберите файл</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          или перетащите сюда
                        </p>
                      </>
                    )}
                  </label>
                </div>

                {/* Audio recorder */}
                {form.lesson_type === 'audio' && (
                  <div className="flex items-center gap-3 p-3 bg-rose-50 rounded-2xl border border-rose-100">
                    {!recording ? (
                      <button
                        type="button"
                        onClick={startRecording}
                        className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-xl hover:bg-rose-600 text-sm font-medium shadow"
                      >
                        <Mic size={16} /> Записать
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={stopRecording}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-xl hover:bg-gray-900 text-sm font-medium"
                        >
                          <Square size={16} /> Стоп
                        </button>
                        <span className="text-rose-600 font-mono font-semibold animate-pulse">
                          ⏺ {fmtTime(recSeconds)}
                        </span>
                      </>
                    )}
                    <span className="text-xs text-gray-500 ml-auto">
                      Прямо с микрофона
                    </span>
                  </div>
                )}

                {/* Progress bar */}
                {progress > 0 && (
                  <div className="space-y-1">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-rose-500 to-pink-500 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 text-center">
                      {progress < 100 ? `Загрузка ${progress}%` : 'Готово!'}
                    </p>
                  </div>
                )}

                {/* Submit */}
                <button
                  onClick={handleUpload}
                  disabled={uploading || recording}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white font-semibold shadow-md hover:shadow-lg hover:from-rose-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
                >
                  {uploading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Загрузка…
                    </>
                  ) : (
                    <>
                      <Upload size={16} /> Загрузить и опубликовать
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* ────────── Lesson list ────────── */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-3xl border border-rose-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-rose-100 flex items-center gap-3 flex-wrap">
                <h2 className="font-semibold">Все уроки</h2>
                <span className="text-xs px-2 py-0.5 bg-rose-50 text-rose-700 rounded-full font-medium">
                  {filtered.length} из {lessons.length}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {/* Type filter */}
                  <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
                    {[
                      { k: 'all', label: 'Все' },
                      { k: 'video', label: 'Видео' },
                      { k: 'audio', label: 'Аудио' },
                    ].map(t => (
                      <button
                        key={t.k}
                        onClick={() => setTypeFilter(t.k)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                          typeFilter === t.k ? 'bg-white shadow text-rose-600' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {/* Search */}
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Поиск…"
                      className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 w-32 sm:w-44"
                    />
                  </div>
                </div>
              </div>

              {loading && (
                <div className="p-12 text-center text-gray-400">
                  <div className="w-8 h-8 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin mx-auto mb-2" />
                  Загрузка уроков…
                </div>
              )}

              {!loading && filtered.length === 0 && (
                <div className="p-12 text-center">
                  <Video size={48} className="mx-auto text-rose-200 mb-3" />
                  <p className="text-gray-500 font-medium">
                    {lessons.length === 0 ? 'Пока нет уроков' : 'Ничего не найдено'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {lessons.length === 0
                      ? 'Загрузите первый урок в форме слева — он появится здесь.'
                      : 'Попробуйте изменить фильтр или поиск.'}
                  </p>
                </div>
              )}

              <div className="divide-y divide-gray-100">
                {filtered.map(l => (
                  <LessonRow
                    key={l.id}
                    lesson={l}
                    groupById={groupById}
                    fmtDuration={fmtDuration}
                    onDelete={() => setConfirmDelete({ id: l.id, title: l.title })}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AlertModal
        open={!!alertModal}
        onClose={() => setAlertModal(null)}
        title={alertModal?.title || ''}
        message={alertModal?.message || ''}
        variant={alertModal?.variant || 'info'}
      />
      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={performDelete}
        title="Удалить урок?"
        message={
          confirmDelete
            ? `Урок «${confirmDelete.title}» будет удалён.\nЭто действие нельзя отменить.`
            : ''
        }
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
      />
    </AdminLayout>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Lesson card row
// ───────────────────────────────────────────────────────────────────────────
function LessonRow({ lesson: l, groupById, fmtDuration, onDelete }) {
  const isAudio = l.lesson_type === 'audio'
  return (
    <div className="flex items-center gap-4 p-4 hover:bg-rose-50/30 transition">
      {/* Thumb */}
      <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${
        isAudio
          ? 'bg-gradient-to-br from-purple-100 to-pink-100 text-purple-600'
          : 'bg-gradient-to-br from-rose-100 to-pink-100 text-rose-600'
      }`}>
        {isAudio ? <Headphones size={22} /> : <Play size={22} />}
      </div>
      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold truncate">{l.title}</span>
          {l.is_published ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium uppercase">
              Опубликовано
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium uppercase">
              Черновик
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1">
            {isAudio ? <Headphones size={11} /> : <Play size={11} />}
            {isAudio ? 'Аудио' : 'Видео'}
          </span>
          {l.duration_sec > 0 && <span>{fmtDuration(l.duration_sec)}</span>}
          {Array.isArray(l.groups) && l.groups.length > 0 && (
            <span className="flex items-center gap-1 truncate">
              <Users size={11} />
              {l.groups
                .map(gid => groupById[gid] ? `Группа ${groupById[gid].number}` : null)
                .filter(Boolean)
                .join(', ') || `${l.groups.length} групп`}
            </span>
          )}
        </div>
      </div>
      {/* Actions */}
      <button
        onClick={onDelete}
        className="p-2 rounded-xl text-rose-500 hover:bg-rose-100 transition shrink-0"
        title="Удалить урок"
      >
        <Trash2 size={18} />
      </button>
    </div>
  )
}
