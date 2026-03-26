import { useState, useEffect } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  Globe, Dumbbell, CheckCircle, Clock, Plus,
  UserCircle, BarChart2, TrendingUp, Users, Layers2,
  ArrowUpRight, Calendar, Activity
} from 'lucide-react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { fmtMoney } from '../../utils/format'

function StatCard({ label, value, color, icon: Icon, gradient, trend }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg ${gradient}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-white/70 text-xs font-medium uppercase tracking-widest mb-2">{label}</p>
          <p className="text-3xl font-bold leading-none">{value ?? '—'}</p>
          {trend && <p className="text-white/60 text-xs mt-2">{trend}</p>}
        </div>
        <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center">
          <Icon size={22} strokeWidth={2} className="text-white" />
        </div>
      </div>
      {/* Декоративный круг */}
      <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl p-5 bg-white border border-slate-200 animate-pulse">
      <div className="h-3 bg-slate-200 rounded w-1/2 mb-3" />
      <div className="h-8 bg-slate-200 rounded w-2/3" />
    </div>
  )
}

export default function Dashboard() {
  const { user } = useOutletContext()
  const [stats, setStats] = useState(null)

  useEffect(() => {
    api.get('/statistics/dashboard/').then(r => setStats(r.data))
  }, [])

  const today = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  return (
    <AdminLayout user={user}>
      {/* ── Заголовок ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mb-1">Обзор системы</p>
          <h2 className="crm-page-title">Дашборд</h2>
          <p className="crm-page-subtitle">Оперативные метрики Асылзада CRM</p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
          <Calendar size={15} className="text-indigo-500" />
          <span className="text-sm text-slate-600 capitalize">{today}</span>
        </div>
      </div>

      {/* ── Главные метрики ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {stats ? (
          <>
            <StatCard
              label="Общий доход"
              value={fmtMoney(stats.total_revenue)}
              gradient="bg-gradient-to-br from-rose-500 to-pink-600"
              icon={TrendingUp}
              trend="Все оплаты"
            />
            <StatCard
              label="Активных клиентов"
              value={stats.active_clients}
              gradient="bg-gradient-to-br from-violet-500 to-purple-600"
              icon={Users}
              trend="Сейчас обучаются"
            />
            <StatCard
              label="Активных потоков"
              value={stats.active_groups_count}
              gradient="bg-gradient-to-br from-amber-500 to-orange-600"
              icon={Layers2}
              trend="Идут занятия"
            />
            <StatCard
              label="Всего НБ"
              value={stats.total_absences}
              gradient="bg-gradient-to-br from-slate-500 to-slate-700"
              icon={Activity}
              trend="Пропуски"
            />
          </>
        ) : (
          [1,2,3,4].map(i => <SkeletonCard key={i} />)
        )}
      </div>

      {/* ── Детальные карточки ── */}
      {stats && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-8">
          {/* Доход по форматам */}
          <div className="crm-card p-5">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Globe size={16} className="text-indigo-600" />
              </div>
              <h3 className="font-semibold text-slate-800">Доход по формату</h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Globe size={16} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Онлайн</p>
                    <p className="text-xs text-slate-400">Удалённый формат</p>
                  </div>
                </div>
                <p className="font-bold text-blue-600 crm-money">{fmtMoney(stats.online_revenue)}</p>
              </div>
              <div className="flex items-center justify-between p-3 bg-violet-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center">
                    <Dumbbell size={16} className="text-violet-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Оффлайн</p>
                    <p className="text-xs text-slate-400">Очный формат</p>
                  </div>
                </div>
                <p className="font-bold text-violet-600 crm-money">{fmtMoney(stats.offline_revenue)}</p>
              </div>
            </div>
          </div>

          {/* Статусы оплат */}
          <div className="crm-card p-5">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <CheckCircle size={16} className="text-emerald-600" />
              </div>
              <h3 className="font-semibold text-slate-800">Статус оплат</h3>
            </div>
            <div className="space-y-3">
              {[
                {
                  label: 'Полная оплата (закрыта)',
                  value: stats.closed_full_payments,
                  color: 'text-emerald-600',
                  bg: 'bg-emerald-50',
                  iconBg: 'bg-emerald-100',
                  icon: CheckCircle,
                  iconColor: 'text-emerald-600'
                },
                {
                  label: 'Рассрочка (закрыта)',
                  value: stats.closed_installment_plans,
                  color: 'text-teal-600',
                  bg: 'bg-teal-50',
                  iconBg: 'bg-teal-100',
                  icon: CheckCircle,
                  iconColor: 'text-teal-600'
                },
                {
                  label: 'Рассрочка (частичная)',
                  value: stats.partial_installment_plans,
                  color: 'text-amber-600',
                  bg: 'bg-amber-50',
                  iconBg: 'bg-amber-100',
                  icon: Clock,
                  iconColor: 'text-amber-600'
                },
              ].map(item => {
                const Icon = item.icon
                return (
                  <div key={item.label} className={`flex items-center justify-between p-3 ${item.bg} rounded-xl`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 ${item.iconBg} rounded-lg flex items-center justify-center`}>
                        <Icon size={14} className={item.iconColor} />
                      </div>
                      <p className="text-sm text-slate-700">{item.label}</p>
                    </div>
                    <span className={`text-lg font-bold ${item.color}`}>{item.value}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Быстрые действия ── */}
      <div>
        <p className="crm-section-title">Быстрые действия</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link to="/admin/groups/add"
            className="group crm-card p-5 hover:border-indigo-300 hover:shadow-md transition-all duration-200 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0 group-hover:scale-105 transition-transform">
              <Plus size={22} className="text-white" strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">Новый поток</p>
              <p className="text-xs text-slate-400 mt-0.5">Создать учебную группу</p>
            </div>
            <ArrowUpRight size={16} className="text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0" />
          </Link>

          <Link to="/admin/trainers/add"
            className="group crm-card p-5 hover:border-emerald-300 hover:shadow-md transition-all duration-200 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-200 shrink-0 group-hover:scale-105 transition-transform">
              <UserCircle size={22} className="text-white" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 group-hover:text-emerald-600 transition-colors">Новый тренер</p>
              <p className="text-xs text-slate-400 mt-0.5">Добавить в команду</p>
            </div>
            <ArrowUpRight size={16} className="text-slate-300 group-hover:text-emerald-400 transition-colors shrink-0" />
          </Link>

          <Link to="/admin/statistics"
            className="group crm-card p-5 hover:border-rose-300 hover:shadow-md transition-all duration-200 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500 flex items-center justify-center shadow-lg shadow-rose-200 shrink-0 group-hover:scale-105 transition-transform">
              <BarChart2 size={22} className="text-white" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 group-hover:text-rose-600 transition-colors">Статистика</p>
              <p className="text-xs text-slate-400 mt-0.5">Финансовый отчёт</p>
            </div>
            <ArrowUpRight size={16} className="text-slate-300 group-hover:text-rose-400 transition-colors shrink-0" />
          </Link>
        </div>
      </div>
    </AdminLayout>
  )
}
