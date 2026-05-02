import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Loader2, Search } from 'lucide-react';
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

const getCaseTypeClass = (caseType) => {
  const normalized = (caseType || '').toLowerCase();

  if (normalized === 'criminal') {
    return 'student-case-type-criminal';
  }

  if (normalized === 'civil') {
    return 'student-case-type-civil';
  }

  if (normalized === 'family') {
    return 'student-case-type-family';
  }

  if (normalized === 'property') {
    return 'student-case-type-property';
  }

  return 'student-case-type-default';
};

const getStatusClass = (status) => {
  const normalized = (status || 'open').toLowerCase();

  if (normalized === 'closed') {
    return 'student-case-status-closed';
  }

  if (normalized === 'urgent') {
    return 'student-case-status-urgent';
  }

  return 'student-case-status-open';
};

const getLifecycleStepIndex = (status) => {
  const normalized = (status || 'open').toLowerCase();

  if (normalized === 'closed') {
    return 4;
  }

  if (
    normalized.includes('court') ||
    normalized.includes('hearing') ||
    normalized.includes('trial')
  ) {
    return 3;
  }

  if (normalized.includes('intake') || normalized.includes('new')) {
    return 1;
  }

  return 2;
};

const lifecycleLabels = ['Intake', 'Active Review', 'Current Status', 'Outcome'];

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

    return cases.filter((caseItem) => {
      return (
        (caseItem.client_name || '').toLowerCase().includes(term) ||
        (caseItem.case_type || '').toLowerCase().includes(term) ||
        (caseItem.offence || '').toLowerCase().includes(term) ||
        (caseItem.status || '').toLowerCase().includes(term)
      );
    });
  }, [cases, searchTerm]);

  return (
    <div className="student-cases-page animate-fade-in">
      <div className="student-cases-hero">
        <div>
          <h1 className="student-cases-title">Cases</h1>
          <p className="student-cases-subtitle">
            Review assigned matters and open any case to continue your work.
          </p>
        </div>
      </div>

      <section className="student-cases-toolbar">
        <label className="student-cases-search">
          <Search size={18} className="student-cases-search-icon" />
          <input
            type="text"
            placeholder="Search by client, case type, offence, or status..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="student-cases-search-input"
          />
        </label>

        <div className="student-cases-summary">
          <span className="student-cases-summary-value">{filteredCases.length}</span>
          <span className="student-cases-summary-label">
            {filteredCases.length === 1 ? 'case visible' : 'cases visible'}
          </span>
        </div>
      </section>

      {loading ? (
        <div className="student-cases-panel student-cases-feedback">
          <Loader2 size={20} className="student-loader-icon" />
          <span>Loading cases...</span>
        </div>
      ) : filteredCases.length === 0 ? (
        <div className="student-cases-panel student-cases-empty">
          <p className="student-empty-title">No cases yet</p>
          <p className="student-empty-copy">
            Create or get assigned to a case to see it here.
          </p>
        </div>
      ) : (
        <div className="student-cases-list">
          {filteredCases.map((caseItem) => {
            const lifecycleIndex = getLifecycleStepIndex(caseItem.status);

            return (
              <button
                key={caseItem.id}
                type="button"
                onClick={() => navigate(`/cases/${caseItem.id}`)}
                className="student-cases-card"
              >
                <div className="student-cases-card-header">
                  <div className="student-cases-card-heading">
                    <h2 className="student-cases-card-title">
                      {caseItem.client_name || 'Untitled Client'}
                    </h2>
                    <p className="student-cases-card-meta">
                      {caseItem.id} {'\u00B7'} {caseItem.offence || 'General matter'}
                    </p>
                  </div>

                  <div className="student-cases-card-badges">
                    <span
                      className={`student-case-type-pill ${getCaseTypeClass(
                        caseItem.case_type
                      )}`}
                    >
                      {formatLabel(caseItem.case_type, 'Case')}
                    </span>
                    <span
                      className={`student-case-status-tag ${getStatusClass(
                        caseItem.status
                      )}`}
                    >
                      {formatLabel(caseItem.status, 'Open')}
                    </span>
                  </div>
                </div>

                <div className="student-cases-card-grid">
                  <div className="student-cases-detail">
                    <span className="student-cases-detail-label">Offence / Matter</span>
                    <p className="student-cases-detail-value">
                      {caseItem.offence || 'General matter'}
                    </p>
                  </div>

                  <div className="student-cases-detail">
                    <span className="student-cases-detail-label">Date Opened</span>
                    <p className="student-cases-detail-value">
                      {formatDate(caseItem.date_opened)}
                    </p>
                  </div>

                  <div className="student-cases-detail">
                    <span className="student-cases-detail-label">Case ID</span>
                    <p className="student-cases-detail-value">{caseItem.id}</p>
                  </div>

                  <div className="student-cases-detail">
                    <span className="student-cases-detail-label">Current Status</span>
                    <p className="student-cases-detail-value">
                      {formatLabel(caseItem.status, 'Open')}
                    </p>
                  </div>
                </div>

                <div className="student-cases-lifecycle">
                  {lifecycleLabels.map((label, index) => {
                    const stepNumber = index + 1;
                    const isComplete = stepNumber < lifecycleIndex;
                    const isCurrent = stepNumber === lifecycleIndex;

                    return (
                      <div
                        key={`${caseItem.id}-${label}`}
                        className="student-cases-step"
                      >
                        <div className="student-cases-step-track">
                          <span
                            className={`student-cases-step-circle${
                              isComplete ? ' is-complete' : ''
                            }${isCurrent ? ' is-current' : ''}`}
                          >
                            {stepNumber}
                          </span>

                          {stepNumber !== lifecycleLabels.length ? (
                            <span
                              className={`student-cases-step-line${
                                stepNumber < lifecycleIndex ? ' is-complete' : ''
                              }`}
                            />
                          ) : null}
                        </div>

                        <div className="student-cases-step-copy">
                          <span
                            className={`student-cases-step-label${
                              isCurrent ? ' is-current' : ''
                            }`}
                          >
                            {label}
                          </span>
                          {isCurrent && stepNumber === 3 ? (
                            <span className="student-cases-step-caption">
                              {formatLabel(caseItem.status, 'Open')}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="student-cases-card-footer">
                  <span className="student-cases-card-action">Open case</span>
                  <ArrowUpRight size={18} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
