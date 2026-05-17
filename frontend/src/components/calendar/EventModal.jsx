import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Save, Trash2, X } from 'lucide-react';
import {
  EVENT_TYPE_OPTIONS,
  REMINDER_OPTIONS,
  STATUS_OPTIONS,
  getTodayDateString,
} from './eventUtils';

const buildInitialForm = ({ event, defaultDate, lockedCaseId }) => ({
  title: event?.title || '',
  event_type: event?.event_type || 'court_date',
  case_id: lockedCaseId || event?.case_id || '',
  date: event?.date || defaultDate || getTodayDateString(),
  start_time: event?.start_time || '09:00',
  end_time: event?.end_time || '10:00',
  location: event?.location || '',
  description: event?.description || '',
  reminder_minutes_before: event?.reminder_minutes_before ?? 1440,
  status: event?.status || 'upcoming',
});

export default function EventModal({
  isOpen,
  event,
  cases = [],
  defaultDate,
  lockedCaseId,
  lockedCaseTitle,
  isSubmitting = false,
  isDeleting = false,
  onClose,
  onSubmit,
  onDelete,
}) {
  const [form, setForm] = useState(() =>
    buildInitialForm({ event, defaultDate, lockedCaseId })
  );

  const caseOptions = useMemo(() => {
    if (!lockedCaseId) return cases;

    const hasLockedCase = cases.some((caseItem) => caseItem.id === lockedCaseId);

    if (hasLockedCase) return cases;

    return [
      {
        id: lockedCaseId,
        caseDisplayId: '',
        client_name: lockedCaseTitle || 'Current case',
        offence: '',
      },
      ...cases,
    ];
  }, [cases, lockedCaseId, lockedCaseTitle]);

  if (!isOpen) return null;

  const handleSubmit = (submitEvent) => {
    submitEvent.preventDefault();

    onSubmit({
      ...form,
      reminder_minutes_before: Number(form.reminder_minutes_before),
    });
  };

  return createPortal(
    <div className="event-modal-backdrop">
      <section className="event-modal" role="dialog" aria-modal="true">
        <div className="event-modal-header">
          <div>
            <p className="event-modal-eyebrow">Schedule</p>
            <h2 className="event-modal-title">
              {event ? 'Edit Event' : 'Create Event'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="event-icon-button"
            aria-label="Close event form"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="event-modal-form">
          <label className="event-form-field event-form-field-wide">
            <span className="event-form-label">Title</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="event-form-input"
              required
            />
          </label>

          <label className="event-form-field">
            <span className="event-form-label">Event Type</span>
            <select
              value={form.event_type}
              onChange={(e) => setForm({ ...form, event_type: e.target.value })}
              className="event-form-input"
              required
            >
              {EVENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="event-form-field">
            <span className="event-form-label">Related Case</span>
            <select
              value={form.case_id}
              onChange={(e) => setForm({ ...form, case_id: e.target.value })}
              className="event-form-input"
              required
              disabled={Boolean(lockedCaseId)}
            >
              <option value="">Select a case</option>
              {caseOptions.map((caseItem) => (
                <option key={caseItem.id} value={caseItem.id}>
                  {caseItem.caseDisplayId ? `Case ${caseItem.caseDisplayId} - ` : ''}
                  {caseItem.client_name || caseItem.case_title || 'Untitled Case'}
                  {caseItem.offence ? `, ${caseItem.offence}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="event-form-field">
            <span className="event-form-label">Date</span>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="event-form-input"
              required
            />
          </label>

          <div className="event-form-row">
            <label className="event-form-field">
              <span className="event-form-label">Start Time</span>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                className="event-form-input"
                required
              />
            </label>

            <label className="event-form-field">
              <span className="event-form-label">End Time</span>
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                className="event-form-input"
                required
              />
            </label>
          </div>

          <label className="event-form-field">
            <span className="event-form-label">Reminder</span>
            <select
              value={form.reminder_minutes_before}
              onChange={(e) =>
                setForm({ ...form, reminder_minutes_before: e.target.value })
              }
              className="event-form-input"
            >
              {REMINDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="event-form-field">
            <span className="event-form-label">Status</span>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="event-form-input"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="event-form-field event-form-field-wide">
            <span className="event-form-label">Location</span>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="event-form-input"
            />
          </label>

          <label className="event-form-field event-form-field-wide">
            <span className="event-form-label">Description</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              className="event-form-textarea"
            />
          </label>

          <div className="event-modal-actions">
            {event && onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(event)}
                disabled={isSubmitting || isDeleting}
                className="event-danger-button"
              >
                {isDeleting ? (
                  <Loader2 size={16} className="student-loader-icon" />
                ) : (
                  <Trash2 size={16} />
                )}
                {isDeleting ? 'Cancelling...' : 'Cancel Event'}
              </button>
            ) : null}

            <div className="event-modal-action-group">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting || isDeleting}
                className="event-secondary-button"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isDeleting}
                className="event-primary-button"
              >
                {isSubmitting ? (
                  <Loader2 size={16} className="student-loader-icon" />
                ) : (
                  <Save size={16} />
                )}
                {isSubmitting ? 'Saving...' : 'Save Event'}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>,
    document.body
  );
}
