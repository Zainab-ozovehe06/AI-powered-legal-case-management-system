import { useEffect, useState } from 'react';
import { Users, FolderOpen, Clock3, CheckCircle2, Loader2 } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { api } from '../api/apiClient';
import UpcomingEvents from '../components/calendar/UpcomingEvents';
import { getTodayDateString } from '../components/calendar/eventUtils';
import { normalizeCaseStatus } from '../utils/caseStatus';

export default function AdminDashboard() {
  const [summary, setSummary] = useState({
    totalCases: 0,
    openCases: 0,
    closedCases: 0,
    activeUsers: 0,
  });
  const [upcomingEvents, setUpcomingEvents] = useState([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardSummary = async () => {
      try {
        setLoading(true);

        const [cases, activeUsersSnap, events] = await Promise.all([
          api.getVisibleCases(),
          getDocs(query(collection(db, 'users'), where('status', '==', 'active'))),
          api.getEvents({ status: 'upcoming', date_from: getTodayDateString() }),
        ]);

        const totalCases = cases.length;
        const openCases = cases.filter(
          (c) => normalizeCaseStatus(c.status) !== 'closed'
        ).length;
        const closedCases = cases.filter(
          (c) => normalizeCaseStatus(c.status) === 'closed'
        ).length;
        const activeUsers = activeUsersSnap.size;

        setUpcomingEvents(events);
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
      icon: <FolderOpen size={26} />,
      iconClassName: 'admin-stat-icon-primary',
    },
    {
      title: 'Open Cases',
      value: summary.openCases,
      icon: <Clock3 size={26} />,
      iconClassName: 'admin-stat-icon-warning',
    },
    {
      title: 'Closed Cases',
      value: summary.closedCases,
      icon: <CheckCircle2 size={26} />,
      iconClassName: 'admin-stat-icon-success',
    },
    {
      title: 'Active Users',
      value: summary.activeUsers,
      icon: <Users size={26} />,
      iconClassName: 'admin-stat-icon-muted',
    },
  ];

  return (
    <div className="admin-dashboard-page animate-fade-in">
      <div className="admin-dashboard-hero">
        <p className="admin-dashboard-eyebrow">Admin workspace</p>
        <h1 className="admin-dashboard-title">Clinic Overview</h1>
        <p className="admin-dashboard-subtitle">
          Summary of users and cases across the system
        </p>
      </div>

      {loading ? (
        <div className="admin-dashboard-panel ">
          <div className="admin-dashboard-loading-copy">
            <Loader2 size={20} className="admin-loader-icon" />
            <span>Loading dashboard summary...</span>
          </div>
        </div>
      ) : (
        <div className="admin-stat-grid">
          {cards.map((card) => (
            <div key={card.title} className="admin-stat-card">
              <div className={`admin-stat-icon ${card.iconClassName}`}>
                {card.icon}
              </div>

              <div className="admin-stat-copy">
                <p className="admin-stat-value">{card.value}</p>
                <p className="admin-stat-label">{card.title}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <UpcomingEvents
        events={upcomingEvents}
        loading={loading}
        dueSoonOnly
        title="Upcoming Alerts"
        subtitle="Case events and reminders scheduled within the next 7 days."
        emptyTitle="No upcoming alerts"
        emptyCopy="Upcoming case events will appear here."
      />
    </div>
  );
}
