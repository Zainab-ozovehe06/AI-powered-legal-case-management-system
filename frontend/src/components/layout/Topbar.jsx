import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const roleLabelMap = {
  admin: 'Admin',
  law_student: 'Student',
};

const getInitials = (value) => {
  const safeValue = (value || '').trim();

  if (!safeValue) {
    return 'US';
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
  else if (pathName.includes('groups')) breadcrumb = 'Home > Student Groups';
  else if (pathName.includes('calendar')) breadcrumb = 'Home > Calendar';
  else if (pathName.includes('ai')) breadcrumb = 'Home > AI Assistant';

  const displayName =
    currentUser?.name ||
    currentUser?.displayName ||
    currentUser?.email ||
    (isStudentPortalView ? 'Student' : 'User');
  const roleLabel = roleLabelMap[userRole] || 'User';

  const userSummary = (
    <div className="topbar-user">
      <div className="student-topbar-avatar">{getInitials(displayName)}</div>
      <div className="topbar-user-copy">
        <span className="topbar-user-name">{displayName}</span>
        <span className="topbar-user-role">{roleLabel}</span>
      </div>
    </div>
  );

  if (isStudentPortalView) {
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
        </div>

        <div className="student-topbar-right">{userSummary}</div>
      </header>
    );
  }

  return (
    <header className="topbar">
      <div className="topbar-breadcrumb">
        <span>{breadcrumb}</span>
      </div>

      {userSummary}
    </header>
  );
};
