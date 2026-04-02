import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import StudentDashboard from './pages/StudentDashboard';
import AdminDashboard from './pages/AdminDashboard';
import CaseDetail from './pages/CaseDetail';
import CalendarView from './pages/CalendarView';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import RoleProtectedRoute from './components/RoleProtectedRoute';
import TestAuth from './pages/TestAuth';

const DashboardRouter = () => {
  const { currentUser, userRole } = useAuth();

  if (!currentUser) return <Navigate to="/login" replace />;
  if (userRole === 'admin') return <AdminDashboard />;
  if (userRole === 'law_student') return <StudentDashboard />;

  return <Navigate to="/login" replace />;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/test-auth" element={<TestAuth />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardRouter />} />

          <Route path="cases/:caseId" element={<CaseDetail />} />
          <Route path="calendar" element={<CalendarView />} />

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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;