import { useEffect, useState } from 'react'
import { Upload, Trash2, Plus, CheckCircle2, Headphones, Play } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import api from '../../../api/axios'
import AdminLayout from '../../../components/AdminLayout'

/**
 * Admin: list / create / delete / publish lessons.
 *
 * Upload flow:
 *   1) POST /api/education/lessons/upload-init/  → returns { lesson, upload }
 *   2) For video — TUS upload to upload.url (browser-side TUS or PUT chunks).
 *      For MVP we use a simple PUT on the TUS endpoint with full file —
 *      Cloudflare's TUS server accepts a PATCH after initial 0-length create,
 *      but the Direct Creator URL also works with a regular PUT for small files.
 *      For audio we do a single PUT to R2 presigned URL.
 *   3) POST /api/education/lessons/{id}/finalize/ → publishes
 */
export default function LessonsAdmin() {
  const { user } = useOutletContext()
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [groups, setGroups] = useState([])
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    title: '', description: '', lesson_type: 'video',
    file: null, group_ids: [],
  })

  const reload = () => {
    setLoading(true)
    api.get('/education/lessons/')
      .then(r => setLessons(r.data?.results || r.data || []))
      .catch(e => setError(e.response?.data?.detail || 'Ошибка'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reload()
    api.get('/groups/').then(r => setGroups(r.data?.results || r.data || [])).catch(() => {})
  }, [])

  const handleUpload = async () => {
    if (!form.title || !form.file) {
      setError('Укажите название и выберите файл'); return
    }
    setError(''); setUploading(true); setProgress(0)
    try {
      const init = await api.post('/education/lessons/upload-init/', {
        title: form.title,
        description: form.description,
        lesson_type: form.lesson_type,
        groups: form.group_ids,
        file_ext: form.file.name.split('.').pop().toLowerCase(),
      })
      const { lesson, upload } = init.data

      if (upload.kind === 'r2-presigned-put') {
        await fetch(upload.url, {
          method: 'PUT',
          headers: { 'Content-Type': upload.content_type },
          body: form.file,
        }).then(r => { if (!r.ok) throw new Error('R2 upload failed') })
        setProgress(90)
      } else if (upload.kind === 'tus') {
        // Cloudflare Direct Creator TUS endpoint also accepts a single PATCH
        // with the full body for files up to a few hundred MB. For larger files
        // a real TUS client is needed (tus-js-client). For MVP this works.
        const r = await fetch(upload.url, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/offset+octet-stream',
            'Tus-Resumable': '1.0.0',
            'Upload-Offset': '0',
          },
          body: form.file,
        })
        if (!r.ok && r.status !== 204) {
          throw new Error('CF Stream upload failed: ' + r.status)
        }
        setProgress(90)
      }

      await api.post(`/education/lessons/${lesson.id}/finalize/`, {})
      setProgress(100)
      setForm({ title: '', description: '', lesson_type: 'video', file: null, group_ids: [] })
      reload()
    } catch (e) {
      setError(e.message || 'Ошибка загрузки')
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
              onChange={e => setForm({ ...form, lesson_type: e.target.value })}
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
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Удерживайте Ctrl/Cmd для выбора нескольких групп.
            </p>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">
              Файл ({form.lesson_type === 'video' ? 'MP4' : 'MP3/WAV'})
            </label>
            <input
              type="file"
              accept={form.lesson_type === 'video' ? 'video/mp4' : 'audio/*'}
              onChange={e => setForm({ ...form, file: e.target.files?.[0] || null })}
              className="w-full"
            />
          </div>
        </div>

        {progress > 0 && (
          <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-rose-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={uploading}
          className="mt-4 px-5 py-2.5 bg-rose-500 text-white rounded-lg hover:bg-rose-600 disabled:opacity-50 flex items-center gap-2"
        >
          <Upload size={16} /> {uploading ? 'Загрузка…' : 'Загрузить и опубликовать'}
        </button>
      </div>

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
