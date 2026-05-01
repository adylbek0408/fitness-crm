import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Upload, Trash2, Plus, CheckCircle2, Headphones, Play,
  Mic, Square, Video, FileAudio, Search, Users,
  X, AlertCircle, ChevronLeft, ChevronRight, Image,
} from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import api from '../../../api/axios'
import AdminLayout from '../../../components/AdminLayout'
import AlertModal from '../../../components/AlertModal'
import ConfirmModal from '../../../components/ConfirmModal'
import HlsPlayer from '../../../components/education/HlsPlayer'

const PAGE_SIZE = 12

export default function LessonsAdmin() {
  const { user } = useOutletContext()
  const [lessons, setLessons]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [groups, setGroups]     = useState([])
  const [search, setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('')
  const [page, setPage] = useState(1)

  const [showForm, setShowForm] = useState(false)

  const [alertModal, setAlertModal] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  // Preview
  const [previewLesson, setPreviewLesson] = useState(null)

  const [recording, setRecording]   = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const recorderRef  = useRef(null)
  const recTimerRef  = useRef(null)
  const recChunksRef = useRef([])

  const [form, setForm] = useState({
    title: '', lesson_type: 'video', file: null, group_ids: [],
  })
  const [thumbnailBlob, setThumbnailBlob] = useState(null)
  const [thumbnailPreview, setThumbnailPreview] = useState('')
  const [thumbLessonId, setThumbLessonId] = useState(null) // for updating existing lesson thumbnail

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

  // ── Thumbnail helpers ────────────────────────────────────────────────────
  const captureVideoFrame = (file) => {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file)
      const video = document.createElement('video')
      video.src = url
      video.muted = true
      video.crossOrigin = 'anonymous'
      video.onloadeddata = () => {
        // seek to 10% of duration (or 2 s, whichever is smaller) to skip black frames
        video.currentTime = Math.min(video.duration * 0.1, 2)
      }
      video.onseeked = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 640
        canvas.height = 360
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, 640, 360)
        URL.revokeObjectURL(url)
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85)
      }
      video.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
      video.load()
    })
  }

  const uploadThumbnailForLesson = async (lessonId, blob) => {
    if (!blob) return
    try {
      const { data } = await api.post(`/education/lessons/${lessonId}/thumbnail-upload-url/`)
      await fetch(data.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      })
    } catch (e) {
      console.warn('Thumbnail upload failed:', e)
    }
  }

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
      setProgress(15)

      // Capture thumbnail from video WHILE video uploads (in parallel)
      let thumbBlob = thumbnailBlob // admin may have pre-selected
      const thumbCapture = (form.lesson_type === 'video' && !thumbBlob)
        ? captureVideoFrame(form.file)
        : Promise.resolve(thumbnailBlob)

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

      setProgress(75)
      thumbBlob = await thumbCapture
      await api.post(`/education/lessons/${lesson.id}/finalize/`, {})
      setProgress(85)

      // Upload thumbnail (non-blocking, errors are soft)
      if (form.lesson_type === 'video') {
        await uploadThumbnailForLesson(lesson.id, thumbBlob)
      }

      setProgress(100)
      setForm({ title: '', lesson_type: 'video', file: null, group_ids: [] })
      setThumbnailBlob(null)
      setThumbnailPreview('')
      setShowForm(false)
      reload()
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

  // ── Filtering + pagination ──────────────────────────────────────────────
  const filtered = useMemo(() => lessons.filter(l => {
    if (typeFilter !== 'all' && l.lesson_type !== typeFilter) return false
    if (groupFilter && !(l.groups || []).includes(groupFilter)) return false
    if (search && !l.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [lessons, typeFilter, groupFilter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  useEffect(() => { setPage(1) }, [search, typeFilter, groupFilter])

  const groupById = Object.fromEntries(groups.map(g => [g.id, g]))

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <AdminLayout user={user}>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        {/* Hero — minimal */}
        <div className="rounded-3xl bg-gradient-to-br from-rose-500 via-pink-500 to-purple-500 p-5 sm:p-7 text-white shadow-xl mb-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold">Уроки</h1>
            <div className="grid grid-cols-2 gap-3 text-sm shrink-0">
              <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-2.5 text-center">
                <div className="text-xs text-rose-100">Всего</div>
                <div className="text-xl font-bold">{lessons.length}</div>
              </div>
              <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-2.5 text-center">
                <div className="text-xs text-rose-100">Опубликовано</div>
                <div className="text-xl font-bold">{lessons.filter(l => l.is_published).length}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3 flex-wrap mb-5">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white font-semibold shadow-md hover:shadow-lg transition"
          >
            <Plus size={18} /> Новый урок
          </button>

          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {[
              { k: 'all', label: 'Все' },
              { k: 'video', label: 'Видео' },
              { k: 'audio', label: 'Аудио' },
            ].map(t => (
              <button
                key={t.k}
                onClick={() => setTypeFilter(t.k)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  typeFilter === t.k ? 'bg-white shadow text-rose-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Group filter */}
          {groups.length > 0 && (
            <select
              value={groupFilter}
              onChange={e => setGroupFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 bg-white text-gray-700"
            >
              <option value="">Все группы</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>Группа {g.number}</option>
              ))}
            </select>
          )}

          <div className="relative ml-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по названию…"
              className="pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 w-48 sm:w-64"
            />
          </div>
        </div>

        {/* Lesson list — card grid */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white border border-rose-100 h-64 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="bg-white rounded-3xl border border-rose-100 shadow-sm py-16 text-center">
            <Video size={48} className="mx-auto text-rose-200 mb-3" />
            <p className="text-gray-500 font-medium">
              {lessons.length === 0 ? 'Пока нет уроков' : 'Ничего не найдено'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {lessons.length === 0 ? 'Нажмите «Новый урок» — заполните форму.' : 'Попробуйте изменить фильтр или поиск.'}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pageItems.map(l => (
                <LessonCard
                  key={l.id}
                  lesson={l}
                  groupById={groupById}
                  fmtDuration={fmtDuration}
                  onPreview={() => setPreviewLesson(l)}
                  onDelete={() => setConfirmDelete({ id: l.id, title: l.title })}
                  onSetThumbnail={() => setThumbLessonId(l.id)}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="p-2 rounded-lg bg-white border border-rose-100 text-gray-500 hover:bg-rose-50 disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-gray-600 px-3">
                  Страница <strong className="text-rose-600">{safePage}</strong> из {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="p-2 rounded-lg bg-white border border-rose-100 text-gray-500 hover:bg-rose-50 disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Upload modal */}
      {showForm && (
        <UploadModal
          form={form}
          setForm={setForm}
          groups={groups}
          uploading={uploading}
          progress={progress}
          recording={recording}
          recSeconds={recSeconds}
          onRecord={startRecording}
          onStopRecord={stopRecording}
          fmtTime={fmtTime}
          thumbnailPreview={thumbnailPreview}
          onVideoFileSelected={async (file) => {
            setThumbnailBlob(null)
            setThumbnailPreview('')
            if (file && file.type.startsWith('video/')) {
              const b = await captureVideoFrame(file)
              setThumbnailBlob(b)
              if (b) setThumbnailPreview(URL.createObjectURL(b))
            }
          }}
          onClose={() => {
            if (recording) stopRecording()
            setThumbnailBlob(null)
            setThumbnailPreview('')
            setShowForm(false)
          }}
          onSubmit={handleUpload}
        />
      )}

      {/* Preview modal */}
      {previewLesson && (
        <PreviewModal
          lesson={previewLesson}
          onClose={() => setPreviewLesson(null)}
        />
      )}

      {/* Thumbnail update modal for existing lessons */}
      {thumbLessonId && (
        <ThumbnailModal
          lessonId={thumbLessonId}
          onClose={() => setThumbLessonId(null)}
          onDone={() => { setThumbLessonId(null); reload() }}
          captureVideoFrame={captureVideoFrame}
          uploadThumbnailForLesson={uploadThumbnailForLesson}
        />
      )}

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
            ? `Урок «${confirmDelete.title}» переместится в корзину. Восстановить можно из раздела «Корзина».`
            : ''
        }
        confirmText="В корзину"
        cancelText="Отмена"
        variant="danger"
      />
    </AdminLayout>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Lesson card — clickable preview, hover delete
// ───────────────────────────────────────────────────────────────────────────
function LessonCard({ lesson: l, groupById, fmtDuration, onPreview, onDelete, onSetThumbnail }) {
  const isAudio = l.lesson_type === 'audio'
  const groupNames = (l.groups || [])
    .map(gid => groupById[gid] ? `Группа ${groupById[gid].number}` : null)
    .filter(Boolean)
  return (
    <div
      onClick={onPreview}
      className="group relative rounded-2xl bg-white border border-rose-100 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition cursor-pointer"
    >
      {/* Thumbnail / type indicator */}
      <div className={`aspect-video relative flex items-center justify-center ${
        isAudio
          ? 'bg-gradient-to-br from-purple-100 to-pink-200'
          : 'bg-gradient-to-br from-rose-100 to-pink-200'
      }`}>
        {/* Background icon — always visible as fallback */}
        {isAudio
          ? <Headphones size={48} className="text-purple-400 opacity-70" />
          : <Play size={48} className="text-rose-400 opacity-70" />
        }

        {/* Thumbnail on top — from CF Stream (auto-generated) or manually set */}
        {!isAudio && l.thumbnail_url && (
          <img
            src={l.thumbnail_url}
            alt={l.title}
            className="absolute inset-0 w-full h-full object-cover"
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        )}

        {/* Top-left: type badge */}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-black/60 text-white backdrop-blur uppercase tracking-wider">
          {isAudio ? 'Аудио' : 'Видео'}
        </div>

        {/* Top-right: status badge */}
        {!l.is_published && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500 text-white">
            Черновик
          </div>
        )}

        {/* Bottom-right: duration */}
        {l.duration_sec > 0 && (
          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-[11px] font-medium bg-black/60 text-white">
            {fmtDuration(l.duration_sec)}
          </div>
        )}

        {/* Play hint on hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition w-14 h-14 rounded-full bg-white/95 flex items-center justify-center shadow-xl">
            <Play size={26} className="text-rose-500 ml-1" fill="currentColor" />
          </div>
        </div>

        {/* Delete button — hover only, bottom-left */}
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="absolute bottom-2 left-2 w-8 h-8 rounded-full bg-white/95 text-rose-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-lg hover:bg-rose-50"
          title="В корзину"
        >
          <Trash2 size={14} />
        </button>

        {/* Thumbnail button — hover only, bottom-right of left side for video */}
        {!isAudio && (
          <button
            onClick={e => { e.stopPropagation(); onSetThumbnail() }}
            className="absolute bottom-2 left-12 w-8 h-8 rounded-full bg-white/95 text-blue-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-lg hover:bg-blue-50"
            title="Обновить превью"
          >
            <Image size={14} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 line-clamp-2 mb-1.5">{l.title}</h3>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {groupNames.length > 0 ? (
            <span className="flex items-center gap-1 truncate">
              <Users size={11} />
              <span className="truncate">{groupNames.join(', ')}</span>
            </span>
          ) : (
            <span className="text-amber-600">Без группы</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Thumbnail update modal (for existing lessons)
// ───────────────────────────────────────────────────────────────────────────
function ThumbnailModal({ lessonId, onClose, onDone, captureVideoFrame, uploadThumbnailForLesson }) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState('')
  const [blob, setBlob] = useState(null)
  const fileRef = useRef()

  const handleFile = async (file) => {
    if (!file) return
    if (file.type.startsWith('video/')) {
      const b = await captureVideoFrame(file)
      setBlob(b)
      if (b) setPreview(URL.createObjectURL(b))
    } else if (file.type.startsWith('image/')) {
      setBlob(file)
      setPreview(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async () => {
    if (!blob) return
    setUploading(true)
    await uploadThumbnailForLesson(lessonId, blob)
    setUploading(false)
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-3xl">
          <h2 className="font-semibold flex items-center gap-2 text-blue-700">
            <Image size={18} /> Обновить превью урока
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-white">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Выберите картинку <strong>или видеофайл</strong> — из видео автоматически
            вырежется кадр.
          </p>

          {preview && (
            <div className="rounded-xl overflow-hidden aspect-video bg-gray-100">
              <img src={preview} alt="preview" className="w-full h-full object-cover" />
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={e => handleFile(e.target.files?.[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full py-3 border-2 border-dashed border-blue-200 rounded-xl text-blue-600 text-sm font-medium hover:bg-blue-50 transition flex items-center justify-center gap-2"
          >
            <Image size={16} /> {preview ? 'Выбрать другой файл' : 'Выбрать файл'}
          </button>

          <button
            onClick={handleSubmit}
            disabled={!blob || uploading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
          >
            {uploading
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Загрузка…</>
              : <><Upload size={16} /> Сохранить превью</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Upload modal
// ───────────────────────────────────────────────────────────────────────────
function UploadModal({
  form, setForm, groups, uploading, progress,
  recording, recSeconds, onRecord, onStopRecord, fmtTime,
  thumbnailPreview, onVideoFileSelected,
  onClose, onSubmit,
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl my-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between bg-gradient-to-r from-rose-50 to-pink-50 rounded-t-3xl">
          <h2 className="font-semibold flex items-center gap-2 text-rose-700">
            <Plus size={18} /> Новый урок
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-white">
            <X size={18} />
          </button>
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
              placeholder="Например, Тренировка №1"
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
          </div>

          {/* File */}
          <div>
            <label className={`flex flex-col items-center justify-center px-4 py-6 rounded-2xl border-2 border-dashed cursor-pointer transition ${
              form.file
                ? 'border-emerald-300 bg-emerald-50/50'
                : 'border-rose-200 bg-rose-50/40 hover:bg-rose-50'
            }`}>
              <input
                type="file"
                accept={form.lesson_type === 'video' ? 'video/mp4,video/*' : 'audio/*'}
                onChange={e => {
                  const f = e.target.files?.[0] || null
                  setForm(prev => ({ ...prev, file: f }))
                  if (f) onVideoFileSelected?.(f)
                }}
                className="hidden"
              />
              {form.file ? (
                <>
                  <CheckCircle2 size={24} className="text-emerald-500 mb-1" />
                  <p className="text-sm font-medium text-emerald-700 truncate max-w-full">
                    {form.file.name}
                  </p>
                  <p className="text-xs text-emerald-600">
                    {(form.file.size / 1024 / 1024).toFixed(1)} МБ
                  </p>
                </>
              ) : (
                <>
                  <Upload size={24} className="text-rose-400 mb-1" />
                  <p className="text-sm font-medium text-rose-600">Выберите файл</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {form.lesson_type === 'video' ? 'MP4 / MOV / WebM' : 'MP3 / WAV / M4A'}
                  </p>
                </>
              )}
            </label>
          </div>

          {/* Thumbnail preview (video only) */}
          {form.lesson_type === 'video' && thumbnailPreview && (
            <div className="rounded-xl overflow-hidden border border-emerald-200 bg-emerald-50 p-2">
              <p className="text-xs text-emerald-700 font-medium mb-1.5 flex items-center gap-1">
                <CheckCircle2 size={12} /> Превью захвачено автоматически
              </p>
              <div className="aspect-video rounded-lg overflow-hidden">
                <img src={thumbnailPreview} alt="thumbnail" className="w-full h-full object-cover" />
              </div>
            </div>
          )}

          {/* Audio recording */}
          {form.lesson_type === 'audio' && (
            <div className="flex items-center gap-3 p-3 bg-rose-50 rounded-2xl border border-rose-100">
              {!recording ? (
                <button
                  type="button"
                  onClick={onRecord}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-xl hover:bg-rose-600 text-sm font-medium shadow"
                >
                  <Mic size={16} /> Записать с микрофона
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onStopRecord}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-xl hover:bg-gray-900 text-sm font-medium"
                  >
                    <Square size={16} /> Стоп
                  </button>
                  <span className="text-rose-600 font-mono font-semibold animate-pulse">
                    ⏺ {fmtTime(recSeconds)}
                  </span>
                </>
              )}
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
            onClick={onSubmit}
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
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Preview modal
// ───────────────────────────────────────────────────────────────────────────
function PreviewModal({ lesson, onClose }) {
  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState(null)

  useEffect(() => {
    api.get(`/education/lessons/${lesson.id}/preview/`)
      .then(r => setInfo(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [lesson.id])

  const isAudio = lesson.lesson_type === 'audio'

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-rose-100">
          <div>
            <h3 className="font-semibold text-lg">{lesson.title}</h3>
            <p className="text-sm text-gray-500">{isAudio ? 'Аудиоурок' : 'Видеоурок'}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-rose-50">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {loading && (
            <div className="flex items-center justify-center h-48">
              <div className="w-8 h-8 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
            </div>
          )}

          {!loading && !info?.playback_url && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-3">
              <AlertCircle size={40} className="text-rose-300" />
              <p className="text-sm text-center">
                Файл ещё обрабатывается или хранилище не настроено.
                <br />
                <span className="text-xs text-gray-400">Попробуйте снова через минуту.</span>
              </p>
            </div>
          )}

          {!loading && info?.playback_url && isAudio && (
            <audio
              controls
              src={info.playback_url}
              className="w-full rounded-xl"
              controlsList="nodownload"
              onContextMenu={e => e.preventDefault()}
            />
          )}

          {!loading && info?.playback_url && !isAudio && (
            <div className="aspect-video bg-black rounded-2xl overflow-hidden">
              <HlsPlayer
                src={info.playback_url}
                kind={info.video_kind || 'hls'}
                autoPlay
                poster={lesson.thumbnail_url || ''}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
