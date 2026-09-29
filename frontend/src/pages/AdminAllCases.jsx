import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, Loader2, RotateCcw, Search, X } from 'lucide-react';
import { api } from '../api/apiClient';
import {
  CASE_STATUS_STEPS,
  getCaseStatusMeta,
  getCaseStatusStepIndex,
} from '../utils/caseStatus';

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

const formatDate = (value, fallback = 'Not scheduled') => {
  const millis = getTimestampMillis(value);

  if (!millis) {
    return fallback;
  }

  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(millis));
};

const formatValue = (value, fallback = 'Not recorded') => {
  if (Array.isArray(value)) {
    const joined = value.filter(Boolean).join(', ');
    return joined || fallback;
  }

  const safeValue = (value || '').toString().trim();
  return safeValue || fallback;
};

const getFirstValue = (item, keys, fallback = 'Not recorded') => {
  for (const key of keys) {
    if (item?.[key]) {
      return formatValue(item[key], fallback);
    }
  }

  return fallback;
};

const getCaseTypeClass = (caseType) => {
  const normalized = (caseType || '').toLowerCase();

  if (normalized === 'criminal') return 'admin-cases-type-criminal';
  if (normalized === 'civil') return 'admin-cases-type-civil';
  if (normalized === 'family') return 'admin-cases-type-family';
  if (normalized === 'property') return 'admin-cases-type-property';

  return 'admin-cases-type-default';
};

export default function AdminAllCases() {
  const location = useLocation();
  const navigate = useNavigate();

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [undoNotice, setUndoNotice] = useState(null);
  const [isRestoringCase, setIsRestoringCase] = useState(false);

  const fetchCases = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getVisibleCases();

      const sorted = [...data]
        .filter((caseItem) => !caseItem.is_deleted)
        .sort((a, b) => {
          const dateA = a.date_opened?.seconds || 0;
          const dateB = b.date_opened?.seconds || 0;
          return dateB - dateA;
        });

      setCases(sorted);
    } catch (error) {
      console.error('Error fetching all cases:', error);
      alert('Failed to fetch cases: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  useEffect(() => {
    if (!location.state?.deletedCaseId) return;

    setUndoNotice({
      caseId: location.state.deletedCaseId,
      name: location.state.deletedCaseName || 'Case',
    });
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const handleRestoreCase = async () => {
    if (!undoNotice?.caseId) return;

    setIsRestoringCase(true);
    try {
      await api.restoreCase(undoNotice.caseId);
      await fetchCases();
      setUndoNotice(null);
    } catch (error) {
      console.error('Error restoring case:', error);
      alert('Failed to restore case: ' + error.message);
    } finally {
      setIsRestoringCase(false);
    }
  };

  const filteredCases = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return cases;

    return cases.filter((c) => {
      const statusMeta = getCaseStatusMeta(c.status);

      return (
        (c.client_name || '').toLowerCase().includes(term) ||
        (c.case_type || '').toLowerCase().includes(term) ||
        (c.offence || '').toLowerCase().includes(term) ||
        (c.caseDisplayId || '').toLowerCase().includes(term) ||
        (c.status || '').toLowerCase().includes(term) ||
        statusMeta.label.toLowerCase().includes(term) ||
        statusMeta.displayLabel.toLowerCase().includes(term)
      );
    });
  }, [cases, searchTerm]);

  return (
    <div className="admin-cases-page animate-fade-in">
      <div className="admin-cases-hero">
        <h1 className="admin-cases-title">Cases</h1>

        <label className="admin-cases-search" aria-label="Search cases">
          <Search size={18} className="admin-cases-search-icon" />
          <input
            type="text"
            placeholder="Search by client, case type, offence, or status..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="admin-cases-search-input"
          />
        </label>
      </div>

      {undoNotice ? (
        <div className="admin-cases-undo-banner" role="status">
          <div className="admin-cases-undo-copy">
            <span className="admin-cases-undo-title">
              {undoNotice.name} was deleted.
            </span>
            <span className="admin-cases-undo-text">
              Restore it now to return it to the active case list.
            </span>
          </div>

          <div className="admin-cases-undo-actions">
            <button
              type="button"
              onClick={handleRestoreCase}
              disabled={isRestoringCase}
              className="admin-cases-undo-button"
            >
              {isRestoringCase ? (
                <Loader2 size={16} className="admin-cases-loader" />
              ) : (
                <RotateCcw size={16} />
              )}
              {isRestoringCase ? 'Restoring...' : 'Undo'}
            </button>
            <button
              type="button"
              onClick={() => setUndoNotice(null)}
              disabled={isRestoringCase}
              className="admin-cases-undo-dismiss"
              aria-label="Dismiss undo message"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="admin-cases-feedback">
          <Loader2 size={20} className="admin-cases-loader" />
          <span>Loading cases...</span>
        </div>
      ) : filteredCases.length === 0 ? (
        <div className="admin-cases-empty">
          <p>No cases found</p>
        </div>
      ) : (
        <div className="admin-cases-list">
          {filteredCases.map((c) => {
            const activeStage = getCaseStatusStepIndex(c.status);
            const caseTypeLabel = formatLabel(c.case_type, 'Case');
            const displayCaseId = c.caseDisplayId || '---';
            const routeCaseId = c.caseDisplayId || c.id;
            const court = getFirstValue(c, ['court', 'court_name', 'courtName']);
            const assigned = getFirstValue(c, [
              'assigned_lawyer_name',
              'assigned_lawyer_email',
              'assigned_to_name',
              'assigned_to',
              'assigned_student_name',
              'assigned_student',
            ], 'Unassigned');
            const relatives = getFirstValue(c, [
              'relatives',
              'relative_names',
              'next_of_kin',
              'family_contacts',
            ]);
            const nextHearing =
              c.next_hearing_date ||
              c.next_hearing ||
              c.hearing_date ||
              c.court_date ||
              null;

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(`/cases/${routeCaseId}`)}
                className="admin-cases-card"
              >
                <div className="admin-cases-card-top">
                  <div className="admin-cases-card-copy">
                    <h2 className="admin-cases-card-title">
                      {c.client_name || 'Untitled Client'}
                    </h2>
                    <p className="admin-cases-card-subtitle">
                      Case {displayCaseId} {'\u00B7'} {c.offence || 'General matter'}
                    </p>
                  </div>

                  <span
                    className={`admin-cases-type-pill ${getCaseTypeClass(
                      c.case_type
                    )}`}
                  >
                    {caseTypeLabel}
                  </span>
                </div>

                <div className="admin-cases-detail-grid">
                  <div className="admin-cases-detail-item">
                    <span className="admin-cases-detail-label">Court</span>
                    <span className="admin-cases-detail-value">{court}</span>
                  </div>

                  <div className="admin-cases-detail-item">
                    <span className="admin-cases-detail-label">Assigned</span>
                    <span className="admin-cases-detail-value">{assigned}</span>
                  </div>

                  <div className="admin-cases-detail-item">
                    <span className="admin-cases-detail-label">Relatives</span>
                    <span className="admin-cases-detail-value">{relatives}</span>
                  </div>

                  <div className="admin-cases-detail-item">
                    <span className="admin-cases-detail-label">Next Hearing</span>
                    <span className="admin-cases-detail-value admin-cases-hearing-value">
                      {formatDate(nextHearing)}
                    </span>
                  </div>
                </div>

                <div className="admin-cases-stage-row">
                  {CASE_STATUS_STEPS.map((stage, index) => {
                    const stageNumber = index + 1;
                    const isComplete = stageNumber < activeStage;
                    const isCurrent = stageNumber === activeStage;
                    const isLast = index === CASE_STATUS_STEPS.length - 1;

                    return (
                      <div key={stage.value} className="admin-cases-stage">
                        <div className="admin-cases-stage-track">
                          <span
                            className={`admin-cases-stage-circle${
                              isComplete ? ' is-complete' : ''
                            }${isCurrent ? ' is-current' : ''}`}
                          >
                            {isComplete ? <Check size={16} /> : stageNumber}
                          </span>
                          {!isLast ? (
                            <span
                              className={`admin-cases-stage-line${
                                isComplete ? ' is-complete' : ''
                              }`}
                            />
                          ) : null}
                        </div>

                        <span
                          className={`admin-cases-stage-label${
                            isCurrent ? ' is-current' : ''
                          }`}
                        >
                          {stage.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
