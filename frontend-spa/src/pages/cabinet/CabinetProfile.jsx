import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import api from '../../api/axios'
import { fmtMoney, fmtDate, STATUS_LABEL, GROUP_TYPE_LABEL } from '../../utils/format'

export default function CabinetProfile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const nav = useNavigate()

  useEffect(() => {
    const t = localStorage.getItem('cabinet_access_token')
    if (!t) {
      nav('/cabinet')
      return
    }
    const loadProfile = () => {
      setLoading(true)
      setError('')
      api.get('/cabinet/me/')
        .then(r => setProfile(r.data))
        .catch(e => {
          if (e.response?.status === 401) {
            nav('/cabinet')
            return
          }
          const d = e.response?.data
          const msg = d?.detail ?? (d && typeof d === 'object' ? JSON.stringify(d) : null) ?? e.message ?? 'Ошибка загрузки'
          setError(Array.isArray(msg) ? msg[0] : String(msg))
        })
        .finally(() => setLoading(false))
    }
    loadProfile()
  }, [nav])

  const retry = () => {
    setError('')
    setLoading(true)
    api.get('/cabinet/me/')
      .then(r => setProfile(r.data))
      .catch(e => {
        if (e.response?.status === 401) nav('/cabinet')
        else setError(e.response?.data?.detail || e.message || 'Ошибка загрузки')
      })
      .finally(() => setLoading(false))
  }

  const logout = () => {
    localStorage.removeItem('cabinet_access_token')
    localStorage.removeItem('cabinet_refresh_token')
    nav('/cabinet')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <p className="text-slate-500">Загрузка...</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button type="button" onClick={retry}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">
            Повторить
          </button>
          <p className="text-slate-500 text-xs mt-4">Если не помогло — откройте страницу входа и войдите снова.</p>
        </div>
      </div>
    )
  }
  if (!profile) return null

  const groupTypeLabel = GROUP_TYPE_LABEL[profile.group_type] || profile.group_type
  const statusLabel = STATUS_LABEL[profile.status] || profile.status

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100">
      <div className="max-w-lg mx-auto px-4 py-8 pb-20">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl shadow-lg p-6 mb-6 text-white">
          <h1 className="text-xl font-bold">Личный кабинет</h1>
          <p className="text-2xl font-semibold mt-2 tracking-tight">
            {profile.last_name} {profile.first_name}
          </p>
          {profile.status && (
            <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium bg-white/20">
              {statusLabel}
            </span>
          )}
        </div>

        {/* Баланс бонусов */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-4">
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Баланс бонусов</h2>
          <p className="text-2xl font-bold text-emerald-600">{fmtMoney(profile.balance)}</p>
        </section>

        {/* Мои данные */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-4">
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-4">Мои данные</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Телефон</dt>
              <dd className="font-medium text-slate-800">{profile.phone ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Формат</dt>
              <dd className="font-medium text-slate-800">{profile.training_format === 'online' ? 'Онлайн' : 'Оффлайн'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Тип группы</dt>
              <dd className="font-medium text-slate-800">{groupTypeLabel}</dd>
            </div>
            {profile.registered_at && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Дата регистрации</dt>
                <dd className="font-medium text-slate-800">{fmtDate(profile.registered_at)}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Текущий поток */}
        {profile.current_group && (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-4">
            <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-4">Текущий поток</h2>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">Поток #{profile.current_group.number}</span>
              <span className="text-sm text-slate-500">
                {profile.current_group.status === 'active' && 'Идёт обучение'}
                {profile.current_group.status === 'recruitment' && 'Набор'}
                {profile.current_group.status === 'completed' && 'Завершён'}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {GROUP_TYPE_LABEL[profile.current_group.group_type] || profile.current_group.group_type}
            </p>
          </section>
        )}

        {/* Завершённые потоки */}
        {profile.completed_flows && profile.completed_flows.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-4">
            <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-4">Завершённые потоки</h2>
            <ul className="space-y-2">
              {profile.completed_flows.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <Check size={16} className="text-emerald-600 shrink-0" />
                  <span className="font-medium">Поток #{f.number}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500">{GROUP_TYPE_LABEL[f.group_type] || f.group_type}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(!profile.current_group && (!profile.completed_flows || profile.completed_flows.length === 0)) && (
          <section className="bg-slate-50 rounded-2xl border border-slate-100 p-5 mb-4">
            <p className="text-sm text-slate-500">Информация о потоках отобразится после зачисления в группу.</p>
          </section>
        )}

        {/* Выйти */}
        <button
          type="button"
          onClick={logout}
          className="w-full mt-6 py-4 rounded-2xl text-sm font-medium text-slate-600 bg-white border border-slate-200 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition"
        >
          Выйти
        </button>
      </div>
    </div>
  )
}
