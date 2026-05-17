import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  FolderOpen,
  Loader2,
} from 'lucide-react';
import { api } from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import UpcomingEvents from '../components/calendar/UpcomingEvents';
import { getTodayDateString } from '../components/calendar/eventUtils';
import { getCaseStatusMeta, normalizeCaseStatus } from '../utils/caseStatus';

const formatLabel = (value, fallback) => {
  const safeValue = (value || fallback || '').toString().trim();

  if (!safeValue) {
    return fallback;
  }

  return safeValue
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export default function StudentDashboard() {
  const { currentUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [stats, setStats] = useState({
    activeCases: 0,
    upcomingHearings: 0,
    pendingActions: 0,
    inCourt: 0,
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);

        const [visibleCases, visibleEvents] = await Promise.all([
          api.getVisibleCases(),
          api.getEvents({ status: 'upcoming', date_from: getTodayDateString() }),
        ]);

        const sortedCases = [...visibleCases].sort((a, b) => {
          const dateA = a.date_opened?.seconds || 0;
          const dateB = b.date_opened?.seconds || 0;
          return dateB - dateA;
        });

        const activeCases = visibleCases.filter(
          (c) => normalizeCaseStatus(c.status) !== 'closed'
        ).length;

        const pendingCases = visibleCases.filter(
          (c) => normalizeCaseStatus(c.status) === 'pending'
        ).length;

        const inCourtCases = visibleCases.filter(
          (c) => normalizeCaseStatus(c.status) === 'incourt'
        ).length;

        const upcomingHearings = visibleEvents.filter(
          (event) => event.event_type === 'court_date'
        ).length;

        setCases(sortedCases);
        setUpcomingEvents(visibleEvents);
        setStats({
          activeCases,
          upcomingHearings,
          pendingActions: pendingCases,
          inCourt: inCourtCases,
        });
      } catch (error) {
        console.error('Error loading student dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const dashboardStats = [
    {
      label: 'Active Cases',
      value: stats.activeCases,
      icon: FolderOpen,
      iconClassName: 'student-stat-icon-primary',
    },
    {
      label: 'Upcoming Hearings',
      value: stats.upcomingHearings,
      icon: CalendarDays,
      iconClassName: 'student-stat-icon-warning',
    },
    {
      label: 'Pending Actions',
      value: stats.pendingActions,
      icon: Clock3,
      iconClassName: 'student-stat-icon-muted',
    },
    {
      label: 'In Court',
      value: stats.inCourt,
      icon: AlertTriangle,
      iconClassName: 'student-stat-icon-alert',
    },
  ];

  const recentCases = cases.slice(0, 4);

  const getCaseBadge = (status) => {
    const statusMeta = getCaseStatusMeta(status);

    return {
      className: `student-status-${statusMeta.value}`,
      label: statusMeta.label,
    };
  };

  const firstName =
    currentUser?.displayName?.split(' ')[0] ||
    currentUser?.name?.split(' ')[0] ||
    currentUser?.email?.split('@')[0] ||
    'Student';

  return (
    <div className="student-dashboard-page animate-fade-in">
      <div className="student-dashboard-hero">
        <h1 className="student-dashboard-title">Welcome back, {firstName}</h1>
        <p className="student-dashboard-subtitle">
          Here&apos;s your case overview for today.
        </p>
      </div>

      {loading ? (
        <div className="student-dashboard-panel student-dashboard-loading">
          <div className="student-dashboard-loading-copy">
            <Loader2 className="student-loader-icon" size={20} />
            <span>Loading your dashboard...</span>
          </div>
        </div>
      ) : (
        <>
          <div className="student-stat-grid">
            {dashboardStats.map((stat) => (
              <div key={stat.label} className="student-stat-card">
                <div className={`student-stat-icon ${stat.iconClassName}`}>
                  <stat.icon size={26} />
                </div>

                <div className="student-stat-copy">
                  <p className="student-stat-value">{stat.value}</p>
                  <p className="student-stat-label">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="student-dashboard-columns">
            <section className="student-dashboard-panel">
              <div className="student-panel-header">
                <h2 className="student-panel-title">My Cases</h2>
                <Link to="/cases" className="student-panel-link">
                  View all
                </Link>
              </div>

              <div className="student-case-list">
                {recentCases.length === 0 ? (
                  <div className="student-empty-state">
                    <p className="student-empty-title">No cases yet</p>
                    <p className="student-empty-copy">
                      Create or get assigned to a case to see it here.
                    </p>
                  </div>
                ) : (
                  recentCases.map((caseItem) => {
                    const badge = getCaseBadge(caseItem.status);
                    const displayCaseId = caseItem.caseDisplayId || '---';
                    const routeCaseId = caseItem.caseDisplayId || caseItem.id;

                    return (
                      <Link
                        key={caseItem.id}
                        to={`/cases/${routeCaseId}`}
                        className="student-case-card"
                      >
                        <div className="student-case-copy">
                          <p className="student-case-name">
                            {caseItem.client_name || 'Untitled Client'}
                          </p>
                          <p className="student-case-meta">
                            Case {displayCaseId} {'\u00B7'}{' '}
                            {formatLabel(caseItem.case_type, 'Case')}
                          </p>
                        </div>

                        <span className={`student-status-pill ${badge.className}`}>
                          {badge.label}
                        </span>
                      </Link>
                    );
                  })
                )}
              </div>
            </section>

            <UpcomingEvents
              events={upcomingEvents}
              loading={loading}
              dueSoonOnly
              title="Due Soon"
              subtitle="Upcoming case events within the next 7 days."
              emptyTitle="No events due soon"
              emptyCopy="Events scheduled for the next week will appear here."
            />
          </div>
        </>
      )}
    </div>
  );
}
