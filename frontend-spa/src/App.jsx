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
import Trash from './pages/admin/Trash'
import MobileDashboard from './pages/mobile/MobileDashboard'
import ClientRegister from './pages/mobile/ClientRegister'
import ClientList from './pages/mobile/ClientList'
import MobileClientDetail from './pages/mobile/ClientDetail'
import CabinetLogin from './pages/cabinet/CabinetLogin'
import CabinetProfile from './pages/cabinet/CabinetProfile'
import LessonsList from './pages/cabinet/education/LessonsList'
import LessonView from './pages/cabinet/education/LessonView'
import StreamLive from './pages/cabinet/education/StreamLive'
import LessonsAdmin from './pages/admin/education/LessonsAdmin'
import StreamsAdmin from './pages/admin/education/StreamsAdmin'
import ConsultationsAdmin from './pages/admin/education/ConsultationsAdmin'
import ConsultationRoom from './pages/public/ConsultationRoom'
import { RefreshProvider } from './contexts/RefreshContext'
import { AuthProvider } from './contexts/AuthContext'

export default function App() {
  return (
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/cabinet" element={<CabinetLogin />} />
        <Route path="/cabinet/profile" element={<CabinetProfile />} />
        <Route path="/cabinet/lessons" element={<LessonsList />} />
        <Route path="/cabinet/lessons/:id" element={<LessonView />} />
        <Route path="/cabinet/stream" element={<StreamLive />} />
        <Route path="/room/:uuid" element={<ConsultationRoom />} />
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
          <Route path="trash" element={<Trash />} />
          <Route path="education/lessons" element={<LessonsAdmin />} />
          <Route path="education/streams" element={<StreamsAdmin />} />
          <Route path="education/consultations" element={<ConsultationsAdmin />} />
        </Route>
        <Route path="/mobile" element={<RefreshProvider><ProtectedRoute role="any" /></RefreshProvider>}>
          <Route index element={<MobileDashboard />} />
          <Route path="clients" element={<ClientList />} />
          <Route path="clients/register" element={<ClientRegister />} />
          <Route path="clients/:id" element={<MobileClientDetail />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  )
}
