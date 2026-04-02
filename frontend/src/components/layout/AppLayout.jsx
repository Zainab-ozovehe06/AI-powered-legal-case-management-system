import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from '../../context/AuthContext';
import { AIAssistantWidget } from '../ui/AIAssistantWidget';

export const AppLayout = () => {
    const [collapsed, setCollapsed] = useState(false);
    const { currentUser } = useAuth();

    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    return (
        <div className="app-container">
            <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
            <div className="main-content">
                <Topbar />
                <main className="page-content bg-slate-50/50">
                    <Outlet />
                </main>
            </div>
            <AIAssistantWidget />
        </div>
    );
};
