import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Loader2, Plus } from 'lucide-react';
import { api } from '../../api/apiClient';
import EventCard from './EventCard';
import {
  getTodayDateString,
  isWithinNextDays,
  sortEventsByDate,
} from './eventUtils';

export default function UpcomingEvents({
  events,
  loading = false,
  error = '',
  caseId,
  limit = 5,
  title = 'Upcoming Events',
  subtitle = 'Deadlines and meetings that need attention.',
  emptyTitle = 'No upcoming events',
  emptyCopy = 'Scheduled events will appear here.',
  dueSoonOnly = false,
  status = 'upcoming',
  showCalendarLink = true,
  onCreate,
  onEdit,
  refreshKey = 0,
}) {
  const [internalEvents, setInternalEvents] = useState([]);
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalError, setInternalError] = useState('');
  const shouldFetch = events === undefined;

  useEffect(() => {
    if (!shouldFetch) return;

    let isCurrent = true;

    const fetchEvents = async () => {
      setInternalLoading(true);
      setInternalError('');

      try {
        const data = caseId
          ? await api.getCaseEvents(caseId, { status })
          : await api.getEvents({
              status,
              date_from: getTodayDateString(),
            });

        if (isCurrent) {
          setInternalEvents(data);
        }
      } catch (fetchError) {
        console.error('Error loading upcoming events:', fetchError);
        if (isCurrent) {
          setInternalError(fetchError.message || 'Failed to load upcoming events');
        }
      } finally {
        if (isCurrent) {
          setInternalLoading(false);
        }
      }
    };

    fetchEvents();

    return () => {
      isCurrent = false;
    };
  }, [caseId, refreshKey, shouldFetch, status]);

  const sourceEvents = shouldFetch ? internalEvents : events;
  const isLoading = loading || internalLoading;
  const displayError = error || internalError;

  const visibleEvents = useMemo(() => {
    const filteredEvents = (sourceEvents || []).filter((event) => {
      if (status !== 'all' && event.status !== status) return false;
      if (!dueSoonOnly) return true;
      return isWithinNextDays(event, 7);
    });

    return sortEventsByDate(filteredEvents).slice(0, limit);
  }, [dueSoonOnly, limit, sourceEvents, status]);

  return (
    <section className="upcoming-events-panel">
      <div className="upcoming-events-header">
        <div>
          <div className="upcoming-events-title-row">
            <CalendarDays size={18} />
            <h2 className="upcoming-events-title">{title}</h2>
          </div>
          {subtitle ? <p className="upcoming-events-subtitle">{subtitle}</p> : null}
        </div>

        <div className="upcoming-events-actions">
          {onCreate ? (
            <button
              type="button"
              onClick={onCreate}
              className="event-secondary-button upcoming-events-create"
            >
              <Plus size={16} />
              New
            </button>
          ) : null}
          {showCalendarLink ? (
            <Link to="/calendar" className="student-panel-link">
              Calendar
            </Link>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="event-loading-state">
          <Loader2 size={18} className="student-loader-icon" />
          <span>Loading events...</span>
        </div>
      ) : displayError ? (
        <div className="event-error-state">{displayError}</div>
      ) : visibleEvents.length === 0 ? (
        <div className="student-empty-state">
          <p className="student-empty-title">{emptyTitle}</p>
          <p className="student-empty-copy">{emptyCopy}</p>
        </div>
      ) : (
        <div className="upcoming-events-list">
          {visibleEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              compact
              showCase={!caseId}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </section>
  );
}
