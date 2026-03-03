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
        <h2 className="text-2xl font-bold text-gray-800">Статистика</h2>
        <button
          type="button"
          onClick={() => generatePDF(statsRef, filename)}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
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
      <div className="bg-white rounded-2xl p-4 shadow-sm border mb-6 flex gap-3 flex-wrap items-end">
        {[['date_from','Дата от'],['date_to','Дата до']].map(([k,label]) => (
          <div key={k}><label className="block text-xs text-gray-500 mb-1">{label}</label>
          <input type="date" value={filters[k]} onChange={e => set(k, e.target.value)} className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" /></div>
        ))}
        <div><label className="block text-xs text-gray-500 mb-1">Формат</label>
          <select value={filters.training_format} onChange={e => set('training_format', e.target.value)} className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none">
            <option value="">Все</option><option value="online">Онлайн</option><option value="offline">Оффлайн</option>
          </select></div>
        <div><label className="block text-xs text-gray-500 mb-1">Тренер</label>
          <select value={filters.trainer_id} onChange={e => set('trainer_id', e.target.value)} className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none">
            <option value="">Все тренеры</option>
            {trainers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select></div>
        <button onClick={() => loadStats(filters)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-2.5 rounded-xl transition">Применить</button>
        <button onClick={() => { const f={date_from:'',date_to:'',training_format:'',trainer_id:''}; setFilters(f); loadStats(f) }} className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2.5 rounded-xl transition">Сбросить</button>
      </div>
      <div ref={statsRef}>
      {dash && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[['Общий доход', fmtMoney(dash.total_revenue), 'text-blue-600'], ['Онлайн доход', fmtMoney(dash.online_revenue), 'text-indigo-500'], ['Оффлайн доход', fmtMoney(dash.offline_revenue), 'text-purple-500'], ['Всего НБ', dash.total_absences, 'text-red-500']].map(([label, val, color]) => (
            <div key={label} className="bg-white rounded-2xl p-5 shadow-sm border">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{val}</p>
            </div>
          ))}
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden mb-6">
        <div className="px-5 py-4 border-b"><h3 className="font-medium text-gray-700">Доход по потокам</h3></div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr>
            <th className="text-left px-5 py-3 font-medium text-gray-600">Поток</th>
            <th className="text-left px-5 py-3 font-medium text-gray-600">Тренер</th>
            <th className="text-left px-5 py-3 font-medium text-gray-600">Статус</th>
            <th className="text-left px-5 py-3 font-medium text-gray-600">Клиентов</th>
            <th className="text-right px-5 py-3 font-medium text-gray-600">Доход</th>
          </tr></thead>
          <tbody>
            {byGroup.length === 0 ? <tr><td colSpan={5} className="text-center py-6 text-gray-400">Нет данных</td></tr>
              : byGroup.map(g => (
                <tr key={g.group_id} className="border-b hover:bg-gray-50">
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
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="px-5 py-4 border-b"><h3 className="font-medium text-gray-700">Доход по тренерам</h3></div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr>
            <th className="text-left px-5 py-3 font-medium text-gray-600">Тренер</th>
            <th className="text-left px-5 py-3 font-medium text-gray-600">Клиентов</th>
            <th className="text-right px-5 py-3 font-medium text-gray-600">Доход</th>
          </tr></thead>
          <tbody>
            {byTrainer.length === 0 ? <tr><td colSpan={3} className="text-center py-6 text-gray-400">Нет данных</td></tr>
              : byTrainer.map(t => (
                <tr key={t.trainer_id} className="border-b hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{t.trainer_name}</td>
                  <td className="px-5 py-3 text-gray-600">{t.client_count}</td>
                  <td className="px-5 py-3 text-right font-medium text-blue-600">{fmtMoney(t.revenue)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      </div>
    </AdminLayout>
  )
}
