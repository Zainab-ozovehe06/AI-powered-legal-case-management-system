import { Bell, Search } from 'lucide-react';
import { useLocation } from 'react-router-dom';

export const Topbar = () => {
    const location = useLocation();
    const pathName = location.pathname;

    let breadcrumb = 'Home';
    if (pathName.includes('cases')) breadcrumb = 'Home > Cases';
    else if (pathName.includes('calendar')) breadcrumb = 'Home > Calendar';
    else if (pathName.includes('documents')) breadcrumb = 'Home > Documents';
    else if (pathName.includes('ai')) breadcrumb = 'Home > AI Assistant';

    return (
        <header className="topbar">
            <div className="flex items-center gap-2 text-muted text-sm font-medium">
                <span>{breadcrumb}</span>
            </div>

            <div className="flex items-center gap-4">
                <div className="relative hidden md:block">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                    <input
                        type="text"
                        placeholder="Search users, cases, docs..."
                        className="input-field py-1.5 pl-9 rounded-full w-64 border-slate-200"
                    />
                </div>

                <button className="btn-icon relative text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors">
                    <Bell size={20} />
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 border border-white"></span>
                </button>
            </div>
        </header>
    );
};
