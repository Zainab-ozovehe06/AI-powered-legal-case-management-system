import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  CheckCircle2,
  FolderOpen,
  Loader2,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';
import { api } from '../api/apiClient';

const getDisplayName = (user) =>
  user?.name || user?.displayName || user?.email || 'Unnamed lawyer';

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

const formatDate = (value) => {
  const millis = getTimestampMillis(value);

  if (!millis) {
    return 'No date available';
  }

  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(millis));
};

const getCaseTitle = (caseItem) =>
  caseItem?.client_name || caseItem?.case_title || caseItem?.title || 'Untitled Case';

const getAssignedLawyerLabel = (caseItem, lawyersById) => {
  const lawyer = lawyersById.get(caseItem?.assigned_lawyer_id);

  if (caseItem?.assigned_lawyer_name) return caseItem.assigned_lawyer_name;
  if (caseItem?.assigned_lawyer_id && lawyer) return getDisplayName(lawyer);
  if (caseItem?.assigned_lawyer_email) return caseItem.assigned_lawyer_email;

  return 'Unassigned';
};

export default function LawyerAssignment() {
  const navigate = useNavigate();

  const [cases, setCases] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [selectedLawyerId, setSelectedLawyerId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [assignmentMessage, setAssignmentMessage] = useState({
    type: '',
    text: '',
  });

  const lawyers = useMemo(
    () =>
      users
        .filter((user) => user.role === 'lawyer')
        .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b))),
    [users]
  );

  const lawyersById = useMemo(
    () => new Map(lawyers.map((lawyer) => [lawyer.id, lawyer])),
    [lawyers]
  );

  const selectedCase = useMemo(
    () => cases.find((caseItem) => caseItem.id === selectedCaseId) || null,
    [cases, selectedCaseId]
  );

  const selectedLawyer = useMemo(
    () => lawyers.find((lawyer) => lawyer.id === selectedLawyerId) || null,
    [lawyers, selectedLawyerId]
  );

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [nextCases, nextUsers] = await Promise.all([
        api.getVisibleCases(),
        api.getUsers(),
      ]);

      const sortedCases = [...nextCases]
        .filter((caseItem) => !caseItem.is_deleted)
        .sort(
          (a, b) =>
            getTimestampMillis(b.date_opened || b.created_at) -
            getTimestampMillis(a.date_opened || a.created_at)
        );
      const sortedLawyers = nextUsers
        .filter((user) => user.role === 'lawyer')
        .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));

      setCases(sortedCases);
      setUsers(nextUsers);
      setSelectedCaseId((current) => current || sortedCases[0]?.id || '');
      setSelectedLawyerId((current) => current || sortedLawyers[0]?.id || '');
    } catch (error) {
      console.error('Error loading lawyer assignment data:', error);
      setAssignmentMessage({
        type: 'error',
        text: error.message || 'Failed to load assignment data.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredCases = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return cases;

    return cases.filter((caseItem) => {
      const assignedLawyer = getAssignedLawyerLabel(caseItem, lawyersById);

      return (
        getCaseTitle(caseItem).toLowerCase().includes(term) ||
        (caseItem.caseDisplayId || '').toLowerCase().includes(term) ||
        (caseItem.case_type || '').toLowerCase().includes(term) ||
        (caseItem.offence || '').toLowerCase().includes(term) ||
        assignedLawyer.toLowerCase().includes(term)
      );
    });
  }, [cases, lawyersById, searchTerm]);

  const assignedCaseCount = useMemo(
    () => cases.filter((caseItem) => Boolean(caseItem.assigned_lawyer_id)).length,
    [cases]
  );

  const handleCaseSelect = (caseItem) => {
    setSelectedCaseId(caseItem.id);
    setAssignmentMessage({ type: '', text: '' });

    if (caseItem.assigned_lawyer_id) {
      setSelectedLawyerId(caseItem.assigned_lawyer_id);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedCaseId || !selectedLawyerId) {
      setAssignmentMessage({
        type: 'error',
        text: 'Select a case and lawyer before assigning.',
      });
      return;
    }

    setSaving(true);
    setAssignmentMessage({ type: '', text: '' });

    try {
      await api.assignCaseToLawyer(selectedCaseId, selectedLawyerId);
      await fetchData();
      setSelectedCaseId(selectedCaseId);
      setSelectedLawyerId(selectedLawyerId);
      setAssignmentMessage({
        type: 'success',
        text: `Assigned ${getDisplayName(selectedLawyer)} to ${
          selectedCase ? getCaseTitle(selectedCase) : 'the case'
        }.`,
      });
    } catch (error) {
      console.error('Error assigning lawyer:', error);
      setAssignmentMessage({
        type: 'error',
        text: error.message || 'Failed to assign lawyer.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenSelectedCase = () => {
    if (!selectedCase) return;

    navigate(`/cases/${selectedCase.caseDisplayId || selectedCase.id}`);
  };

  return (
    <div className="lawyer-assignment-page animate-fade-in">
      <div className="lawyer-assignment-hero">
        <div>
          <p className="lawyer-assignment-eyebrow">Admin workspace</p>
          <h1 className="lawyer-assignment-title">Lawyer Assignment</h1>
        </div>

        <div className="lawyer-assignment-stat-row">
          <div className="lawyer-assignment-stat">
            <Users size={18} />
            <span>{lawyers.length} Lawyers</span>
          </div>
          <div className="lawyer-assignment-stat">
            <CheckCircle2 size={18} />
            <span>{assignedCaseCount} Assigned</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="lawyer-assignment-panel lawyer-assignment-feedback">
          <Loader2 size={20} className="manage-users-loader" />
          <span>Loading assignments...</span>
        </div>
      ) : (
        <div className="lawyer-assignment-layout">
          <aside className="lawyer-assignment-side">
            <section className="lawyer-assignment-panel">
              <div className="lawyer-assignment-panel-header">
                <h2 className="lawyer-assignment-panel-title">Assign Case</h2>
              </div>

              <form onSubmit={handleSubmit} className="lawyer-assignment-form">
                <label className="lawyer-assignment-field">
                  <span>Case</span>
                  <select
                    value={selectedCaseId}
                    onChange={(e) => {
                      const caseItem = cases.find((item) => item.id === e.target.value);
                      if (caseItem) handleCaseSelect(caseItem);
                    }}
                    disabled={saving || cases.length === 0}
                    className="lawyer-assignment-input"
                    required
                  >
                    <option value="">
                      {cases.length ? 'Select case' : 'No cases found'}
                    </option>
                    {cases.map((caseItem) => (
                      <option key={caseItem.id} value={caseItem.id}>
                        Case {caseItem.caseDisplayId || '---'} - {getCaseTitle(caseItem)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="lawyer-assignment-field">
                  <span>Lawyer</span>
                  <select
                    value={selectedLawyerId}
                    onChange={(e) => {
                      setSelectedLawyerId(e.target.value);
                      setAssignmentMessage({ type: '', text: '' });
                    }}
                    disabled={saving || lawyers.length === 0}
                    className="lawyer-assignment-input"
                    required
                  >
                    <option value="">
                      {lawyers.length ? 'Select lawyer' : 'No lawyers found'}
                    </option>
                    {lawyers.map((lawyer) => (
                      <option key={lawyer.id} value={lawyer.id}>
                        {getDisplayName(lawyer)}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedCase ? (
                  <div className="lawyer-assignment-current">
                    <UserCheck size={16} />
                    <span>
                      Current lawyer: {getAssignedLawyerLabel(selectedCase, lawyersById)}
                    </span>
                  </div>
                ) : null}

                {assignmentMessage.text ? (
                  <div
                    className={`lawyer-assignment-message lawyer-assignment-message-${assignmentMessage.type}`}
                  >
                    {assignmentMessage.text}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={saving || !selectedCaseId || !selectedLawyerId}
                  className="lawyer-assignment-primary-button"
                >
                  {saving ? (
                    <Loader2 size={16} className="manage-users-loader" />
                  ) : (
                    <UserCheck size={16} />
                  )}
                  {saving ? 'Assigning...' : 'Assign Lawyer'}
                </button>
              </form>
            </section>

            <section className="lawyer-assignment-panel">
              <div className="lawyer-assignment-selected-case">
                <div className="lawyer-assignment-selected-icon">
                  <FolderOpen size={20} />
                </div>

                <div className="lawyer-assignment-selected-copy">
                  <span>Selected Case</span>
                  <strong>
                    {selectedCase ? getCaseTitle(selectedCase) : 'No case selected'}
                  </strong>
                </div>
              </div>

              {selectedCase ? (
                <div className="lawyer-assignment-selected-grid">
                  <div>
                    <span>Case ID</span>
                    <strong>{selectedCase.caseDisplayId || '---'}</strong>
                  </div>
                  <div>
                    <span>Date Opened</span>
                    <strong>{formatDate(selectedCase.date_opened)}</strong>
                  </div>
                  <div>
                    <span>Matter</span>
                    <strong>{selectedCase.offence || 'General matter'}</strong>
                  </div>
                  <div>
                    <span>Lawyer</span>
                    <strong>{getAssignedLawyerLabel(selectedCase, lawyersById)}</strong>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleOpenSelectedCase}
                disabled={!selectedCase}
                className="lawyer-assignment-secondary-button"
              >
                <span>Open Case</span>
                <ArrowUpRight size={16} />
              </button>
            </section>
          </aside>

          <section className="lawyer-assignment-panel lawyer-assignment-list-panel">
            <div className="lawyer-assignment-panel-header lawyer-assignment-list-header">
              <div>
                <h2 className="lawyer-assignment-panel-title">Cases</h2>
                <p className="lawyer-assignment-panel-subtitle">
                  {filteredCases.length}{' '}
                  {filteredCases.length === 1 ? 'case shown' : 'cases shown'}
                </p>
              </div>

              <label className="lawyer-assignment-search">
                <Search size={18} className="lawyer-assignment-search-icon" />
                <input
                  type="text"
                  placeholder="Search cases or lawyers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="lawyer-assignment-search-input"
                />
              </label>
            </div>

            {filteredCases.length === 0 ? (
              <div className="lawyer-assignment-empty">
                <FolderOpen size={22} />
                <span>No cases found.</span>
              </div>
            ) : (
              <div className="lawyer-assignment-case-list">
                {filteredCases.map((caseItem) => {
                  const isSelected = caseItem.id === selectedCaseId;
                  const assignedLabel = getAssignedLawyerLabel(caseItem, lawyersById);

                  return (
                    <button
                      key={caseItem.id}
                      type="button"
                      onClick={() => handleCaseSelect(caseItem)}
                      className={`lawyer-assignment-case-card${
                        isSelected ? ' is-selected' : ''
                      }`}
                    >
                      <div className="lawyer-assignment-case-main">
                        <div>
                          <h3 className="lawyer-assignment-case-title">
                            {getCaseTitle(caseItem)}
                          </h3>
                          <p className="lawyer-assignment-case-meta">
                            Case {caseItem.caseDisplayId || '---'} |{' '}
                            {caseItem.offence || 'General matter'}
                          </p>
                        </div>

                        <span
                          className={`lawyer-assignment-status${
                            caseItem.assigned_lawyer_id ? ' is-assigned' : ''
                          }`}
                        >
                          {caseItem.assigned_lawyer_id ? 'Assigned' : 'Unassigned'}
                        </span>
                      </div>

                      <div className="lawyer-assignment-case-details">
                        <div>
                          <span>Lawyer</span>
                          <strong>{assignedLabel}</strong>
                        </div>
                        <div>
                          <span>Case Type</span>
                          <strong>{caseItem.case_type || 'Not recorded'}</strong>
                        </div>
                        <div>
                          <span>Date Opened</span>
                          <strong>{formatDate(caseItem.date_opened)}</strong>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
