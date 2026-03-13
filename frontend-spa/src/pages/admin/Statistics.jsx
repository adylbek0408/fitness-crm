import { useState, useEffect, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Download, Loader } from 'lucide-react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { fmtMoney } from '../../utils/format'
import { useStatisticsPDF } from '../../hooks/useStatisticsPDF'

export default function Statistics() {
  const { user } = useOutletContext()
  const [dash, setDash] = useState(null)
  const [byGroup, setByGroup] = useState([])
  const [byTrainer, setByTrainer] = useState([])
  const [trainers, setTrainers] = useState([])
  const [filters, setFilters] = useState({ date_from: '', date_to: '', training_format: '', trainer_id: '' })
  const statsRef = useRef(null)
  const { generatePDF, isGenerating } = useStatisticsPDF()

  useEffect(() => {
    api.get('/trainers/?page_size=100').then(r => setTrainers(r.data.results || []))
    loadStats({})
  }, [])

  const loadStats = async (f) => {
    const params = new URLSearchParams()
    if (f.date_from) params.append('date_from', f.date_from)
    if (f.date_to) params.append('date_to', f.date_to)
    if (f.training_format) params.append('training_format', f.training_format)
    if (f.trainer_id) params.append('trainer_id', f.trainer_id)
    const [d, g, t] = await Promise.all([
      api.get(`/statistics/dashboard/?${params}`),
      api.get(`/statistics/by-group/?${params}`),
      api.get(`/statistics/by-trainer/?${params}`),
    ])
    setDash(d.data); setByGroup(g.data); setByTrainer(t.data)
  }

  const set = (k, v) => setFilters(f => ({...f, [k]: v}))
  const statusLabel = { recruitment: 'Набор', active: 'Активный', completed: 'Завершён' }

  const today = new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')
  const filename = `statistics_${today}.pdf`

  return (
    <AdminLayout user={user}>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h2 className="crm-page-title">Статистика</h2>
          <p className="crm-page-subtitle mt-1">Финансовая аналитика по потокам, тренерам и форматам обучения</p>
        </div>
        <button
          type="button"
          onClick={() => generatePDF(statsRef, filename)}
          disabled={isGenerating}
          className="crm-btn-primary disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Loader size={16} className="animate-spin" />
              Генерация...
            </>
          ) : (
            <>
              <Download size={16} />
              Скачать PDF
            </>
          )}
        </button>
      </div>
      <div className="crm-card p-4 mb-6 flex gap-3 flex-wrap items-end">
        {[['date_from','Дата от'],['date_to','Дата до']].map(([k,label]) => (
          <div key={k}><label className="block text-xs text-gray-500 mb-1">{label}</label>
          <input type="date" value={filters[k]} onChange={e => set(k, e.target.value)} className="crm-input w-full sm:w-auto" /></div>
        ))}
        <div><label className="block text-xs text-gray-500 mb-1">Формат</label>
          <select value={filters.training_format} onChange={e => set('training_format', e.target.value)} className="crm-input w-full sm:w-auto">
            <option value="">Все</option><option value="online">Онлайн</option><option value="offline">Оффлайн</option>
          </select></div>
        <div><label className="block text-xs text-gray-500 mb-1">Тренер</label>
          <select value={filters.trainer_id} onChange={e => set('trainer_id', e.target.value)} className="crm-input w-full sm:w-auto">
            <option value="">Все тренеры</option>
            {trainers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select></div>
        <button onClick={() => loadStats(filters)} className="crm-btn-primary">Применить</button>
        <button onClick={() => { const f={date_from:'',date_to:'',training_format:'',trainer_id:''}; setFilters(f); loadStats(f) }} className="crm-btn-secondary">Сбросить</button>
      </div>
      <div ref={statsRef}>
      {dash && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {[['Общий доход', fmtMoney(dash.total_revenue), 'text-blue-600'], ['Онлайн доход', fmtMoney(dash.online_revenue), 'text-indigo-500'], ['Оффлайн доход', fmtMoney(dash.offline_revenue), 'text-purple-500'], ['Всего НБ', dash.total_absences, 'text-red-500']].map(([label, val, color]) => (
            <div key={label} className="crm-card p-5">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{val}</p>
            </div>
          ))}
        </div>
      )}
      <div className="crm-card overflow-hidden mb-6">
        <div className="px-5 py-4 border-b"><h3 className="font-medium text-gray-700">Доход по потокам</h3></div>
        <div className="md:hidden p-3 space-y-2">
          {byGroup.length === 0
            ? <div className="text-center py-6 text-gray-400">Нет данных</div>
            : byGroup.map(g => (
              <div key={g.group_id} className="rounded-xl border border-slate-200 p-3">
                <p className="font-semibold text-slate-900">Поток #{g.group_number}</p>
                <p className="text-sm text-slate-500 mt-1">Тренер: {g.trainer || '—'}</p>
                <p className="text-sm text-slate-500">Статус: {statusLabel[g.status] || g.status}</p>
                <p className="text-sm text-slate-500">Клиентов: {g.client_count}</p>
                <p className="text-sm font-semibold text-blue-600 mt-1">{fmtMoney(g.revenue)}</p>
              </div>
            ))}
        </div>
        <div className="crm-table-wrap hidden md:block">
        <table className="crm-table min-w-[760px]">
          <thead><tr>
            <th>Поток</th>
            <th>Тренер</th>
            <th>Статус</th>
            <th>Клиентов</th>
            <th className="text-right">Доход</th>
          </tr></thead>
          <tbody>
            {byGroup.length === 0 ? <tr><td colSpan={5} className="text-center py-6 text-gray-400">Нет данных</td></tr>
              : byGroup.map(g => (
                <tr key={g.group_id}>
                  <td className="px-5 py-3 font-medium text-gray-800">Поток #{g.group_number}</td>
                  <td className="px-5 py-3 text-gray-600">{g.trainer || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{statusLabel[g.status] || g.status}</td>
                  <td className="px-5 py-3 text-gray-600">{g.client_count}</td>
                  <td className="px-5 py-3 text-right font-medium text-blue-600">{fmtMoney(g.revenue)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        </div>
      </div>
      <div className="crm-card overflow-hidden">
        <div className="px-5 py-4 border-b"><h3 className="font-medium text-gray-700">Доход по тренерам</h3></div>
        <div className="md:hidden p-3 space-y-2">
          {byTrainer.length === 0
            ? <div className="text-center py-6 text-gray-400">Нет данных</div>
            : byTrainer.map(t => (
              <div key={t.trainer_id} className="rounded-xl border border-slate-200 p-3">
                <p className="font-semibold text-slate-900">{t.trainer_name}</p>
                <p className="text-sm text-slate-500 mt-1">Клиентов: {t.client_count}</p>
                <p className="text-sm font-semibold text-blue-600 mt-1">{fmtMoney(t.revenue)}</p>
              </div>
            ))}
        </div>
        <div className="crm-table-wrap hidden md:block">
        <table className="crm-table min-w-[620px]">
          <thead><tr>
            <th>Тренер</th>
            <th>Клиентов</th>
            <th className="text-right">Доход</th>
          </tr></thead>
          <tbody>
            {byTrainer.length === 0 ? <tr><td colSpan={3} className="text-center py-6 text-gray-400">Нет данных</td></tr>
              : byTrainer.map(t => (
                <tr key={t.trainer_id}>
                  <td className="px-5 py-3 font-medium text-gray-800">{t.trainer_name}</td>
                  <td className="px-5 py-3 text-gray-600">{t.client_count}</td>
                  <td className="px-5 py-3 text-right font-medium text-blue-600">{fmtMoney(t.revenue)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        </div>
      </div>
      </div>
    </AdminLayout>
  )
}
