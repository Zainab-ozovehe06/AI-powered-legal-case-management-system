export const CASE_DISPLAY_ID_FALLBACK = '---';
export const CASE_DISPLAY_ID_WIDTH = 3;

const getTimestampMillis = (value) => {
  if (!value) return 0;

  if (typeof value.toMillis === 'function') {
    return value.toMillis();
  }

  if (typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number') {
    return value < 10000000000 ? value * 1000 : value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (typeof value._seconds === 'number') {
    return value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1000000);
  }

  if (typeof value.seconds === 'number') {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  }

  return 0;
};

const getCaseOrderTime = (caseItem) =>
  getTimestampMillis(caseItem?.date_opened) ||
  getTimestampMillis(caseItem?.created_at) ||
  getTimestampMillis(caseItem?.createdAt);

export const formatCaseDisplayId = (position) => {
  const number = Number(position);

  if (!Number.isFinite(number) || number < 1) {
    return CASE_DISPLAY_ID_FALLBACK;
  }

  return String(Math.trunc(number)).padStart(CASE_DISPLAY_ID_WIDTH, '0');
};

export const normalizeCaseDisplayId = (value) => {
  const safeValue = (value || '').toString().trim();

  if (!safeValue) {
    return '';
  }

  return /^\d+$/.test(safeValue)
    ? safeValue.padStart(CASE_DISPLAY_ID_WIDTH, '0')
    : safeValue;
};

export const getCasesInDisplayIdOrder = (cases = []) =>
  [...cases].sort((a, b) => {
    const timeA = getCaseOrderTime(a);
    const timeB = getCaseOrderTime(b);

    if (timeA && timeB && timeA !== timeB) {
      return timeA - timeB;
    }

    if (timeA && !timeB) return -1;
    if (!timeA && timeB) return 1;

    return (a.id || '').localeCompare(b.id || '');
  });

export const buildCaseDisplayIdMap = (cases = []) =>
  new Map(
    getCasesInDisplayIdOrder(cases).map((caseItem, index) => [
      caseItem.id,
      formatCaseDisplayId(index + 1),
    ])
  );

export const withCaseDisplayIds = (cases = []) => {
  const displayIdMap = buildCaseDisplayIdMap(cases);

  return cases.map((caseItem) => ({
    ...caseItem,
    caseDisplayId: displayIdMap.get(caseItem.id) || CASE_DISPLAY_ID_FALLBACK,
  }));
};

export const findCaseByDisplayOrFirebaseId = (cases = [], caseIdentifier) => {
  const safeIdentifier = (caseIdentifier || '').toString().trim();
  const normalizedDisplayId = normalizeCaseDisplayId(safeIdentifier);

  return cases.find(
    (caseItem) =>
      caseItem.id === safeIdentifier ||
      caseItem.caseDisplayId === safeIdentifier ||
      caseItem.caseDisplayId === normalizedDisplayId
  );
};
