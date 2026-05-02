import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  LayoutDashboard,
  MessageSquare,
  Scale,
  Settings,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const roleLabelMap = {
  admin: 'Admin',
  law_student: 'Student',
};

const isStudentPortalItemActive = (item, pathname) => {
  if (item.path === '/') {
    return pathname === '/' || pathname === '/student';
  }

  if (item.path === '/cases') {
    return pathname === '/cases' || /^\/cases\/[^/]+$/.test(pathname);
  }

  return pathname === item.path;
};

export const Sidebar = ({ collapsed, setCollapsed }) => {
  const { currentUser, userRole, logout } = useAuth();
  const location = useLocation();

  const isStudentPortalView = userRole === 'law_student';

  const studentNavItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'New Case', path: '/cases/new', icon: <FileText size={20} /> },
    { name: 'Cases', path: '/cases', icon: <FolderOpen size={20} /> },
    { name: 'Calendar', path: '/calendar', icon: <CalendarDays size={20} /> },
    { name: 'AI Assistant', path: '/ai', icon: <MessageSquare size={20} /> },
  ];

  const adminNavItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'Manage Users', path: '/admin/users', icon: <Users size={20} /> },
    { name: 'All Cases', path: '/admin/cases', icon: <FolderOpen size={20} /> },
    { name: 'Settings', path: '/admin/settings', icon: <Settings size={20} /> },
  ];

  const navItems = userRole === 'admin' ? adminNavItems : studentNavItems;
  const displayName =
    currentUser?.displayName ||
    currentUser?.name ||
    currentUser?.email ||
    'User';

  if (isStudentPortalView) {
    return (
      <aside className={`sidebar student-dashboard-sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="student-sidebar-brand">
          <div className="student-sidebar-brand-mark">
            <Scale size={24} />
          </div>

          <div className="student-sidebar-brand-copy">
            <span className="student-sidebar-brand-title">Nile Law Clinic</span>
            <span className="student-sidebar-brand-subtitle">ILCMS</span>
          </div>
        </div>

        <div className="student-sidebar-section">
          <span className="student-sidebar-label">STUDENT PORTAL</span>
        </div>

        <nav className="student-sidebar-nav">
          {studentNavItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              className={() =>
                `student-sidebar-item${
                  isStudentPortalItemActive(item, location.pathname) ? ' active' : ''
                }`
              }
              title={collapsed ? item.name : ''}
            >
              <span className="student-sidebar-item-icon">{item.icon}</span>
              <span className="student-sidebar-item-text">{item.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="student-sidebar-footer">
          <div className="student-sidebar-user">
            <span className="student-sidebar-user-name">{displayName}</span>
            <span className="student-sidebar-user-role">
              {roleLabelMap[userRole] || 'Student'}
            </span>
          </div>

          <button
            type="button"
            onClick={logout}
            className="student-sidebar-signout"
          >
            Sign Out
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className={`sidebar admin-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="logo-area">
        <div className="sidebar-brand-mark">LC</div>
        <span className="sidebar-text">Law Clinic AI</span>
      </div>

      <nav className="nav-menu">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title={collapsed ? item.name : ''}
          >
            {item.icon}
            <span className="sidebar-text">{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="sidebar-collapse-button"
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>

        <div className="user-widget">
          <div className="avatar">
            {displayName.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="sidebar-user-copy sidebar-text">
            <span className="sidebar-user-name">{displayName}</span>
            <span className="badge badge-primary sidebar-user-role">
              {roleLabelMap[userRole] || 'Student'}
            </span>
          </div>
        </div>

        <div className="sidebar-footer-actions sidebar-text">
          <button
            type="button"
            onClick={logout}
            className="sidebar-logout-button"
          >
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
};
