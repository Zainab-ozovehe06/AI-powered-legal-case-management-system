import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Save, Trash2, X } from 'lucide-react';
import {
  EVENT_TYPE_OPTIONS,
  LEGACY_EVENT_TYPE_OPTIONS,
  REMINDER_OPTIONS,
  STATUS_OPTIONS,
  getEventTypeMeta,
  getTodayDateString,
} from './eventUtils';

const buildInitialForm = ({ event, defaultDate, lockedCaseId, lockedGroupId }) => ({
  title: event?.title || '',
  event_type: event?.event_type || EVENT_TYPE_OPTIONS[0].value,
  case_id: lockedCaseId || event?.case_id || '',
  category: lockedCaseId || event?.case_id ? 'case' : 'general',
  group_id: lockedGroupId || event?.group_id || '',
  visibility: event?.visibility || (lockedGroupId || event?.group_id ? 'unit' : 'private'),
  date: event?.date || defaultDate || getTodayDateString(),
  end_date: event?.end_date || event?.date || defaultDate || getTodayDateString(),
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
  groups = [],
  lockedGroupId,
  userRole,
  readOnly = false,
  isSubmitting = false,
  isDeleting = false,
  onClose,
  onSubmit,
  onDelete,
}) {
  const [form, setForm] = useState(() =>
    buildInitialForm({ event, defaultDate, lockedCaseId, lockedGroupId })
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
    if (readOnly) return;

    onSubmit({
      ...form,
      case_id: form.category === 'case' ? form.case_id : null,
      visibility: form.category === 'case' ? 'case' : form.visibility,
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
              {event ? (readOnly ? 'Event Details' : 'Edit Event') : 'Create Event'}
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
            <span className="event-form-label">Activity category</span>
            <select className="event-form-input" value={form.category} disabled={readOnly || Boolean(lockedCaseId)} onChange={(event) => setForm({ ...form, category: event.target.value, case_id: '', visibility: form.group_id ? 'unit' : 'private' })}>
              <option value="general">Clinic / unit event</option><option value="case">Case-related reminder</option>
            </select>
          </label>
          <label className="event-form-field event-form-field-wide">
            <span className="event-form-label">Title</span>
            <input
              type="text"
              value={form.title}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="event-form-input"
              required
            />
          </label>

          <label className="event-form-field">
            <span className="event-form-label">Event Type</span>
            <select
              value={form.event_type}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, event_type: e.target.value })}
              className="event-form-input"
              required
            >
              {event?.event_type &&
              ![...EVENT_TYPE_OPTIONS, ...LEGACY_EVENT_TYPE_OPTIONS].some((option) => option.value === event.event_type) ? (
                <option value={event.event_type}>
                  {getEventTypeMeta(event.event_type).label}
                </option>
              ) : null}
              {[...EVENT_TYPE_OPTIONS, ...LEGACY_EVENT_TYPE_OPTIONS].map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {form.category === 'case' && <label className="event-form-field">
            <span className="event-form-label">Related Case</span>
            <select
              value={form.case_id}
              onChange={(e) => setForm({ ...form, case_id: e.target.value })}
              className="event-form-input"
              required
              disabled={readOnly || Boolean(lockedCaseId)}
            >
              <option value="">Select case</option>
              {caseOptions.map((caseItem) => (
                <option key={caseItem.id} value={caseItem.id}>
                  {caseItem.caseDisplayId ? `Case ${caseItem.caseDisplayId} - ` : ''}
                  {caseItem.client_name || caseItem.case_title || 'Untitled Case'}
                  {caseItem.offence ? `, ${caseItem.offence}` : ''}
                </option>
              ))}
            </select>
          </label>}

          {form.category === 'general' && <>
            <label className="event-form-field"><span className="event-form-label">Audience</span>
              <select className="event-form-input" value={form.visibility} disabled={readOnly || Boolean(lockedGroupId)} onChange={(event) => setForm({ ...form, visibility: event.target.value, group_id: event.target.value === 'unit' ? form.group_id : '' })}>
                <option value="private">Private / invited users</option><option value="unit">Unit members</option>
                {(userRole === 'admin' || event?.visibility === 'clinic') && <option value="clinic">Entire clinic</option>}
              </select>
            </label>
            {form.visibility === 'unit' && <label className="event-form-field"><span className="event-form-label">Unit</span>
              <select required className="event-form-input" value={form.group_id} disabled={readOnly || Boolean(lockedGroupId)} onChange={(event) => setForm({ ...form, group_id: event.target.value })}>
                <option value="">Select unit</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                {form.group_id && !groups.some((group) => group.id === form.group_id) && <option value={form.group_id}>Assigned unit</option>}
              </select>
            </label>}
          </>}

          <label className="event-form-field">
            <span className="event-form-label">Date</span>
            <input
              type="date"
              value={form.date}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, date: e.target.value, end_date: form.end_date === form.date || form.end_date < e.target.value ? e.target.value : form.end_date })}
              className="event-form-input"
              required
            />
          </label>

          <label className="event-form-field"><span className="event-form-label">End date</span><input type="date" className="event-form-input" required disabled={readOnly} min={form.date} value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} /></label>

          <div className="event-form-row">
            <label className="event-form-field">
              <span className="event-form-label">Start Time</span>
              <input
                type="time"
                value={form.start_time}
                disabled={readOnly}
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
                disabled={readOnly}
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
              disabled={readOnly}
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
              disabled={readOnly}
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
            <span className="event-form-label">Location / meeting link</span>
            <input
              type="text"
              value={form.location}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="event-form-input"
            />
          </label>
          {event?.organizer && <p className="event-form-field-wide">Organized by {event.organizer}</p>}

          <label className="event-form-field event-form-field-wide">
            <span className="event-form-label">Description</span>
            <textarea
              value={form.description}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              className="event-form-textarea"
            />
          </label>

          <div className="event-modal-actions">
            {event && onDelete && !readOnly ? (
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
              {!readOnly ? (
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
              ) : null}
            </div>
          </div>
        </form>
      </section>
    </div>,
    document.body
  );
}
