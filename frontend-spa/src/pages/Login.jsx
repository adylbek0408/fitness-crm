import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Eye, EyeOff } from 'lucide-react'
import api from '../api/axios'

export default function Login({ defaultMode = 'staff' }) {
  const [mode, setMode] = useState(defaultMode)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()

  useEffect(() => {
    setMode(defaultMode)
    // Очищаем протухшие кабинетные токены чтобы axios не слал их с логин-запросом
    if (defaultMode === 'student') {
      localStorage.removeItem('cabinet_access_token')
      localStorage.removeItem('cabinet_refresh_token')
    }
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
        nav(r.data.role === 'admin' ? '/admin/dashboard' : '/mobile')
      }
    } catch (e) {
      const msg = e.response?.data?.detail || 'Неверный логин или пароль'
      setError(Array.isArray(msg) ? msg[0] : msg)
    } finally { setLoading(false) }
  }

  const isStaff = mode === 'staff'

  return (
    <div className="min-h-screen flex overflow-hidden" style={{ background: '#faf7f8' }}>

      {/* ── Левая декоративная панель (только десктоп) ── */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-5/12 flex-col items-center justify-center p-12 relative overflow-hidden"
           style={{ background: 'linear-gradient(150deg, #1a1023 0%, #2d1040 50%, #1a1030 100%)' }}>

        {/* Декоративные пузыри */}
        <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full opacity-20 pointer-events-none"
             style={{ background: 'radial-gradient(circle, #be185d 0%, transparent 70%)' }} />
        <div className="absolute -bottom-10 -right-10 w-64 h-64 rounded-full opacity-15 pointer-events-none"
             style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)' }} />
        <div className="absolute top-1/3 right-0 w-48 h-48 rounded-full opacity-10 pointer-events-none"
             style={{ background: 'radial-gradient(circle, #f472b6 0%, transparent 70%)' }} />

        <div className="relative z-10 text-center max-w-sm">
          {/* Иконка */}
          <div className="w-20 h-20 rounded-3xl mx-auto mb-8 flex items-center justify-center shadow-2xl"
               style={{ background: 'linear-gradient(135deg, #be185d, #7c3aed)' }}>
            <Activity size={36} className="text-white" strokeWidth={1.5} />
          </div>

          <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">Асылзада</h1>
          <p className="text-lg font-medium mb-2" style={{ color: '#f9a8d4' }}>Fitness Center</p>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Система управления фитнес-центром — учёт клиентов, потоков, посещаемости и финансов
          </p>

          {/* Декоративные dots */}
          <div className="flex items-center justify-center gap-2 mt-10">
            {[1,2,3].map(i => (
              <div key={i} className="rounded-full"
                   style={{ width: i === 2 ? 24 : 8, height: 8, background: i === 2 ? '#be185d' : 'rgba(255,255,255,0.2)' }} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Правая форма ── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm animate-fade-in">

          {/* Мобильное лого */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #be185d, #7c3aed)' }}>
              <Activity size={18} className="text-white" strokeWidth={2} />
            </div>
            <div>
              <p className="font-bold text-base" style={{ color: 'var(--text)' }}>Асылзада CRM</p>
              <p className="text-xs" style={{ color: 'var(--text-xs)' }}>Fitness Center</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)', letterSpacing: '-0.03em' }}>
            Добро пожаловать
          </h2>
          <p className="text-sm mb-8" style={{ color: 'var(--text-xs)' }}>Войдите в свой аккаунт</p>

          {/* Переключатель */}
          <div className="flex gap-1 p-1 rounded-xl mb-6"
               style={{ background: '#f2eaf0' }}>
            {[
              { value: 'staff',   label: 'Сотрудник' },
              { value: 'student', label: 'Ученик'    },
            ].map(({ value, label }) => (
              <button key={value} type="button" onClick={() => { setMode(value); setError('') }}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                style={mode === value
                  ? { background: '#fff', color: '#be185d', fontWeight: 600, boxShadow: '0 1px 6px rgba(190,24,93,0.15)' }
                  : { color: 'var(--text-soft)' }
                }>
                {label}
              </button>
            ))}
          </div>

          {error && (
            <div className="crm-toast-error mb-4 animate-fade-in">{error}</div>
          )}

          {/* Форма */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="crm-label">Логин</label>
              <input
                type="text" required
                placeholder={isStaff ? 'Логин сотрудника' : 'Логин ученика'}
                value={username} onChange={e => setUsername(e.target.value)}
                className="crm-input"
                style={{ height: 42, fontSize: 14, borderRadius: 10 }}
              />
            </div>

            <div>
              <label className="crm-label">Пароль</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'} required
                  placeholder="Введите пароль"
                  value={password} onChange={e => setPassword(e.target.value)}
                  className="crm-input pr-10"
                  style={{ height: 42, fontSize: 14, borderRadius: 10 }}
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition"
                  style={{ color: 'var(--text-xs)' }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 disabled:opacity-60 mt-2"
              style={{
                background: 'linear-gradient(135deg, #be185d, #7c3aed)',
                boxShadow: '0 4px 16px rgba(190,24,93,0.30)',
                borderRadius: 10,
              }}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Входим...
                </span>
              ) : isStaff ? 'Войти как сотрудник' : 'Войти в кабинет'}
            </button>
          </form>

          <p className="text-center text-xs mt-8" style={{ color: 'var(--text-xs)' }}>
            {isStaff
              ? 'Логин и пароль выдаёт администратор'
              : 'Данные для входа выдаёт менеджер при регистрации'}
          </p>

          <p className="text-center text-xs mt-6" style={{ color: '#d4b8c8' }}>
            © 2026 Асылзада Fitness Center
          </p>
        </div>
      </div>
    </div>
  )
}
