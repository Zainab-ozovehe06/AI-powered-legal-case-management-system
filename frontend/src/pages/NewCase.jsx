
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '../api/apiClient';

const caseTypeOptions = [
  {
    value: 'Pretrial Detainee Representation',
    label: 'Pretrial Detainee Representation',
  },
  {
    value: 'Bail Applications',
    label: 'Bail Applications',
  },
  {
    value: 'Minor Criminal Defense',
    label: 'Minor Criminal Defense',
  },
  {
    value: 'Alternative Dispute Resolution',
    label: 'Alternative Dispute Resolution',
  },
  {
    value: 'Restorative Justice Programs',
    label: 'Restorative Justice Programs',
  },
  {
    value: 'Business Formation & Structuring',
    label: 'Business Formation & Structuring',
  },
  {
    value: 'Commercial Contract Drafting',
    label: 'Commercial Contract Drafting',
  },
];

export default function NewCase() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    client_name: '',
    case_type: 'Pretrial Detainee Representation',
    offence: '',
    description: '',
  });

  const [otherCaseType, setOtherCaseType] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const selectedCaseType =
      formData.case_type === 'other'
        ? otherCaseType.trim()
        : formData.case_type;

    if (!selectedCaseType) {
      alert('Please select or specify a case type.');
      return;
    }

    try {
      setIsCreating(true);

      const payload = {
        ...formData,
        case_type: selectedCaseType,
      };

      const result = await api.createCase(payload);

      alert(result.message || 'Case created successfully');

      if (result.caseId) {
        let routeCaseId = result.caseId;

        try {
          const visibleCases = await api.getVisibleCases();

          const createdCase = visibleCases.find(
            (caseItem) => caseItem.id === result.caseId
          );

          routeCaseId = createdCase?.caseDisplayId || routeCaseId;
        } catch (resolveError) {
          console.error('Failed to resolve display case ID:', resolveError);
        }

        navigate(`/cases/${routeCaseId}`);
      } else {
        navigate('/cases');
      }
    } catch (error) {
      console.error('Error creating case:', error);
      alert('Failed to create case: ' + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="new-case-page animate-fade-in">
      <form
        onSubmit={handleSubmit}
        className="new-case-panel new-case-form-panel new-case-simple-form"
      >
        <div className="new-case-field-stack">
          <label className="new-case-field">
            <span className="new-case-field-label">Case Type</span>

            <select
              value={formData.case_type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  case_type: e.target.value,
                })
              }
              className="new-case-select"
              required
            >
              {caseTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}

              <option value="other">Other (please specify)</option>
            </select>
          </label>

          {formData.case_type === 'other' && (
            <label className="new-case-field">
              <span className="new-case-field-label">
                Specify Case Type
              </span>

              <input
                type="text"
                value={otherCaseType}
                onChange={(e) => setOtherCaseType(e.target.value)}
                className="new-case-input"
                placeholder="Enter the type of case"
                required
                maxLength={150}
              />
            </label>
          )}

          <label className="new-case-field">
            <span className="new-case-field-label">Client Name</span>

            <input
              type="text"
              value={formData.client_name}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  client_name: e.target.value,
                })
              }
              className="new-case-input"
              placeholder="e.g. Sumaya Ahmed"
              required
            />
          </label>

          <label className="new-case-field">
            <span className="new-case-field-label">
              Offence / Matter
            </span>

            <input
              type="text"
              value={formData.offence}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  offence: e.target.value,
                })
              }
              className="new-case-input"
              placeholder="Describe the specific offence or matter"
              required
            />
          </label>

          <label className="new-case-field">
            <span className="new-case-field-label">Description</span>

            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  description: e.target.value,
                })
              }
              rows={6}
              className="new-case-textarea"
              placeholder="Add any notes or background details for this matter."
            />
          </label>
        </div>

        <div className="new-case-action-bar new-case-simple-actions">
          <button
            type="submit"
            disabled={isCreating}
            className="new-case-primary-button"
          >
            {isCreating ? (
              <Loader2 size={18} className="student-loader-icon" />
            ) : null}

            {isCreating ? 'Creating...' : 'Create Case'}
          </button>
        </div>
      </form>
    </div>
  );
}
