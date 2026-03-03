import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/admin/Dashboard'
import Groups from './pages/admin/Groups'
import GroupForm from './pages/admin/GroupForm'
import GroupDetail from './pages/admin/GroupDetail'
import Trainers from './pages/admin/Trainers'
import TrainerForm from './pages/admin/TrainerForm'
import Clients from './pages/admin/Clients'
import ClientDetail from './pages/admin/ClientDetail'
import Statistics from './pages/admin/Statistics'
import Managers from './pages/admin/Managers'
import MobileDashboard from './pages/mobile/MobileDashboard'
import ClientRegister from './pages/mobile/ClientRegister'
import ClientList from './pages/mobile/ClientList'
import MobileClientDetail from './pages/mobile/ClientDetail'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<ProtectedRoute role="admin" />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="groups" element={<Groups />} />
          <Route path="groups/add" element={<GroupForm />} />
          <Route path="groups/:id" element={<GroupForm />} />
          <Route path="groups/:id/detail" element={<GroupDetail />} />
          <Route path="trainers" element={<Trainers />} />
          <Route path="trainers/add" element={<TrainerForm />} />
          <Route path="trainers/:id" element={<TrainerForm />} />
          <Route path="clients" element={<Clients />} />
          <Route path="clients/:id" element={<ClientDetail />} />
          <Route path="statistics" element={<Statistics />} />
          <Route path="managers" element={<Managers />} />
        </Route>
        <Route path="/mobile" element={<ProtectedRoute role="any" />}>
          <Route index element={<MobileDashboard />} />
          <Route path="clients" element={<ClientList />} />
          <Route path="clients/register" element={<ClientRegister />} />
          <Route path="clients/:id" element={<MobileClientDetail />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
