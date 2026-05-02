import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from '../../context/AuthContext';

export const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { currentUser, userRole } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  const isStudentPortalView = userRole === 'law_student';

  return (
    <div className={`app-container${isStudentPortalView ? ' student-dashboard-layout' : ''}`}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="main-content">
        <Topbar collapsed={collapsed} setCollapsed={setCollapsed} />
        <main className={`page-content${isStudentPortalView ? ' student-dashboard-page-content' : ''}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
