import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '../api/apiClient';

const caseTypeOptions = [
  { value: 'criminal', label: 'Criminal' },
  { value: 'civil', label: 'Civil' },
  { value: 'family', label: 'Family' },
  { value: 'property', label: 'Property' },
];

export default function NewCase() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    client_name: '',
    case_type: 'criminal',
    offence: '',
    description: '',
  });

  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setIsCreating(true);
      const result = await api.createCase(formData);

      alert(result.message || 'Case created successfully');

      if (result.caseId) {
        navigate(`/cases/${result.caseId}`);
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
                setFormData({ ...formData, case_type: e.target.value })
              }
              className="new-case-select"
              required
            >
              {caseTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="new-case-field">
            <span className="new-case-field-label">Client Name</span>
            <input
              type="text"
              value={formData.client_name}
              onChange={(e) =>
                setFormData({ ...formData, client_name: e.target.value })
              }
              className="new-case-input"
              placeholder="e.g. John Mukasa"
              required
            />
          </label>

          <label className="new-case-field">
            <span className="new-case-field-label">Offence / Matter</span>
            <input
              type="text"
              value={formData.offence}
              onChange={(e) =>
                setFormData({ ...formData, offence: e.target.value })
              }
              className="new-case-input"
              placeholder="e.g. Bail application, custody dispute, land disagreement"
              required
            />
          </label>

          <label className="new-case-field">
            <span className="new-case-field-label">Description</span>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
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
