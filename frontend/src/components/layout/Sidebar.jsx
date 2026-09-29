import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderOpen,
  CalendarDays,
  FileText,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Users,
  UserCheck,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const Sidebar = ({ collapsed, setCollapsed }) => {
  const { currentUser, userRole, logout } = useAuth();

  const studentNavItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'New Case', path: '/cases/new', icon: <FileText size={20} /> },
    { name: 'Case Management', path: '/cases', icon: <FolderOpen size={20} /> },
    { name: 'Calendar', path: '/calendar', icon: <CalendarDays size={20} /> },
    { name: 'Clinic AI', path: '/assistant', icon: <MessageSquare size={20} /> },
  ];

  const adminNavItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'Manage Users', path: '/admin/users', icon: <Users size={20} /> },
    { name: 'Student Groups', path: '/admin/groups', icon: <Users size={20} /> },
    { name: 'Lawyer Assignment', path: '/admin/lawyer-assignment', icon: <UserCheck size={20} /> },
    { name: 'All Cases', path: '/admin/cases', icon: <FolderOpen size={20} /> },
    { name: 'Calendar', path: '/calendar', icon: <CalendarDays size={20} /> },
    { name: 'Clinic AI', path: '/assistant', icon: <MessageSquare size={20} /> },
    { name: 'Settings', path: '/admin/settings', icon: <Settings size={20} /> },
  ];

  const lawyerNavItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'Case Management', path: '/cases', icon: <FolderOpen size={20} /> },
    { name: 'Clinic AI', path: '/assistant', icon: <MessageSquare size={20} /> },
  ];

  const navItems =
    userRole === 'admin'
      ? adminNavItems
      : userRole === 'lawyer'
        ? lawyerNavItems
        : studentNavItems;
  const sidebarClassName = [
    'sidebar',
    userRole === 'admin' ? 'admin-sidebar' : '',
    userRole === 'law_student' ? 'student-initial-sidebar' : '',
    collapsed ? 'collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside className={sidebarClassName}>
      <div className="logo-area">
        <div
          className="flex items-center justify-center w-8 h-8 rounded-md bg-blue-600 text-white font-bold flex-shrink-0"
          style={{ fontSize: '0.8rem' }}
        >
        
        </div>
        <span className="sidebar-text">Law Clinic</span>
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
          onClick={() => setCollapsed(!collapsed)}
          className="btn btn-ghost sidebar-collapse-button"
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>

        <div className="user-widget">
          <div className="avatar">
            {currentUser?.displayName?.charAt(0) || 'U'}
          </div>
          <div className="sidebar-text sidebar-user-copy">
            <span className="sidebar-user-name">
              {currentUser?.displayName || 'User'}
            </span>
            <span className="badge badge-primary sidebar-user-role">
              {userRole || 'Student'}
            </span>
          </div>
        </div>

        <div className="sidebar-footer-actions sidebar-text">
          <button onClick={logout} className="sidebar-logout-button">
            <LogOut size={14} />
            <span>Log out</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
