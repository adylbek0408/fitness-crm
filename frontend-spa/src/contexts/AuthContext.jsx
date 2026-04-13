/**
 * AuthContext — глобальное состояние авторизации.
 *
 * Зачем:
 *  - Один вызов /accounts/me/ на всё приложение (не на каждый ProtectedRoute)
 *  - Токены хранятся в localStorage → сессия переживает перезагрузку страницы
 *  - /admin и /mobile шарят один объект user → нет повторного входа при навигации
 *  - login() / logout() доступны из любого компонента через useAuth()
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../api/axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  /**
   * user:
   *   undefined  → ещё грузимся (показываем спиннер)
   *   null       → не авторизован
   *   { id, role, username, display_name, ... } → залогинен
   */
  const [user, setUser] = useState(undefined)

  // ── Загрузить пользователя по токену из localStorage ─────────────────────
  const fetchUser = useCallback(async () => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setUser(null)
      return null
    }
    try {
      const r = await api.get('/accounts/me/')
      setUser(r.data)
      return r.data
    } catch {
      // Токен невалиден или сеть упала → сбрасываем
      setUser(null)
      return null
    }
  }, [])

  // Разовая инициализация при монтировании приложения
  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  // ── Вход (вызывается из Login.jsx после получения токенов) ────────────────
  const login = useCallback(async (accessToken, refreshToken) => {
    localStorage.setItem('access_token',  accessToken)
    localStorage.setItem('refresh_token', refreshToken)
    return await fetchUser()        // возвращает user-объект для навигации
  }, [fetchUser])

  // ── Выход ────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, fetchUser }}>
      {children}
    </AuthContext.Provider>
  )
}

/** Хук для использования в любом компоненте */
export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
