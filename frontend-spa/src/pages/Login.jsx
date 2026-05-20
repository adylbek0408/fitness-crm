import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

import api from '../api/axios'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

function GoogleButton({ onCredential, loading }) {
  const btnRef = useRef(null)

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    const scriptId = 'google-gsi'
    if (!document.getElementById(scriptId)) {
      const s = document.createElement('script')
      s.id = scriptId; s.src = 'https://accounts.google.com/gsi/client'; s.async = true
      document.head.appendChild(s)
      s.onload = () => initGoogle()
    } else if (window.google?.accounts) {
      initGoogle()
    }
    function initGoogle() {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp) => onCredential(resp.credential),
      })
      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: 'outline', size: 'large', width: btnRef.current.offsetWidth || 340,
          text: 'signin_with', shape: 'rectangular', logo_alignment: 'left',
        })
      }
    }
  }, [onCredential])

  if (!GOOGLE_CLIENT_ID) return null

  return (
    <div className="flex flex-col items-center gap-3 mt-1">
      <div className="flex items-center gap-3 w-full">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs text-slate-400 whitespace-nowrap">или</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      <div ref={btnRef} className="w-full" style={{ minHeight: 44 }} />
      {loading && (
        <span className="text-xs text-slate-400">Входим через Google...</span>
      )}
    </div>
  )
}

export default function Login({ defaultMode = 'staff' }) {
  const { login } = useAuth()
  const [mode, setMode] = useState(defaultMode)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
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

  const handleGoogleCredential = async (credential) => {
    setGoogleLoading(true); setError('')
    try {
      const r = await api.post('/cabinet/google-auth/', { credential })
      localStorage.setItem('cabinet_access_token', r.data.access)
      localStorage.setItem('cabinet_refresh_token', r.data.refresh)
      nav('/cabinet/profile')
    } catch (e) {
      setError(e.response?.data?.detail || 'Ошибка входа через Google')
    } finally { setGoogleLoading(false) }
  }

  const isStaff = mode === 'staff'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 sm:p-10" style={{ background: '#faf7f8' }}>
      <div className="w-full max-w-sm animate-fade-in">

          {/* Лого */}
          <div className="flex items-center gap-3 mb-8">
            <img src="/logo.png" alt="Айым Сыры" className="w-16 h-16 object-contain shrink-0" />
            <div>
              <p className="font-bold text-base" style={{ color: 'var(--text)' }}>Айым Сыры CRM</p>
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

          {!isStaff && (
            <GoogleButton onCredential={handleGoogleCredential} loading={googleLoading} />
          )}

          <p className="text-center text-xs mt-8" style={{ color: 'var(--text-xs)' }}>
            {isStaff
              ? 'Логин и пароль выдаёт администратор'
              : 'Данные для входа выдаёт менеджер при регистрации'}
          </p>

          <p className="text-center text-xs mt-6" style={{ color: '#d4b8c8' }}>
            © 2026 Айым Сыры CRM
          </p>
      </div>
    </div>
  )
}
