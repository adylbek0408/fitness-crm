import { useEffect, useState } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import api from '../api/axios'

export default function ProtectedRoute({ role }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!localStorage.getItem('access_token')) {
      setLoading(false)
      return
    }
    api.get('/accounts/me/')
      .then(r => setUser(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg)' }}>
      <div className="w-7 h-7 border-2 rounded-full animate-spin"
           style={{ borderColor: '#f9a8d4', borderTopColor: '#be185d' }} />
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (role === 'admin' && user.role !== 'admin') return <Navigate to="/mobile" replace />
  return <Outlet context={{ user }} />
}
