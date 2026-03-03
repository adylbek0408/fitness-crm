import { Link, useNavigate } from 'react-router-dom'

export default function MobileLayout({ children }) {
  const nav = useNavigate()
  const logout = () => { localStorage.clear(); nav('/login') }

  return (
    <div className="bg-gray-50 min-h-screen">
      <nav className="bg-white shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <span className="font-bold text-blue-600 text-lg">Fitness CRM</span>
        <div className="flex gap-3">
          <Link to="/mobile/clients" className="text-sm text-gray-600">Клиенты</Link>
          <Link to="/mobile/clients/register" className="text-sm text-blue-600 font-medium">+ Регистрация</Link>
          <button onClick={logout} className="text-sm text-red-500">Выйти</button>
        </div>
      </nav>
      <main className="max-w-lg mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
