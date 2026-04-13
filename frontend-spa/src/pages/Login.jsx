import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const LogoIcon = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="white" opacity="0.92"/>
  </svg>
)
import api from '../api/axios'

export default function Login({ defaultMode = 'staff' }) {
  const { login } = useAuth()
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
        // login() сохраняет токены + загружает /accounts/me/ → обновляет AuthContext
        const userData = await login(r.data.access, r.data.refresh)
        nav(userData?.role === 'admin' ? '/admin/dashboard' : '/mobile')
      }
    } catch (e) {
      const msg = e.response?.data?.detail || 'Неверный логин или пароль'
      setError(Array.isArray(msg) ? msg[0] : msg)
    } finally { setLoading(false) }
  }

  const isStaff = mode === 'staff'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 sm:p-10" style={{ background: '#faf7f8' }}>
      <div className="w-full max-w-sm animate-fade-in">

          {/* Лого */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #be185d, #9333ea)' }}>
              <LogoIcon size={18} />
            </div>
            <div>
              <p className="font-bold text-base" style={{ color: 'var(--text)' }}>CRM система</p>
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
            © 2026 CRM система
          </p>
      </div>
    </div>
  )
}
