import { useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from '../../context/AuthContext';
import { UnitsProvider } from '../../context/UnitsContext';

export const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 720px)').matches);
  const { currentUser, userRole } = useAuth();
  const { pathname } = useLocation();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  const isStudentPortalView = userRole === 'law_student';

  return (
    <UnitsProvider key={currentUser.uid}>
      <div className={`app-container${isStudentPortalView ? ' student-dashboard-layout' : ''}${pathname.startsWith('/units') || userRole === 'supervisor' ? ' workspace-app' : ''}`}>
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
        <div className="main-content">
          <Topbar collapsed={collapsed} setCollapsed={setCollapsed} />
          <main className={`page-content${isStudentPortalView ? ' student-dashboard-page-content' : ''}`}>
            <Outlet />
          </main>
        </div>
      </div>
    </UnitsProvider>
  );
};
