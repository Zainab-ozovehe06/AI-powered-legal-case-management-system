import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { api } from '../../api/apiClient';
import EventCard from './EventCard';
import EventModal from './EventModal';
import {
  EVENT_TYPE_OPTIONS,
  STATUS_OPTIONS,
  buildCalendarCells,
  formatEventTimeRange,
  getDateKey,
  getEventTypeMeta,
  getTodayDateString,
  sortEventsByDate,
} from './eventUtils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getCaseTitle = (caseItem) => {
  if (!caseItem) return '';

  const parts = [
    caseItem.client_name || caseItem.case_title || 'Untitled Case',
    caseItem.offence,
  ].filter(Boolean);

  return parts.join(', ');
};

const getEventQuery = (filters) => {
  const query = {};

  if (filters.event_type !== 'all') query.event_type = filters.event_type;
  if (filters.case_id !== 'all') query.case_id = filters.case_id;
  if (filters.status !== 'all') query.status = filters.status;
  if (filters.date) query.date = filters.date;

  return query;
};

export default function Calendar() {
  const [cases, setCases] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    event_type: 'all',
    case_id: 'all',
    status: 'upcoming',
    date: '',
  });
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [viewMode, setViewMode] = useState('month');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchCalendarData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [visibleCases, visibleEvents] = await Promise.all([
        api.getVisibleCases(),
        api.getEvents(getEventQuery(filters)),
      ]);

      setCases(visibleCases);
      setEvents(sortEventsByDate(visibleEvents));
    } catch (fetchError) {
      console.error('Error loading calendar:', fetchError);
      setError(fetchError.message || 'Failed to load calendar events');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  const cells = useMemo(() => buildCalendarCells(currentMonth), [currentMonth]);

  const eventsByDate = useMemo(() => {
    const grouped = new Map();

    events.forEach((event) => {
      if (!grouped.has(event.date)) {
        grouped.set(event.date, []);
      }

      grouped.get(event.date).push(event);
    });

    return grouped;
  }, [events]);

  const selectedMonthEvents = useMemo(() => {
    const monthKey = getDateKey(currentMonth).slice(0, 7);
    return events.filter((event) => (event.date || '').startsWith(monthKey));
  }, [currentMonth, events]);

  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(currentMonth);

  const updateMonth = (offset) => {
    setCurrentMonth(
      (month) => new Date(month.getFullYear(), month.getMonth() + offset, 1)
    );
  };

  const openCreateModal = (date = '') => {
    setSelectedEvent(null);
    setSelectedDate(date || filters.date || getTodayDateString());
    setIsModalOpen(true);
  };

  const openEditModal = (event) => {
    setSelectedEvent(event);
    setSelectedDate(event.date || '');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedEvent(null);
    setSelectedDate('');
  };

  const handleSubmit = async (payload) => {
    const selectedCase = cases.find((caseItem) => caseItem.id === payload.case_id);

    setIsSubmitting(true);

    try {
      if (selectedEvent) {
        await api.updateEvent(selectedEvent.id, {
          ...payload,
          case_title: getCaseTitle(selectedCase),
        });
      } else {
        await api.createEvent({
          ...payload,
          case_title: getCaseTitle(selectedCase),
        });
      }

      closeModal();
      await fetchCalendarData();
    } catch (submitError) {
      console.error('Error saving event:', submitError);
      alert('Failed to save event: ' + submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (event) => {
    const confirmed = window.confirm('Cancel this scheduled event?');

    if (!confirmed) return;

    setIsDeleting(true);

    try {
      await api.deleteEvent(event.id);
      closeModal();
      await fetchCalendarData();
    } catch (deleteError) {
      console.error('Error cancelling event:', deleteError);
      alert('Failed to cancel event: ' + deleteError.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const resetFilters = () => {
    setFilters({
      event_type: 'all',
      case_id: 'all',
      status: 'upcoming',
      date: '',
    });
  };

  return (
    <div className="calendar-page animate-fade-in">
      <header className="calendar-hero">
        <div>
          <p className="calendar-eyebrow">Case Scheduling</p>
          <h1 className="calendar-title">Calendar</h1>
          <p className="calendar-subtitle">
            Court dates, interviews, deadlines, follow-ups, and case reviews.
          </p>
        </div>

        <button
          type="button"
          onClick={() => openCreateModal()}
          className="event-primary-button calendar-add-button"
        >
          <Plus size={18} />
          Add Event
        </button>
      </header>

      <section className="calendar-toolbar">
        <div className="calendar-toolbar-title">
          <Filter size={18} />
          <span>Filters</span>
        </div>

        <div className="calendar-filter-grid">
          <label className="calendar-filter-field">
            <span>Type</span>
            <select
              value={filters.event_type}
              onChange={(e) => setFilters({ ...filters, event_type: e.target.value })}
            >
              <option value="all">All types</option>
              {EVENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="calendar-filter-field">
            <span>Case</span>
            <select
              value={filters.case_id}
              onChange={(e) => setFilters({ ...filters, case_id: e.target.value })}
            >
              <option value="all">All cases</option>
              {cases.map((caseItem) => (
                <option key={caseItem.id} value={caseItem.id}>
                  {caseItem.caseDisplayId ? `Case ${caseItem.caseDisplayId} - ` : ''}
                  {caseItem.client_name || 'Untitled Case'}
                </option>
              ))}
            </select>
          </label>

          <label className="calendar-filter-field">
            <span>Status</span>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="calendar-filter-field">
            <span>Date</span>
            <input
              type="date"
              value={filters.date}
              onChange={(e) => setFilters({ ...filters, date: e.target.value })}
            />
          </label>
        </div>

        <button type="button" onClick={resetFilters} className="event-secondary-button">
          <RotateCcw size={16} />
          Reset
        </button>
      </section>

      <section className="calendar-shell">
        <div className="calendar-panel">
          <div className="calendar-panel-header">
            <div className="calendar-month-heading">
              <CalendarDays size={20} />
              <h2>{monthLabel}</h2>
            </div>

            <div className="calendar-header-actions">
              <div className="calendar-view-toggle" aria-label="Calendar view">
                <button
                  type="button"
                  onClick={() => setViewMode('month')}
                  className={viewMode === 'month' ? 'active' : ''}
                >
                  Month
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={viewMode === 'list' ? 'active' : ''}
                >
                  List
                </button>
              </div>
              <div className="calendar-month-controls">
                <button
                  type="button"
                  onClick={() => updateMonth(-1)}
                  className="event-icon-button"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                  }}
                  className="event-secondary-button calendar-today-button"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => updateMonth(1)}
                  className="event-icon-button"
                  aria-label="Next month"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="calendar-state">
              <Loader2 size={22} className="student-loader-icon" />
              <span>Loading calendar...</span>
            </div>
          ) : error ? (
            <div className="event-error-state">{error}</div>
          ) : viewMode === 'month' ? (
            <div className="calendar-grid" role="grid">
              {WEEKDAYS.map((day) => (
                <div key={day} className="calendar-weekday">
                  {day}
                </div>
              ))}

              {cells.map((cell) => {
                const dayEvents = eventsByDate.get(cell.dateKey) || [];

                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    onClick={() => openCreateModal(cell.dateKey)}
                    className={`calendar-day${
                      cell.isCurrentMonth ? '' : ' calendar-day-muted'
                    }${cell.isToday ? ' calendar-day-today' : ''}`}
                  >
                    <span className="calendar-day-number">{cell.day}</span>
                    <div className="calendar-day-events">
                      {dayEvents.slice(0, 3).map((event) => {
                        const typeMeta = getEventTypeMeta(event.event_type);

                        return (
                          <span
                            key={event.id}
                            role="button"
                            tabIndex={0}
                            onClick={(clickEvent) => {
                              clickEvent.stopPropagation();
                              openEditModal(event);
                            }}
                            onKeyDown={(keyEvent) => {
                              if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                                keyEvent.preventDefault();
                                keyEvent.stopPropagation();
                                openEditModal(event);
                              }
                            }}
                            className={`calendar-event-chip ${typeMeta.className}`}
                            title={`${formatEventTimeRange(event)} - ${event.title}`}
                          >
                            <strong>{event.start_time}</strong>
                            <span>{event.title}</span>
                          </span>
                        );
                      })}
                      {dayEvents.length > 3 ? (
                        <span className="calendar-more-events">
                          +{dayEvents.length - 3} more
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="calendar-list-view">
              {events.length === 0 ? (
                <div className="student-empty-state">
                  <p className="student-empty-title">No events found</p>
                  <p className="student-empty-copy">
                    Change the filters or add a new scheduled event.
                  </p>
                </div>
              ) : (
                events.map((event) => (
                  <EventCard key={event.id} event={event} onEdit={openEditModal} />
                ))
              )}
            </div>
          )}
        </div>

        <aside className="calendar-side-panel">
          <div className="calendar-side-header">
            <h2>Month Agenda</h2>
            <span>{selectedMonthEvents.length}</span>
          </div>

          {selectedMonthEvents.length === 0 ? (
            <div className="student-empty-state">
              <p className="student-empty-title">No events this month</p>
              <p className="student-empty-copy">
                Scheduled case events for {monthLabel} will appear here.
              </p>
            </div>
          ) : (
            <div className="calendar-agenda-list">
              {selectedMonthEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  compact
                  onEdit={openEditModal}
                />
              ))}
            </div>
          )}
        </aside>
      </section>

      {isModalOpen ? (
        <EventModal
          isOpen={isModalOpen}
          event={selectedEvent}
          cases={cases}
          defaultDate={selectedDate}
          isSubmitting={isSubmitting}
          isDeleting={isDeleting}
          onClose={closeModal}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
        />
      ) : null}
    </div>
  );
}
