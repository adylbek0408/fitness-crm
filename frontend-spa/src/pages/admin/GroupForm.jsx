import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link, useOutletContext } from 'react-router-dom'
import { Save, ArrowLeft, Calendar, Clock } from 'lucide-react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'

const DAYS = [
  { key: 'Mon', label: 'Пн' },
  { key: 'Tue', label: 'Вт' },
  { key: 'Wed', label: 'Ср' },
  { key: 'Thu', label: 'Чт' },
  { key: 'Fri', label: 'Пт' },
  { key: 'Sat', label: 'Сб' },
  { key: 'Sun', label: 'Вс' },
]

// Формат расписания: "Mon,Wed,Fri 22:59 00:30"
// parts[0] = дни, parts[1] = время начала, parts[2] = время окончания
function parseSchedule(schedule) {
  if (!schedule) return { days: [], time: '', end_time: '' }
  const parts = schedule.split(' ')
  const days = (parts[0] || '').split(',').filter(d => DAYS.some(x => x.key === d))
  return { days, time: parts[1] || '', end_time: parts[2] || '' }
}

function buildSchedule(days, time, end_time) {
  if (!days.length) return ''
  let s = days.join(',')
  if (time) s += ` ${time}`
  if (time && end_time) s += ` ${end_time}`
  return s
}

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

export default function GroupForm() {
  const { id } = useParams()
  const isEdit = id && id !== 'add'
  const nav = useNavigate()
  const { user } = useOutletContext()
  const [trainers, setTrainers] = useState([])
  const [form, setForm] = useState({
    number: '', group_type: '', trainer: '',
    schedule_days: [], schedule_time: '', schedule_end_time: '',
    start_date: '', end_date: '', status: 'recruitment'
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/trainers/?page_size=100').then(r => setTrainers(r.data.results || []))
    if (isEdit) {
      api.get(`/groups/${id}/`).then(r => {
        const g = r.data
        const { days, time, end_time } = parseSchedule(g.schedule)
        setForm({
          number: g.number, group_type: g.group_type,
          trainer: g.trainer?.id || '',
          schedule_days: days, schedule_time: time, schedule_end_time: end_time,
          start_date: g.start_date || '', end_date: g.end_date || '',
          status: g.status,
        })
      })
    }
  }, [id])

  const toggleDay = (day) => {
    setForm(f => {
      const days = f.schedule_days.includes(day)
        ? f.schedule_days.filter(d => d !== day)
        : [...f.schedule_days, day]
      return { ...f, schedule_days: DAYS.map(d => d.key).filter(d => days.includes(d)) }
    })
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault(); setError(''); setSuccess(''); setSaving(true)
    const schedule = buildSchedule(form.schedule_days, form.schedule_time, form.schedule_end_time)
    const body = {
      number: parseInt(form.number),
      group_type: form.group_type,
      trainer: form.trainer,
      schedule,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      status: form.status,
    }
    try {
      if (isEdit) await api.put(`/groups/${id}/`, body)
      else await api.post('/groups/', body)
      setSuccess(isEdit ? 'Поток обновлён!' : 'Поток создан!')
      setTimeout(() => nav('/admin/groups'), 1200)
    } catch (e) {
      const d = e.response?.data
      setError(typeof d === 'object' ? Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(' | ') : 'Ошибка')
    } finally { setSaving(false) }
  }

  // Превью расписания
  const dayLabels = form.schedule_days.length
    ? DAYS.filter(d => form.schedule_days.includes(d.key)).map(d => d.label).join(', ')
    : null

  const schedulePreview = dayLabels
    ? dayLabels
      + (form.schedule_time ? ` · ${form.schedule_time}` : '')
      + (form.schedule_time && form.schedule_end_time ? ` — ${form.schedule_end_time}` : '')
    : null

  return (
    <AdminLayout user={user}>
      {/* Хедер */}
      <div className="flex items-center gap-3 mb-8 flex-wrap">
        <Link to="/admin/groups"
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 text-sm transition">
          <ArrowLeft size={16} /> Назад
        </Link>
        <div className="w-px h-5 bg-slate-200" />
        <div>
          <h2 className="crm-page-title">{isEdit ? 'Редактировать поток' : 'Новый поток'}</h2>
          <p className="crm-page-subtitle">{isEdit ? `Поток #${form.number}` : 'Создание учебной группы'}</p>
        </div>
      </div>

      {error && <div className="crm-toast-error mb-5">{error}</div>}
      {success && <div className="crm-toast-success mb-5">{success}</div>}

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          {/* Основная информация */}
          <div className="crm-card p-6 space-y-6 mb-5">
            <p className="crm-section-title">Основная информация</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Номер потока" required>
                <input type="number" required value={form.number}
                  onChange={e => set('number', e.target.value)}
                  placeholder="например: 101"
                  className="crm-input" />
              </Field>
              <Field label="Тип группы" required>
                <select required value={form.group_type}
                  onChange={e => set('group_type', e.target.value)}
                  className="crm-input">
                  <option value="">Выберите тип</option>
                  <option value="1.5h">1.5 часа</option>
                  <option value="2.5h">2.5 часа</option>
                </select>
              </Field>
            </div>

            <Field label="Тренер" required>
              <select required value={form.trainer}
                onChange={e => set('trainer', e.target.value)}
                className="crm-input">
                <option value="">Выберите тренера</option>
                {trainers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </Field>

            <Field label="Статус">
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'recruitment', label: 'Набор',    color: 'border-amber-300 bg-amber-50 text-amber-700' },
                  { value: 'active',      label: 'Активный', color: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
                  { value: 'completed',   label: 'Завершён', color: 'border-slate-300 bg-slate-50 text-slate-600' },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => set('status', opt.value)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition ${
                      form.status === opt.value ? opt.color : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* Расписание */}
          <div className="crm-card p-6 space-y-5 mb-5">
            <p className="crm-section-title">Расписание</p>

            <Field label="Дни занятий">
              <div className="flex gap-2 flex-wrap">
                {DAYS.map(day => (
                  <button key={day.key} type="button" onClick={() => toggleDay(day.key)}
                    className={`w-12 h-12 rounded-xl text-sm font-bold border-2 transition active:scale-95 ${
                      form.schedule_days.includes(day.key)
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200'
                        : 'bg-white text-slate-400 border-slate-200 hover:border-indigo-300 hover:text-indigo-500'
                    }`}>
                    {day.label}
                  </button>
                ))}
              </div>
            </Field>

            {/* Время начала и окончания */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Время начала">
                <div className="relative">
                  <Clock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="time" value={form.schedule_time}
                    onChange={e => set('schedule_time', e.target.value)}
                    className="crm-input pl-9" />
                </div>
              </Field>
              <Field label="Время окончания">
                <div className="relative">
                  <Clock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="time" value={form.schedule_end_time}
                    onChange={e => set('schedule_end_time', e.target.value)}
                    className="crm-input pl-9" />
                </div>
              </Field>
            </div>

            {/* Превью расписания */}
            {schedulePreview && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl">
                <Calendar size={14} className="text-indigo-500 shrink-0" />
                <span className="text-sm text-indigo-700 font-medium">{schedulePreview}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Дата старта">
                <input type="date" value={form.start_date}
                  onChange={e => set('start_date', e.target.value)}
                  className="crm-input" />
              </Field>
              <Field label="Дата окончания">
                <input type="date" value={form.end_date}
                  onChange={e => set('end_date', e.target.value)}
                  className="crm-input" />
              </Field>
            </div>
          </div>

          {/* Кнопки */}
          <div className="flex gap-3 flex-wrap">
            <button type="submit" disabled={saving}
              className="crm-btn-primary disabled:opacity-60">
              {saving
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Сохранение...</>
                : <><Save size={16} /> {isEdit ? 'Обновить поток' : 'Создать поток'}</>
              }
            </button>
            <Link to="/admin/groups" className="crm-btn-secondary">Отмена</Link>
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}
