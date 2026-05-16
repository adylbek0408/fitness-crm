import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, Plus, Pencil, Trash2, Search, X, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../../../api/axios'
import AdminLayout from '../../../components/AdminLayout'
import GroupPicker, { GroupPickerLabel } from '../../../components/ui/GroupPicker'
import { pickList } from '../../../utils/format'

const PAGE_SIZE = 12

function LessonModal({ lesson, groups, onClose, onSaved }) {
  const isEdit = !!lesson
  const [title,   setTitle]   = useState(lesson?.title || '')
  const [desc,    setDesc]    = useState(lesson?.description || '')
  const [content, setContent] = useState(lesson?.content || '')
  const [selGroups, setSelGroups] = useState(
    lesson ? (lesson.groups || []).map(g => (typeof g === 'object' ? g.id : g)) : []
  )
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) { setErr('Введите название'); return }
    if (selGroups.length === 0) { setErr('Выберите хотя бы одну группу — иначе ученики не увидят урок'); return }
    setSaving(true); setErr('')
    try {
      const payload = {
        title:       title.trim(),
        description: desc.trim(),
        content:     content.trim(),
        groups:      selGroups,
      }
      const r = isEdit
        ? await api.patch(`/education/lessons/${lesson.id}/update-text/`, payload)
        : await api.post('/education/lessons/create-text/', payload)
      onSaved(r.data)
      onClose()
    } catch (e) {
      setErr(e.response?.data?.detail || 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <BookOpen size={20} className="text-rose-500" />
          <h2 className="text-base font-semibold flex-1">
            {isEdit ? 'Редактировать урок' : 'Новый текстовый урок'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {err && <p className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-xl">{err}</p>}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Название *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Название урока"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Краткое описание</label>
            <input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Необязательно"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Текст урока</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Введите текст урока…"
              rows={10}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 resize-y leading-relaxed"
            />
          </div>

          <div>
            <GroupPickerLabel>Группы доступа</GroupPickerLabel>
            <GroupPicker
              groups={groups}
              value={selGroups}
              onChange={setSelGroups}
              accent="rose"
              emptyText="Группы загружаются…"
            />
          </div>
        </form>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-medium bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50 transition"
          >
            {saving ? 'Сохранение…' : isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteConfirm({ lesson, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false)
  const handle = async () => {
    setLoading(true)
    try { await api.delete(`/education/lessons/${lesson.id}/`); onDeleted(lesson.id); onClose() }
    catch {} finally { setLoading(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Удалить урок?</h3>
        <p className="text-sm text-gray-600">«{lesson.title}» будет перемещён в корзину.</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Отмена</button>
          <button onClick={handle} disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50">
            {loading ? '…' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TextLessonsAdmin() {
  const [lessons, setLessons] = useState([])
  const [groups,  setGroups]  = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [page,    setPage]    = useState(1)
  const [modal,   setModal]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [lr, gr] = await Promise.all([
        api.get('/education/lessons/?page_size=500&type=text'),
        api.get('/groups/?page_size=200&training_format=online'),
      ])
      setLessons(pickList(lr.data))
      setGroups(pickList(gr.data))
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (!search.trim()) return lessons
    const q = search.toLowerCase()
    return lessons.filter(l =>
      l.title.toLowerCase().includes(q) || (l.content || '').toLowerCase().includes(q)
    )
  }, [lessons, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageItems  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  useEffect(() => setPage(1), [search])

  const groupMap = useMemo(() => Object.fromEntries(groups.map(g => [g.id, g])), [groups])

  const handleSaved = (lesson) => {
    setLessons(prev => {
      const idx = prev.findIndex(l => l.id === lesson.id)
      return idx >= 0 ? prev.map(l => l.id === lesson.id ? lesson : l) : [lesson, ...prev]
    })
  }
  const handleDeleted = (id) => setLessons(prev => prev.filter(l => l.id !== id))

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          <div className="flex items-center gap-2 flex-1">
            <BookOpen size={22} className="text-rose-500" />
            <h1 className="text-xl font-bold text-gray-900">Текстовые уроки</h1>
            <span className="ml-2 px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-xs font-medium">
              {filtered.length}
            </span>
          </div>
          <button
            onClick={() => setModal({ type: 'create' })}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-medium hover:bg-rose-600 transition shadow-sm"
          >
            <Plus size={16} /> Новый урок
          </button>
        </div>

        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию или тексту…"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
          />
        </div>

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white border border-gray-100 h-44 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <BookOpen size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">{lessons.length === 0 ? 'Текстовых уроков пока нет.' : 'Ничего не найдено.'}</p>
          </div>
        )}

        {!loading && pageItems.length > 0 && (
          <div className="flex flex-col gap-2">
            {pageItems.map(l => {
              const lessonGroups = (l.groups || [])
                .map(gid => groupMap[typeof gid === 'object' ? gid.id : gid])
                .filter(Boolean)
              return (
                <div key={l.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-start gap-4 p-4 hover:shadow-md transition-shadow">
                  {/* Icon */}
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                       style={{ background: 'linear-gradient(135deg,#fda4af,#be185d)' }}>
                    <BookOpen size={20} className="text-white" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[14px] text-gray-900 leading-snug truncate">{l.title}</h3>
                    {l.content && (
                      <p className="text-[12px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">{l.content}</p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {lessonGroups.length === 0 && (
                        <span className="text-[11px] text-amber-500 font-medium">⚠ Нет групп</span>
                      )}
                      {lessonGroups.slice(0, 4).map(g => (
                        <span key={g.id} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-50 text-rose-600 border border-rose-100">
                          {g.number}
                        </span>
                      ))}
                      {lessonGroups.length > 4 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">
                          +{lessonGroups.length - 4}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setModal({ type: 'edit', lesson: l })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition"
                    >
                      <Pencil size={12} /> Изменить
                    </button>
                    <button
                      onClick={() => setModal({ type: 'delete', lesson: l })}
                      className="p-1.5 rounded-xl border border-gray-200 text-rose-400 hover:bg-rose-50 transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
              className="p-2.5 rounded-xl bg-white border border-gray-200 text-gray-500 disabled:opacity-40">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-gray-600 px-3">
              <strong className="text-rose-600">{safePage}</strong> / {totalPages}
            </span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
              className="p-2.5 rounded-xl bg-white border border-gray-200 text-gray-500 disabled:opacity-40">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {modal?.type === 'create' && (
        <LessonModal groups={groups} onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
      {modal?.type === 'edit' && (
        <LessonModal lesson={modal.lesson} groups={groups} onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
      {modal?.type === 'delete' && (
        <DeleteConfirm lesson={modal.lesson} onClose={() => setModal(null)} onDeleted={handleDeleted} />
      )}
    </AdminLayout>
  )
}
