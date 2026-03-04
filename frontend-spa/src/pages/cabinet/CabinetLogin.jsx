import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'

export default function CabinetLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const r = await api.post('/cabinet/login/', { username, password })
      localStorage.setItem('cabinet_access_token', r.data.access)
      localStorage.setItem('cabinet_refresh_token', r.data.refresh)
      nav('/cabinet/profile')
    } catch (e) {
      const msg = e.response?.data?.detail || 'Неверный логин или пароль'
      setError(Array.isArray(msg) ? msg[0] : msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-2xl font-bold text-center text-blue-600 mb-1">Личный кабинет</h1>
        <p className="text-center text-gray-400 text-sm mb-2">Вход для клиентов</p>
        <p className="text-center text-gray-500 text-xs mb-4">Логин и пароль выдаёт менеджер (из карточки клиента или при регистрации)</p>
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3 mb-4">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" required placeholder="Логин" value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <input type="password" required placeholder="Пароль" value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-3 rounded-xl text-sm transition">
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
