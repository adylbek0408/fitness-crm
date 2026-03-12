import { Link, useOutletContext } from 'react-router-dom'
import { UserPlus, Users } from 'lucide-react'
import MobileLayout from '../../components/MobileLayout'
import { useRefresh } from '../../contexts/RefreshContext'

export default function MobileDashboard() {
  const { user } = useOutletContext()
  useRefresh(() => Promise.resolve())
  const roleMap = { admin: 'Администратор', registrar: 'Регистратор' }
  return (
    <MobileLayout>
      <h2 className="text-xl font-bold text-gray-800 mb-6">Добро пожаловать</h2>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Link to="/mobile/clients/register" className="bg-blue-600 text-white rounded-2xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:bg-blue-700 transition">
          <UserPlus className="mb-2" size={32} strokeWidth={2} />
          <span className="text-sm font-medium">Регистрация клиента</span>
        </Link>
        <Link to="/mobile/clients" className="bg-white text-gray-700 rounded-2xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:bg-gray-50 transition border">
          <Users className="mb-2 text-gray-600" size={32} strokeWidth={2} />
          <span className="text-sm font-medium">База клиентов</span>
        </Link>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm border">
        <p className="text-sm text-gray-500">Вы вошли как:</p>
        <p className="font-medium text-gray-800">{user?.username}</p>
        <p className="text-xs text-blue-500 mt-1">{roleMap[user?.role] || user?.role}</p>
      </div>
    </MobileLayout>
  )
}
