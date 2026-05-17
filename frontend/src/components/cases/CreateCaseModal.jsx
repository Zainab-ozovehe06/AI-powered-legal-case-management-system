import { useState } from 'react';
import { X } from 'lucide-react';

export function CreateCaseModal({ isOpen, onClose, onCreate, isCreating }) {
  const [formData, setFormData] = useState({
    client_name: '',
    case_type: 'criminal',
    offence: '',
    description: '',
  });

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onCreate(formData);
    setFormData({
      client_name: '',
      case_type: 'criminal',
      offence: '',
      description: '',
    });
  };

  return (
    <div
      className="casemode"
      onClick={onClose}
    >
      <div
        className="caseemode"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="casemodebtn"
        >
          <X size={20} />
        </button>

        <h2 className="display">Create New Case</h2>
        <p className="details">Fill in the case details below.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Client Name</label>
            <input
              type="text"
              value={formData.client_name}
              onChange={(e) =>
                setFormData({ ...formData, client_name: e.target.value })
              }
              className="req"
              required
            />
          </div>

          <div>
            <label className="blocktext">Case Type</label>
            <select
              value={formData.case_type}
              onChange={(e) =>
                setFormData({ ...formData, case_type: e.target.value })
              }
              className="modalborder"
              required
            >
              <option value="criminal">Criminal</option>
              <option value="civil">Civil</option>
              <option value="family">Family</option>
              <option value="property">Property</option>
            </select>
          </div>

          <div>
            <label className="blkoffence ">Offence</label>
            <input
              type="text"
              value={formData.offence}
              onChange={(e) =>
                setFormData({ ...formData, offence: e.target.value })
              }
              className="blkreq"
              required
            />
          </div>

          <div>
            <label className="blkdesc">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={4}
              className="blkrow"
            />
          </div>

          <div className="flexjustify">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}