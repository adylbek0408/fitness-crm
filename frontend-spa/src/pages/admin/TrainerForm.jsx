import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link, useOutletContext } from 'react-router-dom'
import { Save, ArrowLeft, Phone, User } from 'lucide-react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'

function Field({ label, required, children, hint }) {
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

export default function TrainerForm() {
  const { id } = useParams()
  const isEdit = id && id !== 'add'
  const nav = useNavigate()
  const { user } = useOutletContext()
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isEdit) {
      api.get(`/trainers/${id}/`).then(r => {
        const t = r.data
        setForm({ first_name: t.first_name, last_name: t.last_name, phone: t.phone || '' })
      })
    }
  }, [id])

  const handleSubmit = async e => {
    e.preventDefault(); setError(''); setSuccess(''); setSaving(true)
    try {
      if (isEdit) await api.put(`/trainers/${id}/`, form)
      else await api.post('/trainers/', form)
      setSuccess(isEdit ? 'Тренер обновлён!' : 'Тренер создан!')
      setTimeout(() => nav('/admin/trainers'), 1200)
    } catch (e) {
      const d = e.response?.data
      setError(typeof d === 'object' ? Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(' | ') : 'Ошибка')
    } finally { setSaving(false) }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <AdminLayout user={user}>
      {/* Хедер */}
      <div className="flex items-center gap-3 mb-8 flex-wrap">
        <Link to="/admin/trainers"
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 text-sm transition">
          <ArrowLeft size={16} /> Назад
        </Link>
        <div className="w-px h-5 bg-slate-200" />
        <div>
          <h2 className="crm-page-title">{isEdit ? 'Редактировать тренера' : 'Новый тренер'}</h2>
          <p className="crm-page-subtitle">
            {isEdit ? `${form.last_name} ${form.first_name}` : 'Добавить в команду'}
          </p>
        </div>
      </div>

      {error && <div className="crm-toast-error mb-5">{error}</div>}
      {success && <div className="crm-toast-success mb-5">{success}</div>}

      <div className="max-w-xl">
        <form onSubmit={handleSubmit}>
          <div className="crm-card p-6 space-y-5 mb-6">
            <p className="crm-section-title">Личные данные</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Фамилия" required>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input required value={form.last_name}
                    onChange={e => set('last_name', e.target.value)}
                    placeholder="Иванов"
                    className="crm-input pl-9" />
                </div>
              </Field>
              <Field label="Имя" required>
                <input required value={form.first_name}
                  onChange={e => set('first_name', e.target.value)}
                  placeholder="Алексей"
                  className="crm-input" />
              </Field>
            </div>

            <Field label="Телефон" hint="Укажите номер в формате +996...">
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="+996 700 000 000"
                  className="crm-input pl-9" />
              </div>
            </Field>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button type="submit" disabled={saving}
              className="crm-btn-primary disabled:opacity-60">
              {saving
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Сохранение...</>
                : <><Save size={16} /> {isEdit ? 'Обновить' : 'Создать тренера'}</>
              }
            </button>
            <Link to="/admin/trainers" className="crm-btn-secondary">Отмена</Link>
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}
