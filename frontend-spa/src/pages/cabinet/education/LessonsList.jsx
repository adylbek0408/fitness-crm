import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Play, Headphones, BookOpen, Clock, ChevronLeft, ChevronRight, CheckCircle2, Search,
} from 'lucide-react'
import api from '../../../api/axios'
import LessonThumb from '../../../components/education/LessonThumb'
import CabinetNav from '../../../components/CabinetNav'
import { pickList } from '../../../utils/format'

const PAGE_SIZE = 12

function formatDuration(sec) {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const TABS = [
  { key: 'all',   label: 'Все' },
  { key: 'video', label: 'Видео' },
  { key: 'audio', label: 'Аудио' },
  { key: 'text',  label: 'Текст' },
]

export default function LessonsList() {
  const [lessons, setLessons] = useState([])
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const nav = useNavigate()

  useEffect(() => {
    if (!localStorage.getItem('cabinet_access_token')) {
      nav('/cabinet'); return
    }
    setLoading(true); setError('')
    const params = tab === 'all' ? '' : `?type=${tab}`
    api.get(`/cabinet/education/lessons/${params}`)
      .then(r => setLessons(pickList(r.data)))
      .catch(e => setError(e.response?.data?.detail || 'Ошибка загрузки'))
      .finally(() => setLoading(false))
  }, [tab, nav])

  const filtered = useMemo(() => {
    if (!search.trim()) return lessons
    const q = search.toLowerCase()
    return lessons.filter(l => (l.title || '').toLowerCase().includes(q))
  }, [lessons, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  useEffect(() => { setPage(1) }, [tab, search])

  return (
    <div className="min-h-screen pb-20" style={{ background: '#fdf8fa' }}>
      <header className="bg-white border-b border-rose-100 sticky top-0 z-10">
        <div className="max-w-md sm:max-w-3xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-2">
          <Link to="/cabinet/profile" className="p-2 rounded-xl hover:bg-rose-50 active:bg-rose-100" aria-label="Назад">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-[17px] font-semibold flex-1 truncate">Мои уроки</h1>
          <span className="text-[11px] text-gray-400 px-1.5 py-0.5 rounded bg-rose-50">{filtered.length}</span>
        </div>

        <div className="max-w-md sm:max-w-3xl mx-auto px-3 sm:px-4 pb-3 space-y-2">
          {/* Search — full width on mobile */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Найти урок…"
              className="w-full pl-9 pr-3 py-2 border border-rose-100 rounded-xl text-[13px] bg-rose-50/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-200 placeholder-gray-400"
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-full text-[12.5px] font-medium transition ${
                  tab === t.key
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-rose-50 text-rose-600 active:bg-rose-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-md sm:max-w-3xl mx-auto px-3 sm:px-4 py-4">
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 text-rose-700 text-[13px]">
            {error}
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white border border-rose-100 h-40 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <Play size={42} className="mx-auto mb-3 opacity-40" />
            <p className="text-[14px]">{lessons.length === 0 ? 'Уроков пока нет.' : 'Ничего не найдено.'}</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
              {pageItems.map(l => (
                <Link
                  key={l.id}
                  to={`/cabinet/lessons/${l.id}`}
                  className="group rounded-2xl bg-white border border-rose-100 overflow-hidden shadow-sm active:scale-[0.99] hover:shadow-md transition"
                >
                  {l.lesson_type === 'text' ? (
                    /* Text lesson card */
                    <>
                      <div className="aspect-video relative flex items-center justify-center"
                           style={{ background: 'linear-gradient(135deg, #fda4af, #be185d)' }}>
                        <BookOpen size={32} className="text-white/80" />
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/40 text-white">
                          Текст
                        </div>
                        {l.progress?.is_completed && (
                          <div className="absolute top-2 right-2 text-emerald-300">
                            <CheckCircle2 size={18} fill="white" />
                          </div>
                        )}
                      </div>
                      <div className="p-2.5 sm:p-3.5">
                        <h3 className="font-semibold text-[12px] sm:text-[14px] text-gray-900 line-clamp-2 leading-snug">
                          {l.title}
                        </h3>
                        {l.description && (
                          <p className="text-[11px] sm:text-[12px] text-gray-500 line-clamp-2 mt-1">
                            {l.description}
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    /* Video / Audio card */
                    <>
                      <div className="aspect-video relative">
                        <LessonThumb
                          src={l.lesson_type === 'audio' ? '' : (l.thumbnail_url || '')}
                          title={l.title}
                          lessonType={l.lesson_type}
                        />
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/60 text-white backdrop-blur">
                          {l.lesson_type === 'audio' ? 'Аудио' : 'Видео'}
                        </div>
                        {!!l.duration_sec && (
                          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-[10.5px] bg-black/60 text-white">
                            <Clock size={11} className="inline mr-1" />
                            {formatDuration(l.duration_sec)}
                          </div>
                        )}
                        {l.progress?.is_completed && (
                          <div className="absolute top-2 right-2 text-emerald-400">
                            <CheckCircle2 size={20} fill="white" />
                          </div>
                        )}
                      </div>
                      <div className="p-2.5 sm:p-3.5">
                        <h3 className="font-semibold text-[12px] sm:text-[14px] text-gray-900 line-clamp-2 leading-snug">
                          {l.title}
                        </h3>
                        {l.description && (
                          <p className="text-[11px] sm:text-[12px] text-gray-500 line-clamp-2 mt-1">
                            {l.description}
                          </p>
                        )}
                        {(l.progress?.percent || 0) > 0 && (
                          <div className="mt-2 h-1 bg-rose-50 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-rose-400 to-pink-500"
                              style={{ width: `${l.progress.percent}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </Link>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  aria-label="Предыдущая страница"
                  className="p-2.5 rounded-xl bg-white border border-rose-100 text-gray-500 active:bg-rose-50 disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-[13px] text-gray-600 px-3">
                  <strong className="text-rose-600">{safePage}</strong> / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  aria-label="Следующая страница"
                  className="p-2.5 rounded-xl bg-white border border-rose-100 text-gray-500 active:bg-rose-50 disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </main>
      <CabinetNav />
    </div>
  )
}
