import { useEffect, useState } from 'react';
import {
  Building2,
  Clock3,
  FolderOpen,
  Loader2,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
} from 'lucide-react';
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
      <div className="admin-settings-page animate-fade-in">
        <div className="admin-settings-feedback">
          <Loader2 size={20} className="admin-settings-loader" />
          <span>Loading settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-settings-page animate-fade-in">
      <section className="admin-settings-hero">
        <div className="admin-settings-hero-copy">
          <span className="admin-settings-eyebrow">Admin workspace</span>
          <h1 className="admin-settings-title">Settings</h1>
          <p className="admin-settings-subtitle">
            Configure the clinic defaults used across the system.
          </p>
        </div>

        <div className="admin-settings-hero-icon" aria-hidden="true">
          <SettingsIcon size={22} />
        </div>
      </section>

      <form onSubmit={handleSave} className="admin-settings-layout">
        <section className="admin-settings-panel admin-settings-form-panel">
          <div className="admin-settings-panel-header">
            <div>
              <h2 className="admin-settings-panel-title">System Preferences</h2>
              <p className="admin-settings-panel-subtitle">
                Keep the core clinic settings consistent for every workspace.
              </p>
            </div>
          </div>

          <div className="admin-settings-field-stack">
            <label className="admin-settings-field">
              <span className="admin-settings-field-icon">
                <Building2 size={18} />
              </span>
              <span className="admin-settings-field-copy">
                <span className="admin-settings-field-label">Clinic Name</span>
                <input
                  type="text"
                  value={formData.clinic_name}
                  onChange={(e) =>
                    setFormData({ ...formData, clinic_name: e.target.value })
                  }
                  className="admin-settings-input"
                />
              </span>
            </label>

            <label className="admin-settings-field">
              <span className="admin-settings-field-icon">
                <FolderOpen size={18} />
              </span>
              <span className="admin-settings-field-copy">
                <span className="admin-settings-field-label">
                  Default Case Status
                </span>
                <select
                  value={formData.default_case_status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      default_case_status: e.target.value,
                    })
                  }
                  className="admin-settings-select"
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
              </span>
            </label>

            <label className="admin-settings-field">
              <span className="admin-settings-field-icon">
                <Clock3 size={18} />
              </span>
              <span className="admin-settings-field-copy">
                <span className="admin-settings-field-label">
                  Case Inactivity Threshold
                </span>
                <span className="admin-settings-number-row">
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
                    className="admin-settings-number-input"
                  />
                  <span className="admin-settings-number-unit">days</span>
                </span>
                <span className="admin-settings-field-help">
                  Used to flag cases that have not been updated recently.
                </span>
              </span>
            </label>

            <div className="admin-settings-toggle-card">
              <div className="admin-settings-toggle-copy">
                <span className="admin-settings-field-icon">
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <p className="admin-settings-toggle-title">
                    Allow New User Registration
                  </p>
                  <p className="admin-settings-toggle-help">
                    Turn this off if admins should manually control onboarding.
                  </p>
                </div>
              </div>

              <label className="admin-settings-switch">
                <input
                  type="checkbox"
                  checked={formData.allow_registration}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      allow_registration: e.target.checked,
                    })
                  }
                  className="admin-settings-switch-input"
                />
                <span className="admin-settings-switch-track">
                  <span className="admin-settings-switch-thumb" />
                </span>
              </label>
            </div>
          </div>

          <div className="admin-settings-actions">
            <button
              type="submit"
              disabled={saving}
              className="admin-settings-save-button"
            >
              {saving ? (
                <Loader2 size={18} className="admin-settings-loader" />
              ) : (
                <Save size={18} />
              )}
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </section>

        <aside className="admin-settings-panel admin-settings-summary-panel">
          <h2 className="admin-settings-panel-title">Current Defaults</h2>
          <p className="admin-settings-panel-subtitle">
            A quick preview of what will be applied after saving.
          </p>

          <div className="admin-settings-summary-list">
            <div className="admin-settings-summary-item">
              <span className="admin-settings-summary-label">Clinic</span>
              <span className="admin-settings-summary-value">
                {formData.clinic_name || 'Not set'}
              </span>
            </div>
            <div className="admin-settings-summary-item">
              <span className="admin-settings-summary-label">Default Status</span>
              <span className="admin-settings-status-pill">
                {formData.default_case_status}
              </span>
            </div>
            <div className="admin-settings-summary-item">
              <span className="admin-settings-summary-label">Inactivity Flag</span>
              <span className="admin-settings-summary-value">
                {formData.inactivity_threshold_days || 0} days
              </span>
            </div>
            <div className="admin-settings-summary-item">
              <span className="admin-settings-summary-label">Registration</span>
              <span
                className={`admin-settings-registration-pill${
                  formData.allow_registration ? ' is-enabled' : ''
                }`}
              >
                {formData.allow_registration ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
