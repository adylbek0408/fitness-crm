/**
 * ProtectedRoute — охранник маршрутов.
 *
 * Использует AuthContext (глобальный стейт) вместо локального useState.
 * Это означает:
 *  - /accounts/me/ вызывается ОДИН РАЗ на всё приложение
 *  - Переход /admin ↔ /mobile не триггерит повторный логин
 *  - Состояние user кэшировано до logout()
 */
import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ role }) {
  const { user } = useAuth()

  // undefined = идёт первичная загрузка (fetchUser ещё не завершился)
  if (user === undefined) {
    return (
      <div className="flex items-center justify-center h-screen"
           style={{ background: 'var(--bg)' }}>
        <div className="w-7 h-7 border-2 rounded-full animate-spin"
             style={{ borderColor: '#f9a8d4', borderTopColor: '#be185d' }} />
      </div>
    )
  }

  // null = не авторизован
  if (!user) return <Navigate to="/login" replace />

  // Роль не совпадает — перенаправляем на подходящий раздел
  if (role === 'admin' && user.role !== 'admin') return <Navigate to="/mobile" replace />

  // Передаём user дочерним компонентам через Outlet context
  return <Outlet context={{ user }} />
}
