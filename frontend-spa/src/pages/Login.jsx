import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

import api from '../api/axios'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

function GoogleSignInButton({ onCredential, loading }) {
  const btnRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const scriptId = 'google-gsi'
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
      setReady(true)
    }
    if (!document.getElementById(scriptId)) {
      const s = document.createElement('script')
      s.id = scriptId; s.src = 'https://accounts.google.com/gsi/client'; s.async = true
      document.head.appendChild(s)
      s.onload = () => initGoogle()
    } else if (window.google?.accounts) {
      initGoogle()
    }
  }, [onCredential])

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div ref={btnRef} className="w-full" style={{ minHeight: 44 }} />
      {!ready && (
        <div className="w-full h-11 rounded-lg bg-slate-100 animate-pulse" />
      )}
      {loading && (
        <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-xs)' }}>
          <span className="w-4 h-4 border-2 border-slate-300 border-t-pink-500 rounded-full animate-spin" />
          Входим через Google...
        </span>
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
    if (defaultMode === 'student') {
      localStorage.removeItem('cabinet_access_token')
      localStorage.removeItem('cabinet_refresh_token')
    }
  }, [defaultMode])

  const handleSubmit = async e => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const r = await api.post('/accounts/token/', {
        username: username.trim(),
        password: password.trim(),
      })
      const userData = await login(r.data.access, r.data.refresh)
      nav(userData?.role === 'admin' ? '/admin/dashboard' : '/mobile')
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
      setError(e.response?.data?.detail || 'Ошибка входа через Google. Убедитесь, что ваш Google аккаунт привязан к профилю.')
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
        <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: '#f2eaf0' }}>
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

        {/* Ученик — только Google */}
        {!isStaff ? (
          <div className="flex flex-col items-center gap-6">
            <div className="text-center">
              <p className="text-sm" style={{ color: 'var(--text-xs)' }}>
                Для входа используйте Google аккаунт,<br />привязанный к вашему профилю
              </p>
            </div>

            {GOOGLE_CLIENT_ID ? (
              <GoogleSignInButton onCredential={handleGoogleCredential} loading={googleLoading} />
            ) : (
              <div className="w-full py-3 px-4 rounded-xl text-sm text-center" style={{ background: '#f2eaf0', color: 'var(--text-xs)' }}>
                Google вход не настроен. Обратитесь к администратору.
              </div>
            )}

            <p className="text-xs text-center" style={{ color: 'var(--text-xs)' }}>
              Доступ к кабинету выдаётся менеджером при регистрации
            </p>
          </div>
        ) : (
          /* Сотрудник — логин/пароль */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="crm-label">Логин</label>
              <input
                type="text" required
                placeholder="Логин сотрудника"
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
              ) : 'Войти как сотрудник'}
            </button>

            <p className="text-center text-xs mt-2" style={{ color: 'var(--text-xs)' }}>
              Логин и пароль выдаёт администратор
            </p>
          </form>
        )}

        <p className="text-center text-xs mt-8" style={{ color: '#d4b8c8' }}>
          © 2026 Айым Сыры CRM
        </p>
      </div>
    </div>
  )
}
