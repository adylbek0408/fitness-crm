import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'
import CabinetLogin from './pages/cabinet/CabinetLogin'
import { RefreshProvider } from './contexts/RefreshContext'
import { AuthProvider } from './contexts/AuthContext'

// ── Lazy chunks ──────────────────────────────────────────────────────────
// Admin
const Dashboard      = lazy(() => import('./pages/admin/Dashboard'))
const Groups         = lazy(() => import('./pages/admin/Groups'))
const GroupForm      = lazy(() => import('./pages/admin/GroupForm'))
const GroupDetail    = lazy(() => import('./pages/admin/GroupDetail'))
const Trainers       = lazy(() => import('./pages/admin/Trainers'))
const TrainerForm    = lazy(() => import('./pages/admin/TrainerForm'))
const Clients        = lazy(() => import('./pages/admin/Clients'))
const ClientDetail   = lazy(() => import('./pages/admin/ClientDetail'))
const Statistics     = lazy(() => import('./pages/admin/Statistics'))
const Managers       = lazy(() => import('./pages/admin/Managers'))
const Trash          = lazy(() => import('./pages/admin/Trash'))
// Education (heaviest bundles — biggest win from code splitting)
const LessonsAdmin       = lazy(() => import('./pages/admin/education/LessonsAdmin'))
const StreamsAdmin       = lazy(() => import('./pages/admin/education/StreamsAdmin'))
const BroadcastPage      = lazy(() => import('./pages/admin/education/BroadcastPage'))
const ConsultationsAdmin = lazy(() => import('./pages/admin/education/ConsultationsAdmin'))
const EducationStats     = lazy(() => import('./pages/admin/education/EducationStats'))
// Mobile
const MobileDashboard    = lazy(() => import('./pages/mobile/MobileDashboard'))
const ClientRegister     = lazy(() => import('./pages/mobile/ClientRegister'))
const ClientList         = lazy(() => import('./pages/mobile/ClientList'))
const MobileClientDetail = lazy(() => import('./pages/mobile/ClientDetail'))
// Cabinet
const CabinetProfile = lazy(() => import('./pages/cabinet/CabinetProfile'))
const LessonsList    = lazy(() => import('./pages/cabinet/education/LessonsList'))
const LessonView     = lazy(() => import('./pages/cabinet/education/LessonView'))
const StreamLive     = lazy(() => import('./pages/cabinet/education/StreamLive'))
const StreamArchive  = lazy(() => import('./pages/cabinet/education/StreamArchive'))
// Public
const ConsultationRoom = lazy(() => import('./pages/public/ConsultationRoom'))

function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#faf7f8' }}
    >
      <div className="flex flex-col items-center gap-3">
        <span
          className="w-8 h-8 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin"
          aria-hidden="true"
        />
        <span className="text-xs text-rose-400 font-medium tracking-wide">Загрузка…</span>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/cabinet" element={<CabinetLogin />} />
              <Route path="/cabinet/profile" element={<CabinetProfile />} />
              <Route path="/cabinet/lessons" element={<LessonsList />} />
              <Route path="/cabinet/lessons/:id" element={<LessonView />} />
              <Route path="/cabinet/stream" element={<StreamLive />} />
              <Route path="/cabinet/archive" element={<StreamArchive />} />
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
                <Route path="education/broadcast/:id" element={<BroadcastPage />} />
                <Route path="education/consultations" element={<ConsultationsAdmin />} />
                <Route path="education/stats" element={<EducationStats />} />
              </Route>
              <Route path="/mobile" element={<RefreshProvider><ProtectedRoute role="any" /></RefreshProvider>}>
                <Route index element={<MobileDashboard />} />
                <Route path="clients" element={<ClientList />} />
                <Route path="clients/register" element={<ClientRegister />} />
                <Route path="clients/:id" element={<MobileClientDetail />} />
              </Route>
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}
