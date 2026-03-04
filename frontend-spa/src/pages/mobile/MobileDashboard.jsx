import { Link, useOutletContext } from 'react-router-dom'
import MobileLayout from '../../components/MobileLayout'

export default function MobileDashboard() {
  const { user } = useOutletContext()
  const roleMap = { admin: 'Администратор', registrar: 'Регистратор' }
  return (
    <MobileLayout>
      <h2 className="text-xl font-bold text-gray-800 mb-6">Добро пожаловать</h2>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Link to="/mobile/clients/register" className="bg-blue-600 text-white rounded-2xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:bg-blue-700 transition">
          <span className="text-3xl mb-2">➕</span><span className="text-sm font-medium">Регистрация клиента</span>
        </Link>
        <Link to="/mobile/clients" className="bg-white text-gray-700 rounded-2xl p-5 flex flex-col items-center justify-center text-center shadow-sm hover:bg-gray-50 transition border">
          <span className="text-3xl mb-2">👥</span><span className="text-sm font-medium">База клиентов</span>
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
