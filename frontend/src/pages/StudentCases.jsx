import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Loader2, Search } from 'lucide-react';
import { api } from '../api/apiClient';

export default function StudentCases() {
  const navigate = useNavigate();

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchCases = async () => {
      try {
        setLoading(true);
        const data = await api.getVisibleCases();

        const sorted = [...data].sort((a, b) => {
          const dateA = a.date_opened?.seconds || 0;
          const dateB = b.date_opened?.seconds || 0;
          return dateB - dateA;
        });

        setCases(sorted);
      } catch (error) {
        console.error('Error fetching cases:', error);
        alert('Failed to fetch cases: ' + error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCases();
  }, []);

  const filteredCases = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return cases;

    return cases.filter((c) => {
      return (
        (c.client_name || '').toLowerCase().includes(term) ||
        (c.case_type || '').toLowerCase().includes(term) ||
        (c.offence || '').toLowerCase().includes(term) ||
        (c.status || '').toLowerCase().includes(term)
      );
    });
  }, [cases, searchTerm]);

  const getStatusClass = (status) => {
    const normalized = (status || 'open').toLowerCase();

    if (normalized === 'closed') {
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    }

    return 'bg-amber-50 text-amber-700 border border-amber-200';
  };

  return (
    <div className="w-full min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-slate-500">Student workspace</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Cases
            </h1>
            <p className="text-slate-500 text-sm sm:text-base">
              View and open your assigned cases
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
              Loading cases...
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-300 p-8 text-center">
              <p className="text-slate-600 font-medium">No cases yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Create or get assigned to a case to see it here.
              </p>
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
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                          <FolderOpen size={16} />
                        </div>

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

                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-slate-600">
                        <p>
                          <span className="text-slate-500">Offence:</span>{' '}
                          {c.offence || 'General matter'}
                        </p>
                        <p>
                          <span className="text-slate-500">Opened:</span>{' '}
                          {c.date_opened?.toDate?.()?.toLocaleDateString?.() || 'N/A'}
                        </p>
                        <p>
                          <span className="text-slate-500">Case ID:</span> {c.id}
                        </p>
                      </div>
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