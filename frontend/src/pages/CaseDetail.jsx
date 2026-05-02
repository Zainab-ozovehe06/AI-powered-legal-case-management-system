import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  Clock3,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  UploadCloud,
  User,
} from 'lucide-react';
import { db } from '../services/firebase';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { api } from '../api/apiClient';

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

const formatDate = (value) => {
  const date = value?.toDate?.();

  if (!date) {
    return 'No date available';
  }

  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

const formatDateTime = (value) => {
  const date = value?.toDate?.();

  if (!date) {
    return 'Just now';
  }

  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const getFileSizeLabel = (size) => {
  if (typeof size !== 'number' || Number.isNaN(size)) {
    return 'Unknown size';
  }

  if (size < 1024) {
    return `${size} B`;
  }

  const kilobytes = size / 1024;

  if (kilobytes < 1024) {
    return `${Math.max(1, Math.round(kilobytes))} KB`;
  }

  return `${(kilobytes / 1024).toFixed(1)} MB`;
};

const getStatusMeta = (status) => {
  const normalized = (status || 'open').toLowerCase();

  if (normalized === 'closed') {
    return {
      className: 'case-detail-status-closed',
      label: formatLabel(status, 'Closed'),
    };
  }

  if (normalized === 'urgent') {
    return {
      className: 'case-detail-status-urgent',
      label: formatLabel(status, 'Urgent'),
    };
  }

  return {
    className: 'case-detail-status-open',
    label: formatLabel(status, 'Open'),
  };
};

const getCaseTypeClass = (caseType) => {
  const normalized = (caseType || '').toLowerCase();

  if (normalized === 'criminal') {
    return 'case-detail-type-criminal';
  }

  if (normalized === 'civil') {
    return 'case-detail-type-civil';
  }

  if (normalized === 'family') {
    return 'case-detail-type-family';
  }

  if (normalized === 'property') {
    return 'case-detail-type-property';
  }

  return 'case-detail-type-default';
};

const tabs = [
  { id: 'overview', label: 'Overview', icon: FolderOpen },
  { id: 'activity log', label: 'Activity Log', icon: Activity },
  { id: 'documents', label: 'Documents', icon: FileText },
];

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
  const [openingDocumentId, setOpeningDocumentId] = useState(null);

  const getActivityTimestamp = (activity) => activity?.logged_at || activity?.date;

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
      const acts = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
      }));

      acts.sort(
        (a, b) =>
          (getActivityTimestamp(b)?.toMillis?.() || 0) -
          (getActivityTimestamp(a)?.toMillis?.() || 0)
      );
      setActivities(acts);
    });

    return () => unsubscribe();
  }, [caseId]);

  useEffect(() => {
    if (!caseId) return;

    const q = query(collection(db, 'documents'), where('case_id', '==', caseId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
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

  const handleOpenDocument = async (docItem) => {
    if (!docItem) return;

    if (docItem.storage_provider !== 'local_server' && docItem.file_path) {
      window.open(docItem.file_path, '_blank', 'noopener,noreferrer');
      return;
    }

    setOpeningDocumentId(docItem.id);
    try {
      await api.openDocument(docItem.id, docItem.name || 'document');
    } catch (err) {
      console.error('Open document failed', err);
      alert('Failed to open document: ' + err.message);
    } finally {
      setOpeningDocumentId(null);
    }
  };

  const triggerFilePicker = () => {
    fileInputRef.current?.click();
  };

  if (loading) {
    return (
      <div className="case-detail-state">
        <div className="case-detail-state-card">
          <Loader2 className="student-loader-icon" size={24} />
          <span>Loading case workspace...</span>
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="case-detail-state">
        <div className="case-detail-state-card case-detail-state-card-muted">
          <span>Case not found.</span>
        </div>
      </div>
    );
  }

  const statusMeta = getStatusMeta(caseData.status);
  const latestActivity = activities[0] || null;
  const latestDocument = documents[0] || null;

  const headerMetrics = [
    {
      label: 'Client',
      value: caseData.client_name || 'Untitled Client',
      icon: User,
    },
    {
      label: 'Case Type',
      value: formatLabel(caseData.case_type, 'Case'),
      icon: FolderOpen,
    },
    {
      label: 'Activity Entries',
      value: activities.length.toString(),
      icon: Activity,
    },
    {
      label: 'Documents',
      value: documents.length.toString(),
      icon: FileText,
    },
  ];

  const overviewHighlights = [
    {
      label: 'Current Status',
      value: statusMeta.label,
      icon: Activity,
    },
    {
      label: 'Date Opened',
      value: formatDate(caseData.date_opened),
      icon: CalendarDays,
    },
    {
      label: 'Latest Update',
      value: latestActivity
        ? formatDateTime(getActivityTimestamp(latestActivity))
        : 'Awaiting first entry',
      icon: Clock3,
    },
    {
      label: 'Files on Record',
      value: documents.length.toString(),
      icon: FileText,
    },
  ];

  return (
    <div className="case-detail-page animate-fade-in">
      <section className="case-detail-hero">
        <div className="case-detail-breadcrumbs">
          <Link to="/" className="case-detail-back-link">
            <ChevronLeft size={16} />
            Dashboard
          </Link>
          <span className="case-detail-breadcrumb-separator">/</span>
          <span className="case-detail-breadcrumb-current">Case {caseId}</span>
        </div>

        <div className="case-detail-hero-top">
          <div className="case-detail-hero-copy">
            <div className="case-detail-pill-row">
              <span className={`case-detail-status-pill ${statusMeta.className}`}>
                {statusMeta.label}
              </span>
              <span
                className={`case-detail-type-pill ${getCaseTypeClass(caseData.case_type)}`}
              >
                {formatLabel(caseData.case_type, 'Case')}
              </span>
            </div>

            <h1 className="case-detail-title">
              {caseData.client_name || 'Untitled Client'}
            </h1>
            <p className="case-detail-subtitle">
              {caseData.offence || 'General matter'}
            </p>
          </div>

          <div className="case-detail-id-card">
            <span className="case-detail-id-label">Case ID</span>
            <span className="case-detail-id-value">{caseId}</span>
            <span className="case-detail-id-meta">
              Opened {formatDate(caseData.date_opened)}
            </span>
          </div>
        </div>

        <div className="case-detail-metric-grid">
          {headerMetrics.map((item) => (
            <div key={item.label} className="case-detail-metric-card">
              <div className="case-detail-metric-icon">
                <item.icon size={18} />
              </div>
              <div className="case-detail-metric-copy">
                <span className="case-detail-metric-label">{item.label}</span>
                <span className="case-detail-metric-value">{item.value}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="case-detail-shell">
        <div className="case-detail-tab-strip">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`case-detail-tab-button${activeTab === tab.id ? ' active' : ''}`}
            >
              <tab.icon size={16} />
              <span>{tab.label}</span>
              {tab.id === 'activity log' ? (
                <span className="case-detail-tab-count">{activities.length}</span>
              ) : null}
              {tab.id === 'documents' ? (
                <span className="case-detail-tab-count">{documents.length}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="case-detail-content">
          {activeTab === 'overview' && (
            <div className="case-detail-overview-grid">
              <article className="case-detail-panel case-detail-panel-large">
                <div className="case-detail-panel-header">
                  <div>
                    <h2 className="case-detail-panel-title">Matter Brief</h2>
                    <p className="case-detail-panel-subtitle">
                      A clean overview of the core details attached to this case.
                    </p>
                  </div>
                </div>

                <div className="case-detail-summary-grid">
                  {overviewHighlights.map((item) => (
                    <div key={item.label} className="case-detail-overview-card">
                      <div className="case-detail-overview-card-icon">
                        <item.icon size={18} />
                      </div>
                      <div className="case-detail-overview-card-copy">
                        <span className="case-detail-overview-card-label">{item.label}</span>
                        <span className="case-detail-overview-card-value">{item.value}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="case-detail-brief-grid">
                  <div className="case-detail-summary-block">
                    <span className="case-detail-summary-label">Offence / Matter</span>
                    <p className="case-detail-summary-value">
                      {caseData.offence || 'Not specified'}
                    </p>
                  </div>

                  <div className="case-detail-summary-block">
                    <span className="case-detail-summary-label">Description</span>
                    <p className="case-detail-summary-value case-detail-summary-value-multiline">
                      {caseData.description || 'No description provided.'}
                    </p>
                  </div>
                </div>
              </article>

              <div className="case-detail-sidebar-stack">
                <article className="case-detail-panel">
                  <div className="case-detail-panel-header">
                    <div>
                      <h2 className="case-detail-panel-title">Recent Movement</h2>
                      <p className="case-detail-panel-subtitle">
                        The latest logged activity on this file.
                      </p>
                    </div>
                  </div>

                  {latestActivity ? (
                    <div className="case-detail-highlight-card">
                      <div className="case-detail-highlight-meta">
                        <span className="case-detail-highlight-chip">
                          <Clock3 size={14} />
                          {formatDateTime(getActivityTimestamp(latestActivity))}
                        </span>
                        {latestActivity.court_name ? (
                          <span className="case-detail-highlight-chip">
                            {latestActivity.court_name}
                          </span>
                        ) : null}
                      </div>

                      <p className="case-detail-highlight-copy">
                        {latestActivity.description}
                      </p>
                    </div>
                  ) : (
                    <div className="case-detail-empty-box">
                      No activity has been logged for this case yet.
                    </div>
                  )}
                </article>
              </div>
            </div>
          )}

          {activeTab === 'activity log' && (
            <div className="case-detail-activity-grid">
              <article className="case-detail-panel">
                <div className="case-detail-panel-header">
                  <div>
                    <h2 className="case-detail-panel-title">Log New Activity</h2>
                    <p className="case-detail-panel-subtitle">
                      Capture progress updates, court actions, interviews, and follow-ups.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleAddActivity} className="case-detail-form">
                  <label htmlFor="activityDesc" className="case-detail-field-label">
                    Description / Notes
                  </label>
                  <textarea
                    id="activityDesc"
                    required
                    rows={6}
                    placeholder="What happened in this case?"
                    className="case-detail-textarea"
                    value={newActivity.description}
                    onChange={(e) =>
                      setNewActivity({ ...newActivity, description: e.target.value })
                    }
                    disabled={isLogging}
                  />

                  <div className="case-detail-form-actions">
                    <button
                      type="submit"
                      disabled={isLogging}
                      className="case-detail-primary-button"
                    >
                      {isLogging ? (
                        <Loader2 size={16} className="student-loader-icon" />
                      ) : (
                        <Plus size={16} />
                      )}
                      {isLogging ? 'Logging...' : 'Log Activity'}
                    </button>
                  </div>
                </form>

                <div className="case-detail-support-card">
                  <div className="case-detail-support-header">
                    <h3 className="case-detail-support-title">Activity Essentials</h3>
                    <span className="case-detail-support-chip">Notes</span>
                  </div>
                  <p className="case-detail-support-copy">
                    Keep entries concise and factual so the running timeline stays easy to
                    review.
                  </p>
                  <div className="case-detail-support-list">
                    <div className="case-detail-support-list-item">
                      Capture the action taken and the immediate result.
                    </div>
                    <div className="case-detail-support-list-item">
                      Include dates, places, or court references when they matter.
                    </div>
                    <div className="case-detail-support-list-item">
                      Log one update per event to keep the history scannable.
                    </div>
                  </div>
                </div>
              </article>

              <article className="case-detail-panel case-detail-panel-large">
                <div className="case-detail-panel-header">
                  <div>
                    <h2 className="case-detail-panel-title">Activity Timeline</h2>
                    <p className="case-detail-panel-subtitle">
                      Entries are shown newest first so the latest work stays visible.
                    </p>
                  </div>
                  <span className="case-detail-panel-badge">
                    {activities.length} {activities.length === 1 ? 'Entry' : 'Entries'}
                  </span>
                </div>

                {activities.length === 0 ? (
                  <div className="case-detail-empty-box">
                    No activities logged yet.
                  </div>
                ) : (
                  <div className="case-detail-timeline">
                    {activities.map((activityItem) => (
                      <div key={activityItem.id} className="case-detail-timeline-item">
                        <div className="case-detail-timeline-icon">
                          <Clock3 size={16} />
                        </div>

                        <div className="case-detail-timeline-body">
                          <div className="case-detail-timeline-header">
                            <span className="case-detail-timeline-title">Activity Log</span>
                            <span className="case-detail-timeline-time">
                              {formatDateTime(getActivityTimestamp(activityItem))}
                            </span>
                          </div>

                          {activityItem.court_name ? (
                            <div className="case-detail-timeline-court">
                              {activityItem.court_name}
                            </div>
                          ) : null}

                          <p className="case-detail-timeline-copy">
                            {activityItem.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="case-detail-document-grid">
              <article className="case-detail-panel">
                <div className="case-detail-panel-header">
                  <div>
                    <h2 className="case-detail-panel-title">Upload Document</h2>
                    <p className="case-detail-panel-subtitle">
                      Add pleadings, supporting files, or any other evidence for this case.
                    </p>
                  </div>
                </div>

                <input
                  type="file"
                  className="case-detail-hidden-input"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />

                <div
                  className="case-detail-upload-dropzone"
                  onClick={triggerFilePicker}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      triggerFilePicker();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {isUploading ? (
                    <div className="case-detail-upload-state">
                      <Loader2 size={24} className="student-loader-icon" />
                      <span>Uploading document...</span>
                    </div>
                  ) : (
                    <>
                      <div className="case-detail-upload-icon">
                        <UploadCloud size={24} />
                      </div>
                      <h3 className="case-detail-upload-title">Choose a file to upload</h3>
                      <p className="case-detail-upload-copy">
                        Click this panel or use the button below to attach a document.
                      </p>
                      <button type="button" className="case-detail-primary-button">
                        <Plus size={16} />
                        Select File
                      </button>
                    </>
                  )}
                </div>

                <div className="case-detail-support-card">
                  <div className="case-detail-support-header">
                    <h3 className="case-detail-support-title">Document Vault</h3>
                    <span className="case-detail-support-chip">
                      {documents.length} {documents.length === 1 ? 'File' : 'Files'}
                    </span>
                  </div>
                  <p className="case-detail-support-copy">
                    Uploaded files stay attached to this matter and can be opened from the
                    list on the right.
                  </p>
                  <div className="case-detail-support-stat-grid">
                    <div className="case-detail-support-stat">
                      <span className="case-detail-support-stat-label">Latest upload</span>
                      <span className="case-detail-support-stat-value">
                        {latestDocument
                          ? formatDateTime(latestDocument.upload_date)
                          : 'No uploads yet'}
                      </span>
                    </div>
                    <div className="case-detail-support-stat">
                      <span className="case-detail-support-stat-label">Files ready</span>
                      <span className="case-detail-support-stat-value">
                        {documents.length}
                      </span>
                    </div>
                  </div>
                </div>
              </article>

              <article className="case-detail-panel case-detail-panel-large">
                <div className="case-detail-panel-header">
                  <div>
                    <h2 className="case-detail-panel-title">Case Documents</h2>
                    <p className="case-detail-panel-subtitle">
                      Open any uploaded file directly from this workspace.
                    </p>
                  </div>
                  <span className="case-detail-panel-badge">
                    {documents.length} {documents.length === 1 ? 'File' : 'Files'}
                  </span>
                </div>

                {documents.length === 0 ? (
                  <div className="case-detail-empty-box">
                    No documents uploaded yet.
                  </div>
                ) : (
                  <div className="case-detail-document-list">
                    {documents.map((docItem) => (
                      <button
                        key={docItem.id}
                        type="button"
                        onClick={() => handleOpenDocument(docItem)}
                        disabled={openingDocumentId === docItem.id}
                        className="case-detail-document-item"
                      >
                        <div className="case-detail-document-icon">
                          <FileText size={18} />
                        </div>

                        <div className="case-detail-document-copy">
                          <p className="case-detail-document-name">
                            {docItem.name || 'Unnamed document'}
                          </p>
                          <p className="case-detail-document-meta">
                            {getFileSizeLabel(docItem.size)} | Uploaded{' '}
                            {formatDateTime(docItem.upload_date)}
                          </p>
                        </div>

                        <div className="case-detail-document-action">
                          <span>
                            {openingDocumentId === docItem.id ? 'Opening...' : 'Open'}
                          </span>
                          <ArrowUpRight size={16} />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </article>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
