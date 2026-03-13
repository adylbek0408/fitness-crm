import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BriefcaseBusiness, GraduationCap } from 'lucide-react'
import api from '../api/axios'

export default function Login({ defaultMode = 'staff' }) {
  const [mode, setMode] = useState(defaultMode)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()

  useEffect(() => {
    setMode(defaultMode)
  }, [defaultMode])

  const handleSubmit = async e => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      if (mode === 'student') {
        const r = await api.post('/cabinet/login/', { username, password })
        localStorage.setItem('cabinet_access_token', r.data.access)
        localStorage.setItem('cabinet_refresh_token', r.data.refresh)
        nav('/cabinet/profile')
      } else {
        const r = await api.post('/accounts/token/', { username, password })
        localStorage.setItem('access_token', r.data.access)
        localStorage.setItem('refresh_token', r.data.refresh)
        const role = r.data.role
        nav(role === 'admin' ? '/admin/dashboard' : '/mobile')
      }
    } catch (e) {
      const msg = e.response?.data?.detail || 'Неверный логин или пароль'
      setError(Array.isArray(msg) ? msg[0] : msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-[28px] shadow-[0_20px_60px_rgba(15,23,42,0.08)] border border-slate-200 p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white text-lg font-semibold shadow-lg shadow-blue-600/20 mb-4">
            A
          </div>
          <h1 className="text-2xl font-bold text-center text-blue-600 mb-1">Асылзада CRM</h1>
          <p className="text-center text-slate-500 text-sm">Единый вход для сотрудников и учеников</p>
        </div>

        <div className="bg-slate-100 rounded-2xl p-1 grid grid-cols-2 gap-1 mb-5">
          <button
            type="button"
            onClick={() => setMode('staff')}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition ${
              mode === 'staff'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <BriefcaseBusiness size={16} />
            Сотрудник
          </button>
          <button
            type="button"
            onClick={() => setMode('student')}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition ${
              mode === 'student'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <GraduationCap size={16} />
            Ученик
          </button>
        </div>

        <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-800">
            {mode === 'staff' ? 'Вход для сотрудников' : 'Вход в кабинет ученика'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {mode === 'staff'
              ? 'Администратор и менеджер входят по своим служебным данным.'
              : 'Логин и пароль ученику выдает менеджер при регистрации или из карточки клиента.'}
          </p>
        </div>

        {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3 mb-4">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" required placeholder="Логин" value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full border border-slate-300 rounded-2xl px-4 py-3.5 text-[16px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
          <input type="password" required placeholder="Пароль" value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border border-slate-300 rounded-2xl px-4 py-3.5 text-[16px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-3.5 rounded-2xl text-sm transition shadow-lg shadow-blue-600/20">
            {loading ? 'Вход...' : mode === 'staff' ? 'Войти как сотрудник' : 'Войти в кабинет'}
          </button>
        </form>
      </div>
    </div>
  )
}

