import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilePlus2, Loader2 } from 'lucide-react';
import { api } from '../api/apiClient';

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
    <div className="w-full min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <FilePlus2 size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Student workspace</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                New Case
              </h1>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Client Name
            </label>
            <input
              type="text"
              value={formData.client_name}
              onChange={(e) =>
                setFormData({ ...formData, client_name: e.target.value })
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Case Type
            </label>
            <select
              value={formData.case_type}
              onChange={(e) =>
                setFormData({ ...formData, case_type: e.target.value })
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              required
            >
              <option value="criminal">Criminal</option>
              <option value="civil">Civil</option>
              <option value="family">Family</option>
              <option value="property">Property</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Offence / Matter
            </label>
            <input
              type="text"
              value={formData.offence}
              onChange={(e) =>
                setFormData({ ...formData, offence: e.target.value })
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={5}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isCreating}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-white font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-70"
            >
              {isCreating ? <Loader2 size={18} className="animate-spin" /> : <FilePlus2 size={18} />}
              {isCreating ? 'Creating...' : 'Create Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}