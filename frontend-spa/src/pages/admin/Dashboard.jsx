import { useState, useEffect } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Globe, Dumbbell, CheckCircle, Clock, Plus, UserCircle, BarChart2 } from 'lucide-react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { fmtMoney } from '../../utils/format'

export default function Dashboard() {
  const { user } = useOutletContext()
  const [stats, setStats] = useState(null)

  useEffect(() => {
    api.get('/statistics/dashboard/').then(r => setStats(r.data))
  }, [])

  const cards = stats ? [
    { label: 'Общий доход',       value: fmtMoney(stats.total_revenue),  color: 'text-blue-600' },
    { label: 'Активных клиентов', value: stats.active_clients,            color: 'text-green-600' },
    { label: 'Активных потоков',  value: stats.active_groups_count,       color: 'text-purple-600' },
    { label: 'НБ всего',          value: stats.total_absences,            color: 'text-red-500' },
  ] : []

  return (
    <AdminLayout user={user}>
      <div className="flex items-center justify-between mb-8 gap-3 flex-wrap">
        <h2 className="crm-page-title">Дашборд</h2>
        <span className="text-sm crm-muted">
          {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        {stats ? cards.map(c => (
          <div key={c.label} className="crm-card p-5">
            <p className="text-sm crm-muted">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
          </div>
        )) : [1,2,3,4].map(i => (
          <div key={i} className="crm-card p-5 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
            <div className="h-8 bg-gray-200 rounded w-1/2" />
          </div>
        ))}
      </div>
      {stats && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-8">
          <div className="crm-card p-5">
            <h3 className="font-medium text-slate-700 mb-4">Доход по формату</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center"><span className="text-gray-500 flex items-center gap-1"><Globe size={16} /> Онлайн</span><span className="font-medium">{fmtMoney(stats.online_revenue)}</span></div>
              <div className="flex justify-between items-center"><span className="text-gray-500 flex items-center gap-1"><Dumbbell size={16} /> Оффлайн</span><span className="font-medium">{fmtMoney(stats.offline_revenue)}</span></div>
            </div>
          </div>
          <div className="crm-card p-5">
            <h3 className="font-medium text-slate-700 mb-4">Статус оплат</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center"><span className="text-gray-500 flex items-center gap-1"><CheckCircle size={16} /> Закрытых (полная)</span><span className="font-medium text-green-600">{stats.closed_full_payments}</span></div>
              <div className="flex justify-between items-center"><span className="text-gray-500 flex items-center gap-1"><CheckCircle size={16} /> Закрытых (рассрочка)</span><span className="font-medium text-green-600">{stats.closed_installment_plans}</span></div>
              <div className="flex justify-between items-center"><span className="text-gray-500 flex items-center gap-1"><Clock size={16} /> Частичных</span><span className="font-medium text-orange-500">{stats.partial_installment_plans}</span></div>
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <Link to="/admin/groups/add" className="crm-btn-primary rounded-2xl p-5 text-center shadow-sm block">
          <Plus className="mx-auto mb-2" size={28} strokeWidth={2} />
          <div className="text-sm font-medium">Новый поток</div>
        </Link>
        <Link to="/admin/trainers/add" className="crm-card hover:bg-slate-50 text-slate-700 rounded-2xl p-5 text-center transition block">
          <UserCircle className="mx-auto mb-2 text-gray-600" size={28} strokeWidth={2} />
          <div className="text-sm font-medium">Новый тренер</div>
        </Link>
        <Link to="/admin/statistics" className="crm-card hover:bg-slate-50 text-slate-700 rounded-2xl p-5 text-center transition block">
          <BarChart2 className="mx-auto mb-2 text-gray-600" size={28} strokeWidth={2} />
          <div className="text-sm font-medium">Статистика</div>
        </Link>
      </div>
    </AdminLayout>
  )
}
