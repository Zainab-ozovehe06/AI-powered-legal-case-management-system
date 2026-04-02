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
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-700"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-bold text-slate-800 mb-1">Create New Case</h2>
        <p className="text-sm text-slate-500 mb-6">Fill in the case details below.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Client Name</label>
            <input
              type="text"
              value={formData.client_name}
              onChange={(e) =>
                setFormData({ ...formData, client_name: e.target.value })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Case Type</label>
            <select
              value={formData.case_type}
              onChange={(e) =>
                setFormData({ ...formData, case_type: e.target.value })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="criminal">Criminal</option>
              <option value="civil">Civil</option>
              <option value="family">Family</option>
              <option value="property">Property</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Offence / Matter</label>
            <input
              type="text"
              value={formData.offence}
              onChange={(e) =>
                setFormData({ ...formData, offence: e.target.value })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
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