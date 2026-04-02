import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FolderOpen, CalendarDays, FileText, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const navItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'Cases', path: '/cases', icon: <FolderOpen size={20} /> },
    { name: 'Calendar', path: '/calendar', icon: <CalendarDays size={20} /> },
    { name: 'Documents', path: '/documents', icon: <FileText size={20} /> },
    { name: 'AI Assistant', path: '/ai', icon: <MessageSquare size={20} /> },
];

export const Sidebar = ({ collapsed, setCollapsed }) => {
    const { currentUser, userRole, logout } = useAuth();

    return (
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
            <div className="logo-area">
                <div className="flex items-center justify-center w-8 h-8 rounded-md bg-blue-600 text-white font-bold flex-shrink-0" style={{ fontSize: '0.8rem' }}>
                    LC
                </div>
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

            <div className="mt-auto">
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="btn btn-ghost w-full flex justify-center py-3 mb-2"
                    title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                    {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                </button>

                <div className="user-widget">
                    <div className="avatar">
                        {currentUser?.displayName?.charAt(0) || 'U'}
                    </div>
                    <div className="sidebar-text flex-col flex gap-1 overflow-hidden">
                        <span className="font-semibold text-sm truncate">{currentUser?.displayName || 'User'}</span>
                        <span className="badge badge-primary truncate w-max" style={{ fontSize: '0.65rem' }}>{userRole || 'Student'}</span>
                    </div>
                </div>

                <div className="px-4 pb-4 sidebar-text">
                    <button onClick={logout} className="text-xs text-slate-500 hover:text-slate-800 transition-colors">Sign Out</button>
                </div>
            </div>
        </aside>
    );
};
