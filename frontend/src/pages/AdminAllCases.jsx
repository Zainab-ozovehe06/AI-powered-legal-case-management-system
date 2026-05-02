import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, Search } from 'lucide-react';
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

const getStageNumber = (caseItem) => {
  const stageValue =
    caseItem.progress_stage ||
    caseItem.current_stage ||
    caseItem.stage ||
    caseItem.case_stage ||
    caseItem.status ||
    'intake';

  const numericStage = Number(stageValue);

  if (Number.isInteger(numericStage) && numericStage >= 1 && numericStage <= 4) {
    return numericStage;
  }

  const normalized = stageValue.toString().toLowerCase().replace(/[_-]+/g, ' ');

  if (normalized.includes('closed') || normalized.includes('outcome')) return 4;
  if (
    normalized.includes('court') ||
    normalized.includes('hearing') ||
    normalized.includes('trial')
  ) {
    return 3;
  }
  if (
    normalized.includes('investigation') ||
    normalized.includes('assigned') ||
    normalized.includes('urgent')
  ) {
    return 2;
  }

  return 1;
};

const caseStages = [
  { number: 1, label: 'Intake' },
  { number: 2, label: 'Investigation' },
  { number: 3, label: 'In Court' },
  { number: 4, label: 'Outcome' },
];

export default function AdminAllCases() {
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
        console.error('Error fetching all cases:', error);
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
            const activeStage = getStageNumber(c);
            const caseTypeLabel = formatLabel(c.case_type, 'Case');
            const court = getFirstValue(c, ['court', 'court_name', 'courtName']);
            const assigned = getFirstValue(c, [
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
                onClick={() => navigate(`/cases/${c.id}`)}
                className="admin-cases-card"
              >
                <div className="admin-cases-card-top">
                  <div className="admin-cases-card-copy">
                    <h2 className="admin-cases-card-title">
                      {c.client_name || 'Untitled Client'}
                    </h2>
                    <p className="admin-cases-card-subtitle">
                      {c.id} {'\u00B7'} {c.offence || 'General matter'}
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
                  {caseStages.map((stage, index) => {
                    const isComplete = stage.number < activeStage;
                    const isCurrent = stage.number === activeStage;
                    const isLast = index === caseStages.length - 1;

                    return (
                      <div key={stage.number} className="admin-cases-stage">
                        <div className="admin-cases-stage-track">
                          <span
                            className={`admin-cases-stage-circle${
                              isComplete ? ' is-complete' : ''
                            }${isCurrent ? ' is-current' : ''}`}
                          >
                            {isComplete ? <Check size={16} /> : stage.number}
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
