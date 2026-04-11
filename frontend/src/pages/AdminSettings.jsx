import { useEffect, useState } from 'react';
import { Loader2, Settings as SettingsIcon, Save } from 'lucide-react';
import { api } from '../api/apiClient';

export default function AdminSettings() {
  const [formData, setFormData] = useState({
    clinic_name: '',
    allow_registration: true,
    default_case_status: 'open',
    inactivity_threshold_days: 14,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const data = await api.getSettings();

        setFormData({
          clinic_name: data.clinic_name || '',
          allow_registration:
            data.allow_registration !== undefined ? data.allow_registration : true,
          default_case_status: data.default_case_status || 'open',
          inactivity_threshold_days: data.inactivity_threshold_days || 14,
        });
      } catch (error) {
        console.error('Error fetching settings:', error);
        alert('Failed to fetch settings: ' + error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);

      await api.updateSettings({
        clinic_name: formData.clinic_name.trim(),
        allow_registration: formData.allow_registration,
        default_case_status: formData.default_case_status,
        inactivity_threshold_days: Number(formData.inactivity_threshold_days),
      });

      alert('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-slate-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-10 flex items-center justify-center gap-3 text-slate-500">
            <Loader2 size={20} className="animate-spin" />
            Loading settings...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <SettingsIcon size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Admin workspace</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                Settings
              </h1>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSave}
          className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-6"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Clinic Name
            </label>
            <input
              type="text"
              value={formData.clinic_name}
              onChange={(e) =>
                setFormData({ ...formData, clinic_name: e.target.value })
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Default Case Status
            </label>
            <select
              value={formData.default_case_status}
              onChange={(e) =>
                setFormData({ ...formData, default_case_status: e.target.value })
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Case Inactivity Threshold (Days)
            </label>
            <input
              type="number"
              min="1"
              value={formData.inactivity_threshold_days}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  inactivity_threshold_days: e.target.value,
                })
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              Used to flag cases that have not been updated recently.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-slate-900">Allow New User Registration</p>
                <p className="text-sm text-slate-500">
                  Turn this off if admins should manually control onboarding.
                </p>
              </div>

              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.allow_registration}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      allow_registration: e.target.checked,
                    })
                  }
                  className="w-4 h-4"
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-white font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-70"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}