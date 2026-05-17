export const EVENT_TYPE_OPTIONS = [
  { value: 'court_date', label: 'Court Date' },
  { value: 'client_interview', label: 'Client Interview' },
  { value: 'clinic_meeting', label: 'Clinic Meeting' },
  { value: 'document_deadline', label: 'Document Deadline' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'case_review', label: 'Case Review' },
  { value: 'other', label: 'Other' },
];

export const STATUS_OPTIONS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const REMINDER_OPTIONS = [
  { value: 0, label: 'At start time' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
  { value: 2880, label: '2 days before' },
  { value: 10080, label: '1 week before' },
];

const pad = (value) => String(value).padStart(2, '0');

export const getTodayDateString = () => {
  const today = new Date();
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
};

export const getDateKey = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const parseEventDate = (dateString, timeString = '00:00') => {
  if (!dateString) return null;

  const date = new Date(`${dateString}T${timeString || '00:00'}:00`);

  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatEventDate = (dateString, options = {}) => {
  const date = parseEventDate(dateString);

  if (!date) return 'No date';

  return new Intl.DateTimeFormat('en-GB', {
    weekday: options.weekday || 'short',
    month: 'short',
    day: 'numeric',
    year: options.year || undefined,
  }).format(date);
};

export const formatTime = (timeString) => {
  if (!timeString) return '';

  const [hours, minutes] = timeString.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes || 0, 0, 0);

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

export const formatEventTimeRange = (event) => {
  const start = formatTime(event?.start_time);
  const end = formatTime(event?.end_time);

  if (start && end) return `${start} - ${end}`;
  return start || end || 'Time not set';
};

export const getReminderLabel = (minutes) => {
  const value = Number(minutes);

  if (!Number.isFinite(value) || value < 0) return 'No reminder';
  if (value === 0) return 'At start time';
  if (value < 60) return `${value} minute${value === 1 ? '' : 's'} before`;
  if (value < 1440) {
    const hours = value / 60;
    return `${hours} hour${hours === 1 ? '' : 's'} before`;
  }

  const days = value / 1440;
  return `${days} day${days === 1 ? '' : 's'} before`;
};

export const getEventTypeMeta = (eventType) => {
  const option =
    EVENT_TYPE_OPTIONS.find((item) => item.value === eventType) ||
    EVENT_TYPE_OPTIONS[EVENT_TYPE_OPTIONS.length - 1];

  return {
    ...option,
    className: `event-type-${option.value}`,
  };
};

export const getEventStatusMeta = (status) => {
  const option =
    STATUS_OPTIONS.find((item) => item.value === status) || STATUS_OPTIONS[0];

  return {
    ...option,
    className: `event-status-${option.value}`,
  };
};

export const getEventStartDate = (event) =>
  parseEventDate(event?.date, event?.start_time || '00:00');

export const sortEventsByDate = (events = []) =>
  [...events].sort((a, b) => {
    const dateA = `${a.date || ''} ${a.start_time || ''}`;
    const dateB = `${b.date || ''} ${b.start_time || ''}`;
    return dateA.localeCompare(dateB);
  });

export const isWithinNextDays = (event, days = 7) => {
  const eventDate = getEventStartDate(event);

  if (!eventDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = new Date(today);
  end.setDate(today.getDate() + days);
  end.setHours(23, 59, 59, 999);

  return eventDate >= today && eventDate <= end;
};

export const getDueLabel = (event) => {
  if (event?.status === 'completed') return 'Completed';
  if (event?.status === 'cancelled') return 'Cancelled';

  const eventDate = getEventStartDate(event);

  if (!eventDate) return '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const eventDay = new Date(eventDate);
  eventDay.setHours(0, 0, 0, 0);

  const dayDiff = Math.round((eventDay - today) / 86400000);

  if (dayDiff < 0) return 'Past due';
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Tomorrow';
  if (dayDiff <= 7) return `In ${dayDiff} days`;

  return '';
};

export const buildCalendarCells = (monthDate) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startDate = new Date(firstOfMonth);
  startDate.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return {
      date,
      dateKey: getDateKey(date),
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
      isToday: getDateKey(date) === getTodayDateString(),
    };
  });
};
