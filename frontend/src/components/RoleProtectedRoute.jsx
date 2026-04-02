import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RoleProtectedRoute({ allowedRoles, children }) {
  const { currentUser, userRole } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(userRole)) {
    return <Navigate to="/" replace />;
  }

  return children;
}