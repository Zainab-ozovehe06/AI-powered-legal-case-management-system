import { Bell, ChevronDown, Search } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const roleLabelMap = {
  admin: 'Admin',
  law_student: 'Student',
};

const getInitials = (value) => {
  const safeValue = (value || '').trim();

  if (!safeValue) {
    return 'ST';
  }

  const parts = safeValue.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return safeValue.slice(0, 2).toUpperCase();
};

export const Topbar = ({ collapsed, setCollapsed }) => {
  const { currentUser, userRole } = useAuth();
  const location = useLocation();
  const pathName = location.pathname;

  const isStudentPortalView = userRole === 'law_student';

  let breadcrumb = 'Home';
  if (pathName.includes('cases')) breadcrumb = 'Home > Cases';
  else if (pathName.includes('calendar')) breadcrumb = 'Home > Calendar';
  else if (pathName.includes('documents')) breadcrumb = 'Home > Documents';
  else if (pathName.includes('ai')) breadcrumb = 'Home > AI Assistant';

  if (isStudentPortalView) {
    const displayName =
      currentUser?.displayName ||
      currentUser?.name ||
      currentUser?.email ||
      'Student';

    return (
      <header className="topbar student-dashboard-topbar">
        <div className="student-topbar-left">
          <button
            type="button"
            className="student-sidebar-toggle"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="student-sidebar-toggle-glyph" aria-hidden="true">
              <span />
              <span />
            </span>
          </button>

          <label className="student-topbar-search" aria-label="Search">
            <Search size={20} className="student-topbar-search-icon" />
            <input
              type="text"
              placeholder="Search cases, clients..."
              className="student-topbar-search-input"
            />
          </label>
        </div>

        <div className="student-topbar-right">
          <button type="button" className="student-role-button">
            <span>{roleLabelMap[userRole] || 'Student'}</span>
            <ChevronDown size={18} />
          </button>

          <div className="student-topbar-avatar">
            {getInitials(displayName)}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="topbar">
      <div className="topbar-breadcrumb">
        <span>{breadcrumb}</span>
      </div>

      <div className="topbar-actions">
        <label className="topbar-search">
          <Search className="topbar-search-icon" size={16} />
          <input
            type="text"
            placeholder="Search users, cases, docs..."
            className="input-field topbar-search-input-generic"
          />
        </label>

      </div>
    </header>
  );
};
