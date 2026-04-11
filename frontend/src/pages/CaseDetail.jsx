import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ChevronLeft,
  User,
  FileText,
  Clock,
  UploadCloud,
  Loader2,
  Plus,
} from 'lucide-react';
import { ProgressBar } from '../components/ui/ProgressBar';
import { db } from '../services/firebase';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { api } from '../api/apiClient';

export default function CaseDetail() {
  const { caseId } = useParams();

  const [activeTab, setActiveTab] = useState('overview');
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [activities, setActivities] = useState([]);
  const [documents, setDocuments] = useState([]);

  const [newActivity, setNewActivity] = useState({ description: '' });
  const [isLogging, setIsLogging] = useState(false);

  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!caseId) return;

    const fetchCaseData = async () => {
      try {
        const docRef = doc(db, 'cases', caseId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setCaseData({ id: docSnap.id, ...docSnap.data() });
        } else {
          setCaseData(null);
        }
      } catch (err) {
        console.error('Error fetching case details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCaseData();
  }, [caseId]);

  useEffect(() => {
    if (!caseId) return;

    const q = query(collection(db, 'activities'), where('case_id', '==', caseId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const acts = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      acts.sort((a, b) => (b.date?.toMillis?.() || 0) - (a.date?.toMillis?.() || 0));
      setActivities(acts);
    });

    return () => unsubscribe();
  }, [caseId]);

  useEffect(() => {
    if (!caseId) return;

    const q = query(collection(db, 'documents'), where('case_id', '==', caseId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      docs.sort(
        (a, b) => (b.upload_date?.toMillis?.() || 0) - (a.upload_date?.toMillis?.() || 0)
      );
      setDocuments(docs);
    });

    return () => unsubscribe();
  }, [caseId]);

  const handleAddActivity = async (e) => {
    e.preventDefault();

    if (!newActivity.description.trim()) return;

    setIsLogging(true);
    try {
      await api.logActivity(caseId, {
        description: newActivity.description,
      });
      setNewActivity({ description: '' });
    } catch (err) {
      console.error('Failed to log activity', err);
      alert('Failed to log activity: ' + err.message);
    } finally {
      setIsLogging(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await api.uploadDocument(caseId, file);
    } catch (err) {
      console.error('Upload failed', err);
      alert('Failed to upload document: ' + err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const getStatusText = (status) => status || 'open';

  const getStatusBadgeClass = (status) => {
    const normalized = (status || 'open').toLowerCase();

    if (normalized === 'closed') {
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    }

    return 'bg-amber-50 text-amber-700 border border-amber-200';
  };

  if (loading) {
    return (
      <div className="p-10 flex justify-center">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  if (!caseData) {
    return <div className="p-10 text-center text-slate-500">Case not found.</div>;
  }

  return (
    <div className="w-full min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Link
                to="/"
                className="hover:text-blue-600 flex items-center gap-1 transition-colors"
              >
                <ChevronLeft size={16} />
                Dashboard
              </Link>
              <span>/</span>
              <span>Case #{caseId}</span>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 break-words">
                  {caseData.client_name || 'Untitled Client'}
                </h1>
                <p className="text-slate-600 mt-1 capitalize">
                  {caseData.case_type || 'Case'}
                </p>
              </div>

              <div className="flex flex-col gap-3 lg:items-end">
                <span
                  className={`inline-flex w-fit px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeClass(
                    caseData.status
                  )}`}
                >
                  {getStatusText(caseData.status)}
                </span>

                <ProgressBar
                  currentStatus={(caseData.status || 'open').toLowerCase().replace(/\s+/g, '_')}
                  className="min-w-[180px]"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-slate-600">
              <span className="inline-flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                <User size={14} />
                Client: {caseData.client_name || 'N/A'}
              </span>

              <span className="inline-flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                <FileText size={14} />
                Opened:{' '}
                {caseData.date_opened?.toDate?.()?.toLocaleDateString() || 'N/A'}
              </span>

              <span className="inline-flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 capitalize">
                Type: {caseData.case_type || 'N/A'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm px-5 sm:px-6">
          <div className="flex gap-8 border-b border-slate-200 overflow-x-auto">
            {['overview', 'activity log', 'documents'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`pb-4 pt-4 font-semibold text-sm transition-colors border-b-2 capitalize whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="py-6">
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Case Summary</h2>

                  <div className="space-y-4 text-sm text-slate-700">
                    <div>
                      <p className="text-slate-500 mb-1">Offence / Matter</p>
                      <p className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                        {caseData.offence || 'Not specified'}
                      </p>
                    </div>

                    <div>
                      <p className="text-slate-500 mb-1">Description</p>
                      <p className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 whitespace-pre-wrap">
                        {caseData.description || 'No description provided.'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Info</h2>

                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                      <span className="text-slate-500">Case ID</span>
                      <span className="font-medium text-slate-800">{caseId}</span>
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                      <span className="text-slate-500">Status</span>
                      <span className="font-medium text-slate-800 capitalize">
                        {caseData.status || 'open'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                      <span className="text-slate-500">Case Type</span>
                      <span className="font-medium text-slate-800 capitalize">
                        {caseData.case_type || 'N/A'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                      <span className="text-slate-500">Date Opened</span>
                      <span className="font-medium text-slate-800">
                        {caseData.date_opened?.toDate?.()?.toLocaleDateString() || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'activity log' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Log New Activity</h2>

                  <form onSubmit={handleAddActivity} className="space-y-4">
                    <div>
                      <label
                        htmlFor="activityDesc"
                        className="block text-sm font-medium text-slate-700 mb-1"
                      >
                        Description / Notes
                      </label>
                      <textarea
                        id="activityDesc"
                        required
                        rows={4}
                        placeholder="What happened in this case?"
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        value={newActivity.description}
                        onChange={(e) =>
                          setNewActivity({ ...newActivity, description: e.target.value })
                        }
                        disabled={isLogging}
                      />
                    </div>

                    <div className="flex justify-end">
                      <button type="submit" disabled={isLogging} className="btn btn-primary">
                        {isLogging ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Plus size={16} />
                        )}
                        {isLogging ? 'Logging...' : 'Log Activity'}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Activity Timeline</h2>

                  {activities.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 border border-dashed border-slate-300 p-6 text-center text-slate-500">
                      No activities logged yet.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {activities.map((activity) => (
                        <div
                          key={activity.id}
                          className="flex gap-4 rounded-2xl border border-slate-200 p-4 bg-white"
                        >
                          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                            <Clock size={16} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
                              <span className="text-sm font-semibold text-slate-800">
                                Activity Log
                              </span>

                              <span className="text-xs text-slate-500 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">
                                {activity.date?.toDate?.()?.toLocaleString() || 'Just now'}
                              </span>
                            </div>

                            <p className="text-sm text-slate-700 whitespace-pre-wrap">
                              {activity.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'documents' && (
              <div className="space-y-6">
                <div
                  className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-blue-50/40 hover:border-blue-300 transition-colors p-8 text-center cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />

                  {isUploading ? (
                    <div className="flex flex-col items-center">
                      <Loader2 size={28} className="animate-spin text-blue-600 mb-3" />
                      <h3 className="font-semibold text-slate-800">Uploading document...</h3>
                    </div>
                  ) : (
                    <>
                      <div className="w-14 h-14 mx-auto rounded-full bg-white border border-slate-200 flex items-center justify-center text-blue-600 mb-4">
                        <UploadCloud size={24} />
                      </div>

                      <h3 className="font-semibold text-slate-800">Upload New Document</h3>
                      <p className="text-sm text-slate-500 mt-1 mb-4">
                        Click here to choose a file
                      </p>

                      <button type="button" className="btn btn-primary">
                        <Plus size={16} />
                        Select File
                      </button>
                    </>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Case Documents</h2>

                  {documents.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 border border-dashed border-slate-300 p-6 text-center text-slate-500">
                      No documents uploaded yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {documents.map((docItem) => (
                        <a
                          key={docItem.id}
                          href={docItem.file_path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                              <FileText size={18} />
                            </div>

                            <div className="min-w-0">
                              <p className="font-medium text-slate-800 break-words">
                                {docItem.name || 'Unnamed document'}
                              </p>
                              <p className="text-xs text-slate-500 mt-1 break-words">
                                {Math.round((docItem.size || 0) / 1024)} KB
                                {' • '}
                                Uploaded:{' '}
                                {docItem.upload_date?.toDate?.()?.toLocaleString() || 'Just now'}
                              </p>
                            </div>
                          </div>

                          <span className="text-sm text-blue-600 font-medium shrink-0">
                            Open
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}