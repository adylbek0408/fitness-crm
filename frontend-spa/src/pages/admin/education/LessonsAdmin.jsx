import { useEffect, useRef, useState } from 'react'
import { Upload, Trash2, Plus, CheckCircle2, Headphones, Play, Mic, Square } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import api from '../../../api/axios'
import AdminLayout from '../../../components/AdminLayout'

/**
 * Admin: list / create / delete / publish lessons.
 *
 * Upload flow:
 *   1) POST /api/education/lessons/upload-init/  → returns { lesson, upload }
 *   2a) upload.kind === 'cf-direct'  → POST to upload.url with video binary
 *   2b) upload.kind === 'r2-presigned-put' → PUT to upload.url with file binary
 *   3) POST /api/education/lessons/{id}/finalize/ → publishes
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
  const [error, setError]       = useState('')

  // recording state
  const [recording, setRecording]   = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const recorderRef  = useRef(null)
  const recTimerRef  = useRef(null)
  const recChunksRef = useRef([])

  const [form, setForm] = useState({
    title: '', description: '', lesson_type: 'video',
    file: null, group_ids: [],
  })

  const reload = () => {
    setLoading(true)
    api.get('/education/lessons/')
      .then(r => setLessons(r.data?.results || r.data || []))
      .catch(e => setError(e.response?.data?.detail || 'Ошибка загрузки'))
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
    setError('')
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
      setError('Нет доступа к микрофону: ' + (e.message || e))
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
    clearInterval(recTimerRef.current)
    setRecording(false)
  }

  const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  // ── Upload lesson ────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!form.title) { setError('Укажите название'); return }
    if (!form.file)  { setError('Выберите файл или запишите аудио'); return }
    setError(''); setUploading(true); setProgress(5)
    try {
      const init = await api.post('/education/lessons/upload-init/', {
        title: form.title,
        description: form.description,
        lesson_type: form.lesson_type,
        groups: form.group_ids,
        file_ext: form.file.name.split('.').pop().toLowerCase(),
      })
      const { lesson, upload } = init.data
      setProgress(20)

      if (upload.kind === 'cf-direct') {
        // Cloudflare Stream direct upload (POST with video binary)
        const r = await fetch(upload.url, {
          method: 'POST',
          headers: { 'Content-Type': 'video/mp4' },
          body: form.file,
        })
        if (!r.ok) throw new Error('CF Stream upload failed: ' + r.status)

      } else if (upload.kind === 'r2-presigned-put') {
        // R2 presigned PUT (audio or video fallback)
        const r = await fetch(upload.url, {
          method: 'PUT',
          headers: { 'Content-Type': upload.content_type },
          body: form.file,
        })
        if (!r.ok) throw new Error('R2 upload failed: ' + r.status)
      }

      setProgress(85)
      await api.post(`/education/lessons/${lesson.id}/finalize/`, {})
      setProgress(100)
      setForm({ title: '', description: '', lesson_type: 'video', file: null, group_ids: [] })
      reload()
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Ошибка загрузки')
    } finally {
      setUploading(false)
      setTimeout(() => setProgress(0), 1500)
    }
  }

  const handleDelete = async id => {
    if (!confirm('Удалить урок?')) return
    await api.delete(`/education/lessons/${id}/`)
    reload()
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <AdminLayout user={user}>
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Уроки</h1>

      <div className="bg-white rounded-2xl border p-6 mb-6 shadow-sm">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Plus size={18} /> Загрузить новый урок
        </h2>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-sm mb-3">{error}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Название</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Тип</label>
            <select
              value={form.lesson_type}
              onChange={e => setForm({ ...form, lesson_type: e.target.value, file: null })}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="video">Видео</option>
              <option value="audio">Аудио</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Описание</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          {/* Groups */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Группы (доступ)</label>
            <select
              multiple
              value={form.group_ids}
              onChange={e => setForm({
                ...form,
                group_ids: Array.from(e.target.selectedOptions).map(o => o.value),
              })}
              className="w-full px-3 py-2 border rounded-lg h-32"
            >
              {groups.map(g => (
                <option key={g.id} value={g.id}>
                  Группа {g.number}{g.trainer ? ` — ${g.trainer.first_name} ${g.trainer.last_name}` : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {groups.length === 0
                ? 'Группы загружаются…'
                : 'Удерживайте Ctrl/Cmd для выбора нескольких групп.'}
            </p>
          </div>

          {/* File picker */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">
              Файл ({form.lesson_type === 'video' ? 'MP4' : 'MP3 / WAV'})
            </label>
            <input
              type="file"
              accept={form.lesson_type === 'video' ? 'video/mp4,video/*' : 'audio/*'}
              onChange={e => setForm({ ...form, file: e.target.files?.[0] || null })}
              className="w-full"
            />
            {form.file && (
              <p className="text-xs text-emerald-600 mt-1">
                ✓ {form.file.name} ({(form.file.size / 1024 / 1024).toFixed(1)} МБ)
              </p>
            )}
          </div>

          {/* Audio recorder (only for audio type) */}
          {form.lesson_type === 'audio' && (
            <div className="md:col-span-2 flex items-center gap-3 p-3 bg-rose-50 rounded-xl border border-rose-100">
              {!recording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 text-sm font-medium"
                >
                  <Mic size={16} /> Записать с микрофона
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 text-sm font-medium"
                  >
                    <Square size={16} /> Стоп
                  </button>
                  <span className="text-rose-600 font-mono font-semibold animate-pulse">
                    ⏺ {fmtTime(recSeconds)}
                  </span>
                </>
              )}
              <span className="text-xs text-gray-500">
                Или выберите файл выше
              </span>
            </div>
          )}
        </div>

        {progress > 0 && (
          <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-rose-500 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={uploading || recording}
          className="mt-4 px-5 py-2.5 bg-rose-500 text-white rounded-lg hover:bg-rose-600 disabled:opacity-50 flex items-center gap-2"
        >
          <Upload size={16} /> {uploading ? 'Загрузка…' : 'Загрузить и опубликовать'}
        </button>
      </div>

      {/* Lessons list */}
      <div className="bg-white rounded-2xl border shadow-sm">
        <div className="p-4 border-b font-semibold">Список уроков ({lessons.length})</div>
        {loading && <div className="p-6 text-center text-gray-400">Загрузка…</div>}
        <div className="divide-y">
          {lessons.map(l => (
            <div key={l.id} className="flex items-center gap-4 p-4 hover:bg-gray-50">
              <div className="w-12 h-12 rounded-lg bg-rose-100 flex items-center justify-center text-rose-500">
                {l.lesson_type === 'audio' ? <Headphones size={22} /> : <Play size={22} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{l.title}</div>
                <div className="text-xs text-gray-500">
                  {l.lesson_type === 'audio' ? 'Аудио' : 'Видео'}
                  {l.is_published && (
                    <span className="ml-2 text-emerald-600 inline-flex items-center gap-0.5">
                      <CheckCircle2 size={12} /> опубликовано
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(l.id)}
                className="p-2 rounded-lg text-rose-500 hover:bg-rose-50"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
          {!loading && lessons.length === 0 && (
            <div className="p-6 text-center text-gray-400">Пока нет уроков.</div>
          )}
        </div>
      </div>
    </div>
    </AdminLayout>
  )
}
