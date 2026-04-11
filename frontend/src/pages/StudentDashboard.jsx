import { useEffect, useState } from 'react';
import { FolderOpen, Clock3, CheckCircle2, PlusCircle, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/apiClient';

export default function StudentDashboard() {
  const [summary, setSummary] = useState({
    totalCases: 0,
    openCases: 0,
    closedCases: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setLoading(true);
        const cases = await api.getVisibleCases();

        const totalCases = cases.length;
        const openCases = cases.filter(
          (c) => (c.status || 'open').toLowerCase() !== 'closed'
        ).length;
        const closedCases = cases.filter(
          (c) => (c.status || '').toLowerCase() === 'closed'
        ).length;

        setSummary({
          totalCases,
          openCases,
          closedCases,
        });
      } catch (error) {
        console.error('Error loading student dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, []);

  const cards = [
    {
      title: 'My Cases',
      value: summary.totalCases,
      icon: <FolderOpen size={20} />,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
    },
    {
      title: 'Open Cases',
      value: summary.openCases,
      icon: <Clock3 size={20} />,
      color: 'text-amber-600',
      bg: 'bg-amber-100',
    },
    {
      title: 'Closed Cases',
      value: summary.closedCases,
      icon: <CheckCircle2 size={20} />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-100',
    },
  ];

  return (
    <div className="w-full min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-500">Student workspace</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                Dashboard
              </h1>
              <p className="text-slate-500 mt-1 text-sm sm:text-base">
                Overview of your assigned cases and activity
              </p>
            </div>

            <Link
              to="/cases/new"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-white font-medium hover:bg-blue-700 transition-colors shadow-sm"
            >
              <PlusCircle size={18} />
              New Case
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-10 flex items-center justify-center">
            <div className="flex items-center gap-3 text-slate-500">
              <Loader2 size={20} className="animate-spin" />
              <span>Loading dashboard...</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {cards.map((card) => (
              <div
                key={card.title}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">
                    {card.title}
                  </p>
                  <h3 className="text-3xl font-bold text-slate-900">
                    {card.value}
                  </h3>
                </div>

                <div
                  className={`w-12 h-12 rounded-full ${card.bg} ${card.color} flex items-center justify-center`}
                >
                  {card.icon}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/cases/new"
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <PlusCircle size={16} />
              Create New Case
            </Link>

            <Link
              to="/cases"
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-slate-800 text-sm font-medium hover:bg-slate-200 transition-colors"
            >
              <FolderOpen size={16} />
              View My Cases
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}