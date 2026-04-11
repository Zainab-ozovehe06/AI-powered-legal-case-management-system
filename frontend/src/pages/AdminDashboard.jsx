import { useEffect, useState } from 'react';
import { Users, FolderOpen, Clock3, CheckCircle2, Loader2 } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { api } from '../api/apiClient';

export default function AdminDashboard() {
  const [summary, setSummary] = useState({
    totalCases: 0,
    openCases: 0,
    closedCases: 0,
    activeUsers: 0,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardSummary = async () => {
      try {
        setLoading(true);

        const [cases, activeUsersSnap] = await Promise.all([
          api.getVisibleCases(),
          getDocs(query(collection(db, 'users'), where('status', '==', 'active'))),
        ]);

        const totalCases = cases.length;
        const openCases = cases.filter(
          (c) => (c.status || 'open').toLowerCase() !== 'closed'
        ).length;
        const closedCases = cases.filter(
          (c) => (c.status || '').toLowerCase() === 'closed'
        ).length;
        const activeUsers = activeUsersSnap.size;

        setSummary({
          totalCases,
          openCases,
          closedCases,
          activeUsers,
        });
      } catch (error) {
        console.error('Error loading admin dashboard summary:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardSummary();
  }, []);

  const cards = [
    {
      title: 'Total Cases',
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
    {
      title: 'Active Users',
      value: summary.activeUsers,
      icon: <Users size={20} />,
      color: 'text-indigo-600',
      bg: 'bg-indigo-100',
    },
  ];

  return (
    <div className="w-full min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-slate-500">Admin workspace</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Clinic Overview
            </h1>
            <p className="text-slate-500 text-sm sm:text-base">
              Summary of users and cases across the system
            </p>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-10 flex items-center justify-center">
            <div className="flex items-center gap-3 text-slate-500">
              <Loader2 size={20} className="animate-spin" />
              <span>Loading dashboard summary...</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
      </div>
    </div>
  );
}