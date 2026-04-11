import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search, Activity, Clock3, CheckCircle2 } from 'lucide-react';
import { api } from '../api/apiClient';

const getTimestampMillis = (value) => {
  if (!value) return 0;

  if (typeof value.toMillis === 'function') {
    return value.toMillis();
  }

  if (typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (typeof value._seconds === 'number') {
    return value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1000000);
  }

  if (typeof value.seconds === 'number') {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  }

  return 0;
};

const formatTimestamp = (value) => {
  const millis = getTimestampMillis(value);
  if (!millis) return 'No activity yet';
  return new Date(millis).toLocaleString();
};

export default function AdminCaseProgress() {
  const navigate = useNavigate();

  const [casesWithProgress, setCasesWithProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchProgressData = async () => {
      try {
        setLoading(true);

        const cases = await api.getVisibleCases();

        const progressData = await Promise.all(
          cases.map(async (caseItem) => {
            try {
              const activities = await api.getCaseActivities(caseItem.id);

              const sortedActivities = [...activities].sort((a, b) => {
                const timeA = getTimestampMillis(a.logged_at || a.date);
                const timeB = getTimestampMillis(b.logged_at || b.date);
                return timeB - timeA;
              });

              const latestActivity = sortedActivities[0] || null;
              const latestActivityValue = latestActivity?.logged_at || latestActivity?.date || null;

              return {
                ...caseItem,
                activityCount: activities.length,
                latestActivityAt: latestActivityValue,
                latestActivityMillis: getTimestampMillis(latestActivityValue),
                latestActivityDescription: latestActivity?.description || 'No activity yet',
              };
            } catch (error) {
              console.error(`Failed to fetch activities for case ${caseItem.id}:`, error);

              return {
                ...caseItem,
                activityCount: 0,
                latestActivityAt: null,
                latestActivityMillis: 0,
                latestActivityDescription: 'Could not load activity data',
              };
            }
          })
        );

        progressData.sort((a, b) => {
          const fallbackA = getTimestampMillis(a.date_opened);
          const fallbackB = getTimestampMillis(b.date_opened);
          return (b.latestActivityMillis || fallbackB) - (a.latestActivityMillis || fallbackA);
        });

        setCasesWithProgress(progressData);
      } catch (error) {
        console.error('Error loading case progress:', error);
        alert('Failed to load case progress: ' + error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProgressData();
  }, []);

  const filteredCases = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return casesWithProgress;

    return casesWithProgress.filter((c) => {
      return (
        (c.client_name || '').toLowerCase().includes(term) ||
        (c.case_type || '').toLowerCase().includes(term) ||
        (c.offence || '').toLowerCase().includes(term) ||
        (c.status || '').toLowerCase().includes(term)
      );
    });
  }, [casesWithProgress, searchTerm]);

  const getStatusClass = (status) => {
    const normalized = (status || 'open').toLowerCase();

    if (normalized === 'closed') {
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    }

    return 'bg-amber-50 text-amber-700 border border-amber-200';
  };

  return (
    <div className="w-full min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-slate-500">Admin workspace</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Case Progress
            </h1>
            <p className="text-slate-500 text-sm sm:text-base">
              Track status and recent activity across all cases
            </p>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search by client, case type, offence, or status..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {loading ? (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-8 text-center text-slate-500 flex items-center justify-center gap-2">
              <Loader2 size={18} className="animate-spin" />
              Loading case progress...
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-300 p-8 text-center">
              <p className="text-slate-600 font-medium">No cases found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCases.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(`/cases/${c.id}`)}
                  className="w-full text-left rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all p-4"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900 break-words">
                          {c.client_name || 'Untitled Client'}
                        </h3>
                        <p className="text-sm text-slate-600 capitalize break-words">
                          {c.case_type || 'Case'}
                        </p>
                      </div>

                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${getStatusClass(
                          c.status
                        )}`}
                      >
                        {c.status || 'open'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
                        <p className="text-slate-500 mb-1 flex items-center gap-2">
                          <Activity size={14} />
                          Activity Count
                        </p>
                        <p className="font-semibold text-slate-900">
                          {c.activityCount}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
                        <p className="text-slate-500 mb-1 flex items-center gap-2">
                          <Clock3 size={14} />
                          Last Activity
                        </p>
                        <p className="font-semibold text-slate-900">
                          {formatTimestamp(c.latestActivityAt)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
                        <p className="text-slate-500 mb-1 flex items-center gap-2">
                          <CheckCircle2 size={14} />
                          Current Status
                        </p>
                        <p className="font-semibold text-slate-900 capitalize">
                          {c.status || 'open'}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
                      <p className="text-slate-500 text-sm mb-1">Latest Update</p>
                      <p className="text-sm text-slate-700 break-words">
                        {c.latestActivityDescription}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}