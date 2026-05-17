export const CASE_STATUS_STEPS = [
  { value: 'open', label: 'OPEN', displayLabel: 'Open' },
  { value: 'incourt', label: 'INCOURT', displayLabel: 'In Court' },
  { value: 'pending', label: 'PENDING', displayLabel: 'Pending' },
  { value: 'closed', label: 'CLOSED', displayLabel: 'Closed' },
];

const STATUS_ALIASES = {
  open: 'open',
  opened: 'open',
  new: 'open',
  intake: 'open',
  incourt: 'incourt',
  court: 'incourt',
  hearing: 'incourt',
  trial: 'incourt',
  pending: 'pending',
  active: 'pending',
  review: 'pending',
  investigation: 'pending',
  assigned: 'pending',
  closed: 'closed',
  close: 'closed',
  resolved: 'closed',
  outcome: 'closed',
};

export const normalizeCaseStatus = (status) => {
  const token = (status || 'open')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

  return STATUS_ALIASES[token] || 'open';
};

export const getCaseStatusMeta = (status) => {
  const normalized = normalizeCaseStatus(status);

  return (
    CASE_STATUS_STEPS.find((step) => step.value === normalized) ||
    CASE_STATUS_STEPS[0]
  );
};

export const getCaseStatusStepIndex = (status) => {
  const normalized = normalizeCaseStatus(status);
  const index = CASE_STATUS_STEPS.findIndex((step) => step.value === normalized);

  return index === -1 ? 1 : index + 1;
};
