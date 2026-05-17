import {
  Bell,
  Briefcase,
  CalendarDays,
  Clock3,
  MapPin,
  Pencil,
} from 'lucide-react';
import {
  formatEventDate,
  formatEventTimeRange,
  getDueLabel,
  getEventStatusMeta,
  getEventTypeMeta,
  getReminderLabel,
} from './eventUtils';

export default function EventCard({
  event,
  compact = false,
  showCase = true,
  onEdit,
}) {
  const typeMeta = getEventTypeMeta(event?.event_type);
  const statusMeta = getEventStatusMeta(event?.status);
  const dueLabel = getDueLabel(event);

  return (
    <article className={`event-card${compact ? ' event-card-compact' : ''}`}>
      <div className="event-card-main">
        <div className="event-card-topline">
          <span className={`event-type-pill ${typeMeta.className}`}>
            {typeMeta.label}
          </span>
          <span className={`event-status-pill ${statusMeta.className}`}>
            {statusMeta.label}
          </span>
          {dueLabel ? <span className="event-due-pill">{dueLabel}</span> : null}
        </div>

        <div className="event-card-title-row">
          <h3 className="event-card-title">{event?.title || 'Untitled event'}</h3>
          {onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(event)}
              className="event-icon-button"
              aria-label="Edit event"
            >
              <Pencil size={15} />
            </button>
          ) : null}
        </div>

        <div className="event-card-meta-grid">
          <span className="event-card-meta">
            <CalendarDays size={15} />
            {formatEventDate(event?.date, { year: 'numeric' })}
          </span>
          <span className="event-card-meta">
            <Clock3 size={15} />
            {formatEventTimeRange(event)}
          </span>
          {event?.location ? (
            <span className="event-card-meta">
              <MapPin size={15} />
              {event.location}
            </span>
          ) : null}
          <span className="event-card-meta">
            <Bell size={15} />
            {getReminderLabel(event?.reminder_minutes_before)}
          </span>
        </div>

        {showCase && event?.case_title ? (
          <div className="event-card-case">
            <Briefcase size={15} />
            <span>{event.case_title}</span>
          </div>
        ) : null}

        {!compact && event?.description ? (
          <p className="event-card-description">{event.description}</p>
        ) : null}
      </div>
    </article>
  );
}
