import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import StudentDashboard from './pages/StudentDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminAllCases from './pages/AdminAllCases';
import CaseDetail from './pages/CaseDetail';
import CalendarView from './pages/CalendarView';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import RoleProtectedRoute from './components/RoleProtectedRoute';
import ManageUsers from './pages/Manageusers';
import AdminSettings from './pages/AdminSettings';
import StudentCases from './pages/StudentCases';
import NewCase from './pages/NewCase';
import GroupManagement from './pages/GroupManagement';
import LegalAssistant from './pages/LegalAssistant';
import LawyerAssignment from './pages/LawyerAssignment';

const DashboardRouter = () => {
  const { currentUser, userRole } = useAuth();

  if (!currentUser) return <Navigate to="/login" replace />;
  if (userRole === 'admin') return <AdminDashboard />;
  if (userRole === 'law_student') return <StudentDashboard />;
  if (userRole === 'lawyer') return <StudentCases />;

  return <Navigate to="/login" replace />;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardRouter />} />

          <Route path="calendar" element={<CalendarView />} />
          <Route
            path="assistant"
            element={
              <RoleProtectedRoute allowedRoles={['admin', 'law_student', 'supervisor', 'lawyer']}>
                <LegalAssistant />
              </RoleProtectedRoute>
            }
          />

          <Route
            path="admin"
            element={
              <RoleProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </RoleProtectedRoute>
            }
          />

          <Route
            path="student"
            element={
              <RoleProtectedRoute allowedRoles={['law_student']}>
                <StudentDashboard />
              </RoleProtectedRoute>
            }
          />

          <Route
            path="admin/users"
            element={
              <RoleProtectedRoute allowedRoles={['admin']}>
                <ManageUsers />
              </RoleProtectedRoute>
            }
          />

          <Route
            path="admin/cases"
            element={
              <RoleProtectedRoute allowedRoles={['admin']}>
                <AdminAllCases />
              </RoleProtectedRoute>
            }
          />

          <Route
            path="admin/groups"
            element={
              <RoleProtectedRoute allowedRoles={['admin']}>
                <GroupManagement />
              </RoleProtectedRoute>
            }
          />

          <Route
            path="admin/lawyer-assignment"
            element={
              <RoleProtectedRoute allowedRoles={['admin']}>
                <LawyerAssignment />
              </RoleProtectedRoute>
            }
          />

          <Route
            path="admin/settings"
            element={
              <RoleProtectedRoute allowedRoles={['admin']}>
                <AdminSettings />
              </RoleProtectedRoute>
            }
          />

          <Route
            path="cases"
            element={
              <RoleProtectedRoute allowedRoles={['law_student', 'lawyer']}>
                <StudentCases />
              </RoleProtectedRoute>
            }
          />

          <Route
            path="cases/new"
            element={
              <RoleProtectedRoute allowedRoles={['law_student']}>
                <NewCase />
              </RoleProtectedRoute>
            }
          />

          <Route
            path="cases/:caseId"
            element={
              <RoleProtectedRoute allowedRoles={['admin', 'law_student', 'lawyer']}>
                <CaseDetail />
              </RoleProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
