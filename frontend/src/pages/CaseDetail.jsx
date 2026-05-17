import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  Clock3,
  Crown,
  Pencil,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
  UploadCloud,
  User,
  Users,
  X,
} from 'lucide-react';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { api } from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import EventModal from '../components/calendar/EventModal';
import UpcomingEvents from '../components/calendar/UpcomingEvents';
import {
  CASE_STATUS_STEPS,
  getCaseStatusMeta,
  normalizeCaseStatus,
} from '../utils/caseStatus';
import {
  CASE_DISPLAY_ID_FALLBACK,
  findCaseByDisplayOrFirebaseId,
} from '../utils/caseDisplayId';

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
  let date = value?.toDate?.();

  if (!date && typeof value?._seconds === 'number') {
    date = new Date(
      value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1000000)
    );
  }

  if (!date && typeof value?.seconds === 'number') {
    date = new Date(
      value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000)
    );
  }

  if (!date && (typeof value === 'string' || typeof value === 'number')) {
    const parsed = new Date(value);
    date = Number.isNaN(parsed.getTime()) ? null : parsed;
  }

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
  const statusMeta = getCaseStatusMeta(status);

  return {
    ...statusMeta,
    className: `case-detail-status-${statusMeta.value}`,
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
  { id: 'events', label: 'Schedule', icon: CalendarDays },
  { id: 'reflections', label: 'Group Reports', icon: Users },
  { id: 'documents', label: 'Documents', icon: FileText },
];

const caseTypeOptions = [
  { value: 'criminal', label: 'Criminal' },
  { value: 'civil', label: 'Civil' },
  { value: 'family', label: 'Family' },
  { value: 'property', label: 'Property' },
];

const getCaseDraft = (caseData) => ({
  client_name: caseData?.client_name || '',
  case_type: caseData?.case_type || 'criminal',
  offence: caseData?.offence || '',
  description: caseData?.description || '',
});

const getCaseEventTitle = (caseData) => {
  if (!caseData) return '';

  const clientName = caseData.client_name || 'Untitled Client';

  return caseData.offence ? `${clientName} - ${caseData.offence}` : clientName;
};

export default function CaseDetail() {
  const { caseId: routeCaseId } = useParams();
  const navigate = useNavigate();
  const { currentUser, userRole } = useAuth();

  const [activeTab, setActiveTab] = useState('overview');
  const [caseData, setCaseData] = useState(null);
  const [resolvedCaseId, setResolvedCaseId] = useState('');
  const [caseDisplayId, setCaseDisplayId] = useState(CASE_DISPLAY_ID_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState('open');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isEditingCase, setIsEditingCase] = useState(false);
  const [caseDraft, setCaseDraft] = useState(getCaseDraft(null));
  const [isSavingCase, setIsSavingCase] = useState(false);
  const [isDeletingCase, setIsDeletingCase] = useState(false);

  const [activities, setActivities] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [groupReflections, setGroupReflections] = useState([]);
  const [reflectionDraft, setReflectionDraft] = useState({
    title: '',
    content: '',
  });
  const [selectedReflectionGroupId, setSelectedReflectionGroupId] = useState('');
  const [isSubmittingReflection, setIsSubmittingReflection] = useState(false);
  const [assignableGroups, setAssignableGroups] = useState([]);
  const [selectedGroupAssignmentId, setSelectedGroupAssignmentId] = useState('');
  const [isAssigningGroup, setIsAssigningGroup] = useState(false);

  const [newActivity, setNewActivity] = useState({ description: '' });
  const [isLogging, setIsLogging] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState(null);
  const [activityDraft, setActivityDraft] = useState({ description: '' });
  const [savingActivityId, setSavingActivityId] = useState(null);
  const [deletingActivityId, setDeletingActivityId] = useState(null);

  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [openingDocumentId, setOpeningDocumentId] = useState(null);
  const [editingDocumentId, setEditingDocumentId] = useState(null);
  const [documentDraft, setDocumentDraft] = useState({ name: '' });
  const [savingDocumentId, setSavingDocumentId] = useState(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState(null);
  const [savingEvent, setSavingEvent] = useState(false);
  const [cancellingEvent, setCancellingEvent] = useState(false);
  const [eventsRefreshKey, setEventsRefreshKey] = useState(0);

  const getActivityTimestamp = (activity) => activity?.logged_at || activity?.date;

  useEffect(() => {
    if (!routeCaseId) return;

    let isCurrent = true;

    const fetchCaseData = async () => {
      setLoading(true);
      setCaseData(null);
      setResolvedCaseId('');
      setCaseDisplayId(CASE_DISPLAY_ID_FALLBACK);
      setActivities([]);
      setDocuments([]);
      setGroupReflections([]);
      setSelectedReflectionGroupId('');

      try {
        let visibleCases = [];

        try {
          visibleCases = await api.getVisibleCases();
        } catch (resolveError) {
          console.error('Error resolving display case ID:', resolveError);
        }

        const listedCase = findCaseByDisplayOrFirebaseId(visibleCases, routeCaseId);
        const firebaseCaseId = listedCase?.id || routeCaseId;
        const displayId = listedCase?.caseDisplayId || CASE_DISPLAY_ID_FALLBACK;
        const fetchedCase = await api.getCase(firebaseCaseId);

        if (!isCurrent) return;

        if (fetchedCase?.id) {
          const nextCaseData = {
            ...fetchedCase,
            caseDisplayId: displayId,
          };

          if (nextCaseData.is_deleted && userRole !== 'admin') {
            setCaseData(null);
            return;
          }

          setResolvedCaseId(nextCaseData.id);
          setCaseDisplayId(displayId);
          setCaseData(nextCaseData);
          setCaseDraft(getCaseDraft(nextCaseData));
          setSelectedStatus(normalizeCaseStatus(nextCaseData.status));

          const leaderGroup = (nextCaseData.group_assignments || []).find(
            (group) => group.current_user_role === 'leader'
          );
          setSelectedReflectionGroupId(leaderGroup?.id || '');

          if (listedCase?.caseDisplayId && routeCaseId !== listedCase.caseDisplayId) {
            navigate(`/cases/${listedCase.caseDisplayId}`, { replace: true });
          }
        } else {
          setCaseData(null);
        }
      } catch (err) {
        console.error('Error fetching case details:', err);
        if (isCurrent) {
          setCaseData(null);
        }
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    };

    fetchCaseData();

    return () => {
      isCurrent = false;
    };
  }, [navigate, routeCaseId, userRole]);

  useEffect(() => {
    if (!resolvedCaseId) return;

    const q = query(collection(db, 'activities'), where('case_id', '==', resolvedCaseId));

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
  }, [resolvedCaseId]);

  useEffect(() => {
    if (!resolvedCaseId) return;

    const q = query(collection(db, 'documents'), where('case_id', '==', resolvedCaseId));

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
  }, [resolvedCaseId]);

  useEffect(() => {
    if (userRole !== 'admin') {
      setAssignableGroups([]);
      return;
    }

    let isCurrent = true;

    const fetchGroups = async () => {
      try {
        const groups = await api.getGroups();

        if (isCurrent) {
          setAssignableGroups(groups);
        }
      } catch (err) {
        console.error('Failed to load groups for assignment', err);
      }
    };

    fetchGroups();

    return () => {
      isCurrent = false;
    };
  }, [userRole]);

  useEffect(() => {
    if (!resolvedCaseId || !caseData) return;

    const assignedGroups = caseData.group_assignments || [];
    const canViewReflections =
      userRole === 'admin' ||
      assignedGroups.some((group) => Boolean(group.current_user_role));

    if (!canViewReflections) {
      setGroupReflections([]);
      return;
    }

    let isCurrent = true;

    const fetchReflections = async () => {
      try {
        const reflections = await api.getCaseGroupReflections(resolvedCaseId);

        if (isCurrent) {
          setGroupReflections(reflections);
        }
      } catch (err) {
        console.error('Failed to load group reflections', err);
        if (isCurrent) {
          setGroupReflections([]);
        }
      }
    };

    fetchReflections();

    return () => {
      isCurrent = false;
    };
  }, [caseData, resolvedCaseId, userRole]);

  const handleAddActivity = async (e) => {
    e.preventDefault();

    if (!resolvedCaseId || !newActivity.description.trim()) return;

    setIsLogging(true);
    try {
      await api.logActivity(resolvedCaseId, {
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
    if (!resolvedCaseId || !file) return;

    setIsUploading(true);
    try {
      await api.uploadDocument(resolvedCaseId, file);
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

  const handleStatusUpdate = async (e) => {
    e.preventDefault();

    const nextStatus = normalizeCaseStatus(selectedStatus);

    if (
      !resolvedCaseId ||
      !caseData ||
      nextStatus === normalizeCaseStatus(caseData.status)
    ) {
      return;
    }

    setIsUpdatingStatus(true);
    try {
      const result = await api.updateCaseStatus(resolvedCaseId, nextStatus);
      const savedStatus = normalizeCaseStatus(result?.case?.status || nextStatus);

      setCaseData((currentCase) =>
        currentCase
          ? {
              ...currentCase,
              status: savedStatus,
            }
          : currentCase
      );
      setSelectedStatus(savedStatus);
    } catch (err) {
      console.error('Failed to update case status', err);
      alert('Failed to update case status: ' + err.message);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleStartCaseEdit = () => {
    setCaseDraft(getCaseDraft(caseData));
    setIsEditingCase(true);
  };

  const handleCancelCaseEdit = () => {
    setCaseDraft(getCaseDraft(caseData));
    setIsEditingCase(false);
  };

  const handleCaseUpdate = async (e) => {
    e.preventDefault();

    const updates = {
      client_name: caseDraft.client_name.trim(),
      case_type: caseDraft.case_type,
      offence: caseDraft.offence.trim(),
      description: caseDraft.description.trim(),
    };

    if (!updates.client_name || !updates.case_type || !updates.offence) {
      alert('Client name, case type, and offence / matter are required.');
      return;
    }

    if (!resolvedCaseId) return;

    setIsSavingCase(true);
    try {
      const result = await api.updateCase(resolvedCaseId, updates);
      const savedCase = {
        ...updates,
        ...(result?.case || {}),
      };

      setCaseData((currentCase) =>
        currentCase
          ? {
              ...currentCase,
              ...savedCase,
            }
          : currentCase
      );
      setCaseDraft(getCaseDraft(savedCase));
      setIsEditingCase(false);
    } catch (err) {
      console.error('Failed to update case', err);
      alert('Failed to update case: ' + err.message);
    } finally {
      setIsSavingCase(false);
    }
  };

  const handleCaseDelete = async () => {
    const confirmed = window.confirm(
      'Delete this case from the active case list? You can undo this from the admin cases page.'
    );

    if (!confirmed || !resolvedCaseId) return;

    setIsDeletingCase(true);
    try {
      await api.deleteCase(resolvedCaseId);
      navigate('/admin/cases', {
        replace: true,
        state: {
          deletedCaseId: resolvedCaseId,
          deletedCaseName: caseData?.client_name || 'Untitled Client',
        },
      });
    } catch (err) {
      console.error('Failed to delete case', err);
      alert('Failed to delete case: ' + err.message);
    } finally {
      setIsDeletingCase(false);
    }
  };

  const handleStartActivityEdit = (activityItem) => {
    setEditingActivityId(activityItem.id);
    setActivityDraft({ description: activityItem.description || '' });
  };

  const handleCancelActivityEdit = () => {
    setEditingActivityId(null);
    setActivityDraft({ description: '' });
  };

  const handleActivityUpdate = async (activityId) => {
    const description = activityDraft.description.trim();

    if (!resolvedCaseId || !description) {
      alert('Activity description is required.');
      return;
    }

    setSavingActivityId(activityId);
    try {
      await api.updateActivity(resolvedCaseId, activityId, { description });
      handleCancelActivityEdit();
    } catch (err) {
      console.error('Failed to update activity', err);
      alert('Failed to update activity: ' + err.message);
    } finally {
      setSavingActivityId(null);
    }
  };

  const handleActivityDelete = async (activityId) => {
    if (!resolvedCaseId || !window.confirm('Delete this activity entry?')) return;

    setDeletingActivityId(activityId);
    try {
      await api.deleteActivity(resolvedCaseId, activityId);
      if (editingActivityId === activityId) {
        handleCancelActivityEdit();
      }
    } catch (err) {
      console.error('Failed to delete activity', err);
      alert('Failed to delete activity: ' + err.message);
    } finally {
      setDeletingActivityId(null);
    }
  };

  const handleStartDocumentEdit = (docItem) => {
    setEditingDocumentId(docItem.id);
    setDocumentDraft({ name: docItem.name || '' });
  };

  const handleCancelDocumentEdit = () => {
    setEditingDocumentId(null);
    setDocumentDraft({ name: '' });
  };

  const handleDocumentUpdate = async (documentId) => {
    const name = documentDraft.name.trim();

    if (!name) {
      alert('Document name is required.');
      return;
    }

    setSavingDocumentId(documentId);
    try {
      await api.updateDocument(documentId, { name });
      handleCancelDocumentEdit();
    } catch (err) {
      console.error('Failed to update document', err);
      alert('Failed to update document: ' + err.message);
    } finally {
      setSavingDocumentId(null);
    }
  };

  const handleDocumentDelete = async (documentId) => {
    if (!window.confirm('Delete this document?')) return;

    setDeletingDocumentId(documentId);
    try {
      await api.deleteDocument(documentId);
      if (editingDocumentId === documentId) {
        handleCancelDocumentEdit();
      }
    } catch (err) {
      console.error('Failed to delete document', err);
      alert('Failed to delete document: ' + err.message);
    } finally {
      setDeletingDocumentId(null);
    }
  };

  const handleOpenEventCreate = () => {
    setSelectedCalendarEvent(null);
    setIsEventModalOpen(true);
  };

  const handleOpenEventEdit = (eventItem) => {
    setSelectedCalendarEvent(eventItem);
    setIsEventModalOpen(true);
  };

  const handleCloseEventModal = () => {
    setSelectedCalendarEvent(null);
    setIsEventModalOpen(false);
  };

  const handleEventSubmit = async (eventPayload) => {
    if (!resolvedCaseId) return;

    setSavingEvent(true);

    try {
      const payload = {
        ...eventPayload,
        case_id: resolvedCaseId,
        case_title: getCaseEventTitle(caseData),
      };

      if (selectedCalendarEvent) {
        await api.updateEvent(selectedCalendarEvent.id, payload);
      } else {
        await api.createEvent(payload);
      }

      handleCloseEventModal();
      setEventsRefreshKey((key) => key + 1);
    } catch (err) {
      console.error('Failed to save event', err);
      alert('Failed to save event: ' + err.message);
    } finally {
      setSavingEvent(false);
    }
  };

  const handleEventDelete = async (eventItem) => {
    if (!window.confirm('Cancel this scheduled event?')) return;

    setCancellingEvent(true);

    try {
      await api.deleteEvent(eventItem.id);
      handleCloseEventModal();
      setEventsRefreshKey((key) => key + 1);
    } catch (err) {
      console.error('Failed to cancel event', err);
      alert('Failed to cancel event: ' + err.message);
    } finally {
      setCancellingEvent(false);
    }
  };

  const refreshCaseDetails = async () => {
    if (!resolvedCaseId) return null;

    const refreshedCase = await api.getCase(resolvedCaseId);
    const nextCaseData = {
      ...refreshedCase,
      caseDisplayId,
    };

    setCaseData(nextCaseData);

    const leaderGroup = (nextCaseData.group_assignments || []).find(
      (group) => group.current_user_role === 'leader'
    );
    setSelectedReflectionGroupId(leaderGroup?.id || '');

    return nextCaseData;
  };

  const refreshGroupReflections = async () => {
    if (!resolvedCaseId) return;

    const reflections = await api.getCaseGroupReflections(resolvedCaseId);
    setGroupReflections(reflections);
  };

  const handleAssignGroup = async (e) => {
    e.preventDefault();

    if (!resolvedCaseId || !selectedGroupAssignmentId) {
      alert('Select an active group to assign.');
      return;
    }

    setIsAssigningGroup(true);
    try {
      await api.assignCaseToGroup(resolvedCaseId, selectedGroupAssignmentId);
      await refreshCaseDetails();
      setSelectedGroupAssignmentId('');
    } catch (err) {
      console.error('Failed to assign group', err);
      alert('Failed to assign group: ' + err.message);
    } finally {
      setIsAssigningGroup(false);
    }
  };

  const handleSubmitGroupReflection = async (e) => {
    e.preventDefault();

    const title = reflectionDraft.title.trim();
    const content = reflectionDraft.content.trim();

    if (!resolvedCaseId || !selectedReflectionGroupId) {
      alert('Select the group for this reflection.');
      return;
    }

    if (!title || !content) {
      alert('Reflection title and content are required.');
      return;
    }

    setIsSubmittingReflection(true);
    try {
      await api.submitGroupReflection(resolvedCaseId, {
        group_id: selectedReflectionGroupId,
        title,
        content,
      });
      setReflectionDraft({ title: '', content: '' });
      await Promise.all([refreshGroupReflections(), refreshCaseDetails()]);
    } catch (err) {
      console.error('Failed to submit group reflection', err);
      alert('Failed to submit group reflection: ' + err.message);
    } finally {
      setIsSubmittingReflection(false);
    }
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
  const canUpdateStatus = userRole === 'law_student';
  const canManageCase = userRole === 'admin' || userRole === 'law_student';
  const canDeleteCase = userRole === 'admin';
  const latestActivity = activities[0] || null;
  const latestDocument = documents[0] || null;
  const groupAssignments = caseData.group_assignments || [];
  const assignedGroupIds = new Set(groupAssignments.map((group) => group.id));
  const activeAssignableGroups = assignableGroups.filter(
    (group) => group.status === 'active' && !assignedGroupIds.has(group.id)
  );
  const leaderGroups = groupAssignments.filter(
    (group) =>
      group.current_user_role === 'leader' || group.leader_id === currentUser?.uid
  );
  const canSubmitGroupReflection =
    userRole === 'law_student' && leaderGroups.length > 0;

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
          <span className="case-detail-breadcrumb-current">Case {caseDisplayId}</span>
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
            <span className="case-detail-id-value">{caseDisplayId}</span>
            <span className="case-detail-id-meta">
              Opened {formatDate(caseData.date_opened)}
            </span>

            {canUpdateStatus ? (
              <form onSubmit={handleStatusUpdate} className="case-detail-status-form">
                <label
                  htmlFor="case-status-select"
                  className="case-detail-status-form-label"
                >
                  Update Status
                </label>
                <div className="case-detail-status-form-row">
                  <select
                    id="case-status-select"
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    disabled={isUpdatingStatus}
                    className="case-detail-status-select"
                  >
                    {CASE_STATUS_STEPS.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={
                      isUpdatingStatus ||
                      normalizeCaseStatus(selectedStatus) ===
                        normalizeCaseStatus(caseData.status)
                    }
                    className="case-detail-status-save-button"
                  >
                    {isUpdatingStatus ? (
                      <Loader2 size={16} className="student-loader-icon" />
                    ) : (
                      'Save'
                    )}
                  </button>
                </div>
              </form>
            ) : null}

            {canDeleteCase ? (
              <button
                type="button"
                onClick={handleCaseDelete}
                disabled={isDeletingCase}
                className="case-detail-danger-button case-detail-full-width-button"
              >
                {isDeletingCase ? (
                  <Loader2 size={16} className="student-loader-icon" />
                ) : (
                  <Trash2 size={16} />
                )}
                {isDeletingCase ? 'Deleting...' : 'Delete Case'}
              </button>
            ) : null}
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
              {tab.id === 'reflections' ? (
                <span className="case-detail-tab-count">{groupReflections.length}</span>
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

                  {canManageCase && !isEditingCase ? (
                    <button
                      type="button"
                      onClick={handleStartCaseEdit}
                      className="case-detail-secondary-button"
                    >
                      <Pencil size={16} />
                      Edit
                    </button>
                  ) : null}
                </div>

                {isEditingCase ? (
                  <form onSubmit={handleCaseUpdate} className="case-detail-edit-form">
                    <div className="case-detail-edit-grid">
                      <label className="case-detail-edit-field">
                        <span className="case-detail-field-label">Client Name</span>
                        <input
                          type="text"
                          value={caseDraft.client_name}
                          onChange={(e) =>
                            setCaseDraft({ ...caseDraft, client_name: e.target.value })
                          }
                          className="case-detail-input"
                          required
                        />
                      </label>

                      <label className="case-detail-edit-field">
                        <span className="case-detail-field-label">Case Type</span>
                        <select
                          value={caseDraft.case_type}
                          onChange={(e) =>
                            setCaseDraft({ ...caseDraft, case_type: e.target.value })
                          }
                          className="case-detail-select"
                          required
                        >
                          {caseTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="case-detail-edit-field case-detail-edit-field-wide">
                        <span className="case-detail-field-label">Offence / Matter</span>
                        <input
                          type="text"
                          value={caseDraft.offence}
                          onChange={(e) =>
                            setCaseDraft({ ...caseDraft, offence: e.target.value })
                          }
                          className="case-detail-input"
                          required
                        />
                      </label>

                      <label className="case-detail-edit-field case-detail-edit-field-wide">
                        <span className="case-detail-field-label">Description</span>
                        <textarea
                          value={caseDraft.description}
                          onChange={(e) =>
                            setCaseDraft({ ...caseDraft, description: e.target.value })
                          }
                          rows={5}
                          className="case-detail-textarea"
                          placeholder="No description provided."
                        />
                      </label>
                    </div>

                    <div className="case-detail-inline-actions">
                      <button
                        type="button"
                        onClick={handleCancelCaseEdit}
                        disabled={isSavingCase}
                        className="case-detail-secondary-button"
                      >
                        <X size={16} />
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingCase}
                        className="case-detail-primary-button"
                      >
                        {isSavingCase ? (
                          <Loader2 size={16} className="student-loader-icon" />
                        ) : (
                          <Save size={16} />
                        )}
                        {isSavingCase ? 'Saving...' : 'Save Case'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="case-detail-summary-grid">
                      {overviewHighlights.map((item) => (
                        <div key={item.label} className="case-detail-overview-card">
                          <div className="case-detail-overview-card-icon">
                            <item.icon size={18} />
                          </div>
                          <div className="case-detail-overview-card-copy">
                            <span className="case-detail-overview-card-label">
                              {item.label}
                            </span>
                            <span className="case-detail-overview-card-value">
                              {item.value}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="case-detail-brief-grid">
                      <div className="case-detail-summary-block">
                        <span className="case-detail-summary-label">
                          Offence / Matter
                        </span>
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
                  </>
                )}
              </article>

              <div className="case-detail-sidebar-stack">
                {(groupAssignments.length > 0 || userRole === 'admin') ? (
                  <article className="case-detail-panel">
                    <div className="case-detail-panel-header">
                      <div>
                        <h2 className="case-detail-panel-title">Group Collaboration</h2>
                        <p className="case-detail-panel-subtitle">
                          Student groups assigned to this case.
                        </p>
                      </div>
                    </div>

                    {groupAssignments.length === 0 ? (
                      <div className="case-detail-empty-box">
                        No group is assigned to this case yet.
                      </div>
                    ) : (
                      <div className="case-detail-group-list">
                        {groupAssignments.map((group) => (
                          <div key={group.id} className="case-detail-group-card">
                            <div className="case-detail-group-card-header">
                              <div>
                                <h3 className="case-detail-group-name">{group.name}</h3>
                                <p className="case-detail-group-meta">
                                  {group.member_count || 0}{' '}
                                  {(group.member_count || 0) === 1 ? 'member' : 'members'}
                                </p>
                              </div>
                              <span className="case-detail-group-role-pill">
                                {group.current_user_role
                                  ? formatLabel(group.current_user_role, 'Member')
                                  : formatLabel(group.status, 'Active')}
                              </span>
                            </div>

                            <div className="case-detail-group-leader">
                              <Crown size={15} />
                              <span>{group.leader_name || 'Leader not found'}</span>
                            </div>

                            <div className="case-detail-group-members">
                              {(group.members || []).map((member) => (
                                <span key={member.user_id}>
                                  {member.user_name || member.user_email || 'Student'}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {userRole === 'admin' ? (
                      <form
                        onSubmit={handleAssignGroup}
                        className="case-detail-group-assignment-form"
                      >
                        <label className="case-detail-field-label">
                          Assign Active Group
                        </label>
                        <div className="case-detail-group-assignment-row">
                          <select
                            value={selectedGroupAssignmentId}
                            onChange={(e) => setSelectedGroupAssignmentId(e.target.value)}
                            disabled={isAssigningGroup || activeAssignableGroups.length === 0}
                            className="case-detail-select"
                          >
                            <option value="">
                              {activeAssignableGroups.length
                                ? 'Select group'
                                : 'No active groups available'}
                            </option>
                            {activeAssignableGroups.map((group) => (
                              <option key={group.id} value={group.id}>
                                {group.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            disabled={isAssigningGroup || !selectedGroupAssignmentId}
                            className="case-detail-primary-button"
                          >
                            {isAssigningGroup ? (
                              <Loader2 size={16} className="student-loader-icon" />
                            ) : (
                              <Plus size={16} />
                            )}
                            Assign
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </article>
                ) : null}

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
                    {activities.map((activityItem) => {
                      const isEditingActivity = editingActivityId === activityItem.id;
                      const isSavingActivity = savingActivityId === activityItem.id;
                      const isDeletingActivity = deletingActivityId === activityItem.id;

                      return (
                        <div key={activityItem.id} className="case-detail-timeline-item">
                          <div className="case-detail-timeline-icon">
                            <Clock3 size={16} />
                          </div>

                          <div className="case-detail-timeline-body">
                            <div className="case-detail-timeline-header">
                              <span className="case-detail-timeline-title">
                                Activity Log
                              </span>
                              <div className="case-detail-timeline-actions">
                                <span className="case-detail-timeline-time">
                                  {formatDateTime(getActivityTimestamp(activityItem))}
                                </span>
                                {!isEditingActivity ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleStartActivityEdit(activityItem)}
                                      className="case-detail-icon-button"
                                      aria-label="Edit activity"
                                    >
                                      <Pencil size={15} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleActivityDelete(activityItem.id)}
                                      disabled={isDeletingActivity}
                                      className="case-detail-icon-button case-detail-icon-button-danger"
                                      aria-label="Delete activity"
                                    >
                                      {isDeletingActivity ? (
                                        <Loader2
                                          size={15}
                                          className="student-loader-icon"
                                        />
                                      ) : (
                                        <Trash2 size={15} />
                                      )}
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </div>

                            {activityItem.court_name ? (
                              <div className="case-detail-timeline-court">
                                {activityItem.court_name}
                              </div>
                            ) : null}

                            {isEditingActivity ? (
                              <div className="case-detail-inline-editor">
                                <textarea
                                  value={activityDraft.description}
                                  onChange={(e) =>
                                    setActivityDraft({
                                      ...activityDraft,
                                      description: e.target.value,
                                    })
                                  }
                                  rows={4}
                                  className="case-detail-textarea"
                                  disabled={isSavingActivity}
                                />
                                <div className="case-detail-inline-actions">
                                  <button
                                    type="button"
                                    onClick={handleCancelActivityEdit}
                                    disabled={isSavingActivity}
                                    className="case-detail-secondary-button"
                                  >
                                    <X size={16} />
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleActivityUpdate(activityItem.id)}
                                    disabled={isSavingActivity}
                                    className="case-detail-primary-button"
                                  >
                                    {isSavingActivity ? (
                                      <Loader2
                                        size={16}
                                        className="student-loader-icon"
                                      />
                                    ) : (
                                      <Save size={16} />
                                    )}
                                    {isSavingActivity ? 'Saving...' : 'Save'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="case-detail-timeline-copy">
                                {activityItem.description}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            </div>
          )}

          {activeTab === 'events' && (
            <div className="case-detail-events-grid">
              <UpcomingEvents
                caseId={resolvedCaseId}
                status="all"
                limit={25}
                title="Case Schedule"
                subtitle="Events attached to this case."
                emptyTitle="No scheduled events"
                emptyCopy="Create an event to track this case deadline or meeting."
                showCalendarLink
                onCreate={canManageCase ? handleOpenEventCreate : undefined}
                onEdit={canManageCase ? handleOpenEventEdit : undefined}
                refreshKey={eventsRefreshKey}
              />
            </div>
          )}

          {activeTab === 'reflections' && (
            <div className="case-detail-reflection-grid">
              <article className="case-detail-panel">
                <div className="case-detail-panel-header">
                  <div>
                    <h2 className="case-detail-panel-title">Group Reflection</h2>
                    <p className="case-detail-panel-subtitle">
                      Leader-submitted reports are stored for supervisor review later.
                    </p>
                  </div>
                </div>

                {canSubmitGroupReflection ? (
                  <form
                    onSubmit={handleSubmitGroupReflection}
                    className="case-detail-form"
                  >
                    {leaderGroups.length > 1 ? (
                      <label className="case-detail-edit-field">
                        <span className="case-detail-field-label">Group</span>
                        <select
                          value={selectedReflectionGroupId}
                          onChange={(e) => setSelectedReflectionGroupId(e.target.value)}
                          className="case-detail-select"
                          disabled={isSubmittingReflection}
                          required
                        >
                          {leaderGroups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    <label className="case-detail-edit-field">
                      <span className="case-detail-field-label">Title</span>
                      <input
                        type="text"
                        value={reflectionDraft.title}
                        onChange={(e) =>
                          setReflectionDraft({
                            ...reflectionDraft,
                            title: e.target.value,
                          })
                        }
                        className="case-detail-input"
                        disabled={isSubmittingReflection}
                        required
                      />
                    </label>

                    <label className="case-detail-edit-field">
                      <span className="case-detail-field-label">Content</span>
                      <textarea
                        value={reflectionDraft.content}
                        onChange={(e) =>
                          setReflectionDraft({
                            ...reflectionDraft,
                            content: e.target.value,
                          })
                        }
                        rows={8}
                        className="case-detail-textarea"
                        disabled={isSubmittingReflection}
                        required
                      />
                    </label>

                    <div className="case-detail-form-actions">
                      <button
                        type="submit"
                        disabled={isSubmittingReflection}
                        className="case-detail-primary-button"
                      >
                        {isSubmittingReflection ? (
                          <Loader2 size={16} className="student-loader-icon" />
                        ) : (
                          <Send size={16} />
                        )}
                        {isSubmittingReflection ? 'Submitting...' : 'Submit Report'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="case-detail-empty-box">
                    {groupAssignments.length
                      ? 'Only the assigned group leader can submit the group report.'
                      : 'No group is assigned to this case yet.'}
                  </div>
                )}
              </article>

              <article className="case-detail-panel case-detail-panel-large">
                <div className="case-detail-panel-header">
                  <div>
                    <h2 className="case-detail-panel-title">Submitted Reports</h2>
                    <p className="case-detail-panel-subtitle">
                      Reports remain available here for authorized group members and admins.
                    </p>
                  </div>
                  <span className="case-detail-panel-badge">
                    {groupReflections.length}{' '}
                    {groupReflections.length === 1 ? 'Report' : 'Reports'}
                  </span>
                </div>

                {groupReflections.length === 0 ? (
                  <div className="case-detail-empty-box">
                    No group report has been submitted yet.
                  </div>
                ) : (
                  <div className="case-detail-reflection-list">
                    {groupReflections.map((reflection) => {
                      const reflectionGroup = groupAssignments.find(
                        (group) => group.id === reflection.group_id
                      );

                      return (
                        <div
                          key={reflection.id}
                          className="case-detail-reflection-item"
                        >
                          <div className="case-detail-reflection-header">
                            <div>
                              <h3 className="case-detail-reflection-title">
                                {reflection.title}
                              </h3>
                              <p className="case-detail-reflection-meta">
                                {reflectionGroup?.name || 'Group'} | Submitted{' '}
                                {formatDateTime(reflection.submitted_at)}
                              </p>
                            </div>
                            <span className="case-detail-group-role-pill">
                              {formatLabel(reflection.status, 'Submitted')}
                            </span>
                          </div>

                          <p className="case-detail-reflection-copy">
                            {reflection.content}
                          </p>
                        </div>
                      );
                    })}
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
                    {documents.map((docItem) => {
                      const isEditingDocument = editingDocumentId === docItem.id;
                      const isSavingDocument = savingDocumentId === docItem.id;
                      const isDeletingDocument = deletingDocumentId === docItem.id;
                      const isOpeningDocument = openingDocumentId === docItem.id;

                      return (
                        <div key={docItem.id} className="case-detail-document-item">
                          <div className="case-detail-document-icon">
                            <FileText size={18} />
                          </div>

                          <div className="case-detail-document-copy">
                            {isEditingDocument ? (
                              <div className="case-detail-document-editor">
                                <label className="case-detail-field-label">
                                  Document Name
                                </label>
                                <input
                                  type="text"
                                  value={documentDraft.name}
                                  onChange={(e) =>
                                    setDocumentDraft({
                                      ...documentDraft,
                                      name: e.target.value,
                                    })
                                  }
                                  className="case-detail-input"
                                  disabled={isSavingDocument}
                                />
                              </div>
                            ) : (
                              <>
                                <p className="case-detail-document-name">
                                  {docItem.name || 'Unnamed document'}
                                </p>
                                <p className="case-detail-document-meta">
                                  {getFileSizeLabel(docItem.size)} | Uploaded{' '}
                                  {formatDateTime(docItem.upload_date)}
                                </p>
                              </>
                            )}
                          </div>

                          <div className="case-detail-document-actions">
                            {isEditingDocument ? (
                              <>
                                <button
                                  type="button"
                                  onClick={handleCancelDocumentEdit}
                                  disabled={isSavingDocument}
                                  className="case-detail-secondary-button"
                                >
                                  <X size={16} />
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDocumentUpdate(docItem.id)}
                                  disabled={isSavingDocument}
                                  className="case-detail-primary-button"
                                >
                                  {isSavingDocument ? (
                                    <Loader2
                                      size={16}
                                      className="student-loader-icon"
                                    />
                                  ) : (
                                    <Save size={16} />
                                  )}
                                  {isSavingDocument ? 'Saving...' : 'Save'}
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenDocument(docItem)}
                                  disabled={isOpeningDocument || isDeletingDocument}
                                  className="case-detail-secondary-button"
                                >
                                  <span>
                                    {isOpeningDocument ? 'Opening...' : 'Open'}
                                  </span>
                                  <ArrowUpRight size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStartDocumentEdit(docItem)}
                                  disabled={isDeletingDocument}
                                  className="case-detail-icon-button"
                                  aria-label="Edit document"
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDocumentDelete(docItem.id)}
                                  disabled={isDeletingDocument}
                                  className="case-detail-icon-button case-detail-icon-button-danger"
                                  aria-label="Delete document"
                                >
                                  {isDeletingDocument ? (
                                    <Loader2
                                      size={15}
                                      className="student-loader-icon"
                                    />
                                  ) : (
                                    <Trash2 size={15} />
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            </div>
          )}
        </div>
      </section>

      {isEventModalOpen ? (
        <EventModal
          isOpen={isEventModalOpen}
          event={selectedCalendarEvent}
          cases={caseData ? [caseData] : []}
          lockedCaseId={resolvedCaseId}
          lockedCaseTitle={getCaseEventTitle(caseData)}
          isSubmitting={savingEvent}
          isDeleting={cancellingEvent}
          onClose={handleCloseEventModal}
          onSubmit={handleEventSubmit}
          onDelete={handleEventDelete}
        />
      ) : null}
    </div>
  );
}
