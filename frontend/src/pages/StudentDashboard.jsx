import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, FolderOpen, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { api } from '../api/apiClient';
import { CreateCaseModal } from '../components/cases/CreateCaseModal';

export default function StudentDashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeCases, setActiveCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'cases'),
      where('created_by_student_id', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const casesData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        casesData.sort((a, b) => {
          const dateA = a.date_opened?.toMillis?.() || 0;
          const dateB = b.date_opened?.toMillis?.() || 0;
          return dateB - dateA;
        });

        setActiveCases(casesData);
        setLoadingCases(false);
      },
      (err) => {
        console.error('Error fetching cases:', err);
        setLoadingCases(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const handleCreateCase = async (newCaseData) => {
    setIsCreating(true);
    try {
      const result = await api.createCase(newCaseData);
      alert(result.message || 'Case created successfully');
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error creating case:', error);
      alert('Failed to create case: ' + error.message);
    } finally {
      setIsCreating(false);
    }
  };

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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-slate-500">Student workspace</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 break-words">
                Welcome back, {currentUser?.displayName?.split(' ')[0] || 'Student'} 👋
              </h1>
              <p className="text-slate-500 mt-1 text-sm sm:text-base">
                {activeCases.length} active case{activeCases.length !== 1 ? 's' : ''} in your workspace
              </p>
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-white font-medium hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={18} />
              Create Case
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen size={18} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900">My Cases</h2>
          </div>

          {loadingCases ? (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-6 text-center text-slate-500">
              Loading cases...
            </div>
          ) : activeCases.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-300 p-8 text-center">
              <p className="text-slate-600 font-medium">No cases yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Start by creating your first case.
              </p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus size={16} />
                Create Case
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {activeCases.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(`/cases/${c.id}`)}
                  className="w-full text-left rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900 break-words">
                          {c.client_name || 'Untitled Client'}
                        </h3>
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-medium ${getStatusClass(
                            c.status
                          )}`}
                        >
                          {c.status || 'open'}
                        </span>
                      </div>

                      <p className="text-sm text-slate-600 mt-1 capitalize break-words">
                        {c.case_type || 'Case'}
                      </p>

                      <p className="text-xs text-slate-500 mt-2 break-words">
                        {c.offence || 'General matter'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="fab" title="Ask AI Assistant">
          <Sparkles size={10} />
        </button>

        <CreateCaseModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onCreate={handleCreateCase}
          isCreating={isCreating}
        />
      </div>
    </div>
  );
}