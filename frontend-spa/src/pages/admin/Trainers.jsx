import { useState, useEffect } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Plus, Phone, Calendar, Edit2, UserX } from 'lucide-react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'

function TrainerAvatar({ name }) {
  const parts = (name || '').split(' ')
  const initials = parts.slice(0, 2).map(p => p[0] || '').join('').toUpperCase()
  const colors = [
    'from-indigo-500 to-violet-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-500',
    'from-rose-500 to-pink-600',
    'from-sky-500 to-blue-600',
  ]
  const colorIdx = name ? name.charCodeAt(0) % colors.length : 0
  return (
    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${colors[colorIdx]} flex items-center justify-center text-white font-bold text-base shadow-md shrink-0`}>
      {initials || '?'}
    </div>
  )
}

export default function Trainers() {
  const { user } = useOutletContext()
  const [trainers, setTrainers] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const r = await api.get('/trainers/?page_size=100')
    setTrainers(r.data.results || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const deactivate = async (id, name) => {
    if (!confirm(`Деактивировать тренера ${name}?`)) return
    try { await api.delete(`/trainers/${id}/`); load() }
    catch (e) { alert(e.response?.data?.detail || 'Ошибка') }
  }

  return (
    <AdminLayout user={user}>
      {/* Заголовок */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mb-1">Команда</p>
          <h2 className="crm-page-title">Тренеры</h2>
          <p className="crm-page-subtitle">Состав команды и управление активностью</p>
        </div>
        <Link to="/admin/trainers/add" className="crm-btn-primary">
          <Plus size={16} /> Новый тренер
        </Link>
      </div>

      {/* Скелетон */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="crm-card p-5 animate-pulse flex gap-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-200 shrink-0" />
              <div className="flex-1">
                <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Пустое */}
      {!loading && trainers.length === 0 && (
        <div className="crm-card p-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <Plus size={24} className="text-slate-300" />
          </div>
          <p className="text-slate-500 font-medium mb-1">Тренеров пока нет</p>
          <p className="text-slate-400 text-sm mb-5">Добавьте первого тренера в команду</p>
          <Link to="/admin/trainers/add" className="crm-btn-primary">
            <Plus size={15} /> Добавить тренера
          </Link>
        </div>
      )}

      {/* Карточки тренеров */}
      {!loading && trainers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {trainers.map(t => (
            <div key={t.id}
              className="crm-card p-5 hover:shadow-md transition-all duration-200 group">
              {/* Верх: аватар + имя */}
              <div className="flex items-start gap-4 mb-4">
                <TrainerAvatar name={t.full_name} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                    {t.full_name}
                  </h3>
                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Активен
                  </span>
                </div>
              </div>

              {/* Детали */}
              <div className="space-y-2.5 mb-4">
                {t.phone && (
                  <div className="flex items-center gap-2.5 text-sm">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <Phone size={13} className="text-slate-500" />
                    </div>
                    <span className="text-slate-600">{t.phone}</span>
                  </div>
                )}
                {t.schedule && (
                  <div className="flex items-start gap-2.5 text-sm">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                      <Calendar size={13} className="text-slate-500" />
                    </div>
                    <span className="text-slate-600 line-clamp-2">{t.schedule}</span>
                  </div>
                )}
                {!t.phone && !t.schedule && (
                  <p className="text-xs text-slate-400 italic">Контакты не указаны</p>
                )}
              </div>

              {/* Действия */}
              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <Link to={`/admin/trainers/${t.id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-semibold hover:bg-indigo-100 transition border border-indigo-100">
                  <Edit2 size={13} /> Изменить
                </Link>
                <button onClick={() => deactivate(t.id, t.full_name)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-500 text-xs font-medium hover:bg-red-100 transition border border-red-100">
                  <UserX size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}
