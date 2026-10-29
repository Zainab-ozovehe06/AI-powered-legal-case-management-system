import express from 'express';
import { admin, db } from '../config/firebase.js';
import { requireAuth } from '../middleware/authenticate.js';
import {
  ASSIGNMENT_TYPE,
  canStudentAccessCase,
  getDirectCaseIdsForUser,
  getVisibleCaseIdsForStudent,
  normalizeText,
} from '../utils/groupCollaboration.js';
import { loadWorkspace, validDate, workspaceError } from '../utils/unitWorkspace.js';

const router = express.Router();

const EVENT_TYPES = new Set([
  // New event types
  'summit',
  'conference',
  'street_lawyering',
  'reform_pre_trial_detention',
  'community_outreach',
  'workshop',
  'training',
  'orientation',
  'competitions',
  'virtual_events',
  'seminars_webinars',
  'law_clinic_meetings',
  'unit_meetings',

  // Legacy types retained for existing events
  'court_date',
  'client_interview',
  'clinic_meeting',
  'document_deadline',
  'follow_up',
  'case_review',
  'other',
]);

const EVENT_STATUSES = new Set(['upcoming', 'completed', 'cancelled']);
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeOptionalText = (value) => {
  const text = normalizeText(value);
  return text || null;
};

const normalizeStringArray = (value) => {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(value.map((item) => normalizeText(item)).filter(Boolean)),
  ];
};

const isCaseDeleted = (caseData) => caseData?.is_deleted === true;

const getActorId = (req) => req.currentUser?.uid || req.currentUser?.user_id;

const getCaseTitle = (caseData, fallback) => {
  const explicitTitle = normalizeText(
    caseData?.case_title || caseData?.title || caseData?.name || fallback
  );

  if (explicitTitle) return explicitTitle;

  const clientName = normalizeText(caseData?.client_name);
  const offence = normalizeText(caseData?.offence);

  if (clientName && offence) return `${clientName} - ${offence}`;
  if (clientName) return clientName;
  if (offence) return offence;

  return null;
};

const getAssignedUserIdsForCase = async (caseId) => {
  const snapshot = await db
    .collection('case_assignments')
    .where('case_id', '==', caseId)
    .get();

  const assignments = snapshot.docs.map((doc) => doc.data());

  const directUserIds = assignments
    .filter(
      (assignment) =>
        assignment.assigned_to_type === undefined ||
        assignment.assigned_to_type === ASSIGNMENT_TYPE.USER
    )
    .map((assignment) => normalizeText(assignment.user_id))
    .filter(Boolean);

  const groupIds = assignments
    .filter(
      (assignment) => assignment.assigned_to_type === ASSIGNMENT_TYPE.GROUP
    )
    .map((assignment) => normalizeText(assignment.group_id))
    .filter(Boolean);

  if (!groupIds.length) {
    return [...new Set(directUserIds)];
  }

  const memberSnapshots = await Promise.all(
    groupIds.map((groupId) =>
      db.collection('group_members').where('group_id', '==', groupId).get()
    )
  );

  const groupUserIds = memberSnapshots.flatMap((memberSnap) =>
    memberSnap.docs
      .map((doc) => normalizeText(doc.data()?.user_id))
      .filter(Boolean)
  );

  return [...new Set([...directUserIds, ...groupUserIds])];
};

const loadCaseForEventAccess = async (caseId, req) => {
  const safeCaseId = normalizeText(caseId);
  const currentUser = req.currentUser;
  const actorId = getActorId(req);

  if (!safeCaseId) {
    const error = new Error('case_id is required');
    error.statusCode = 400;
    throw error;
  }

  if (!currentUser || !actorId) {
    const error = new Error('Authenticated user ID missing');
    error.statusCode = 401;
    throw error;
  }

  const caseDoc = await db.collection('cases').doc(safeCaseId).get();

  if (
    !caseDoc.exists ||
    (isCaseDeleted(caseDoc.data()) && currentUser.role !== 'admin')
  ) {
    const error = new Error('Case not found');
    error.statusCode = 404;
    throw error;
  }

  const assignedUserIds = await getAssignedUserIdsForCase(safeCaseId);

  const studentHasAccess =
    currentUser.role === 'law_student' &&
    (await canStudentAccessCase(actorId, safeCaseId, caseDoc.data()));

  if (currentUser.role === 'law_student' && !studentHasAccess) {
    const error = new Error('You are not assigned to this case');
    error.statusCode = 403;
    throw error;
  }

  const lawyerHasAccess =
    currentUser.role === 'lawyer' && assignedUserIds.includes(actorId);

  if (currentUser.role === 'lawyer' && !lawyerHasAccess) {
    const error = new Error('You are not assigned to this case');
    error.statusCode = 403;
    throw error;
  }

  if (
    currentUser.role !== 'admin' &&
    currentUser.role !== 'law_student' &&
    currentUser.role !== 'lawyer'
  ) {
    const error = new Error('Access denied');
    error.statusCode = 403;
    throw error;
  }

  return {
    id: caseDoc.id,
    data: caseDoc.data(),
    assignedUserIds,
  };
};

const canViewGeneralEvent = async (eventData, req) => {
  if (req.currentUser?.role === 'admin') return true;
  if (!['law_student', 'lawyer', 'supervisor'].includes(req.currentUser?.role)) return false;
  if (req.currentUser.role === 'supervisor' && !eventData.visibility) return false;

  if (eventData.visibility === 'unit' || eventData.group_id) {
    if (!eventData.group_id) return false;
    try { await loadWorkspace(eventData.group_id, req.currentUser); return true; }
    catch (error) { if ([403, 404].includes(error.statusCode)) return false; throw error; }
  }
  if (eventData.visibility === 'clinic') return true;

  const actorId = getActorId(req);
  return Boolean(
    actorId &&
      (eventData.created_by === actorId ||
        normalizeStringArray(eventData.assigned_users).includes(actorId))
  );
};

const assertGeneralEventManagement = (eventData, req) => {
  if (
    !eventData.case_id &&
    req.currentUser?.role !== 'admin' &&
    eventData.created_by !== getActorId(req) &&
    !(req.currentUser?.role === 'supervisor' && eventData.group_id)
  ) {
    const error = new Error('Only the organizer or an authorised unit supervisor can change this event');
    error.statusCode = 403;
    throw error;
  }
};

const assertVisibleEvent = async (eventData, req) => {
  if (!eventData?.case_id) {
    if (await canViewGeneralEvent(eventData, req)) return null;

    const error = new Error('You are not allowed to access this event');
    error.statusCode = 403;
    throw error;
  }

  return loadCaseForEventAccess(eventData.case_id, req);
};

const validateEventPayload = async (body, req, existingEvent = null) => {
  const currentUser = req.currentUser;
  const actorId = getActorId(req);

  // Keep the existing case link when case_id is omitted.
  // An explicit empty/null case_id means a general calendar event.
  const rawCaseId =
    body.case_id !== undefined ? body.case_id : existingEvent?.case_id;

  const caseId = normalizeText(rawCaseId ?? '');
  const loadedCase = caseId
    ? await loadCaseForEventAccess(caseId, req)
    : null;

  // Preserve the existing rule that lawyers cannot create or modify events.
  if (currentUser.role === 'lawyer') {
    const error = new Error(
      'Lawyers can view scheduled events but cannot change them'
    );
    error.statusCode = 403;
    throw error;
  }

  // Preserve the existing creation roles for general events.
  if (!loadedCase && !['admin', 'law_student', 'supervisor'].includes(currentUser.role)) {
    const error = new Error('Access denied');
    error.statusCode = 403;
    throw error;
  }

  const title = normalizeText(body.title ?? existingEvent?.title);

  const eventType = normalizeText(
    body.event_type ?? existingEvent?.event_type ?? 'other'
  );

  const date = normalizeText(body.date ?? existingEvent?.date);
  const startTime = normalizeText(
    body.start_time ?? existingEvent?.start_time
  );
  const endTime = normalizeText(body.end_time ?? existingEvent?.end_time);
  const endDate = normalizeText(body.end_date ?? (body.date && existingEvent?.end_date === existingEvent?.date ? date : existingEvent?.end_date) ?? date);
  const groupId = normalizeText(body.group_id !== undefined ? body.group_id : existingEvent?.group_id) || null;
  const visibility = loadedCase ? 'case' : normalizeText(body.visibility ?? (existingEvent?.visibility === 'case' ? null : existingEvent?.visibility) ?? (groupId ? 'unit' : 'private'));
  if (groupId) {
    await loadWorkspace(groupId, currentUser, { write: true });
    if (loadedCase) {
      const assignments = await db.collection('case_assignments').where('group_id', '==', groupId).get();
      if (!assignments.docs.some((doc) => doc.data().case_id === loadedCase.id && doc.data().assigned_to_type === ASSIGNMENT_TYPE.GROUP)) {
        throw workspaceError(400, 'The selected case is not assigned to this unit');
      }
    } else if (visibility !== 'unit') throw workspaceError(400, 'Unit events must use unit visibility');
  } else if (visibility === 'unit') throw workspaceError(400, 'Select a unit for a unit event');
  if (!['case', 'private', 'clinic', 'unit'].includes(visibility) || (!loadedCase && visibility === 'case')) throw workspaceError(400, 'Invalid event visibility');
  if (visibility === 'clinic' && currentUser.role !== 'admin') throw workspaceError(403, 'Only administrators can publish clinic-wide events');
  if (body.category === 'case' && !loadedCase) throw workspaceError(400, 'Select a case for a case reminder');

  const status = normalizeText(
    body.status ?? existingEvent?.status ?? 'upcoming'
  );

  const reminderMinutes =
    body.reminder_minutes_before ??
    existingEvent?.reminder_minutes_before ??
    1440;

  if (!title) {
    const error = new Error('title is required');
    error.statusCode = 400;
    throw error;
  }

  if (!EVENT_TYPES.has(eventType)) {
    const error = new Error('Invalid event_type');
    error.statusCode = 400;
    throw error;
  }

  if (!DATE_PATTERN.test(date) || !validDate(date) || !validDate(endDate)) {
    const error = new Error('date must be in YYYY-MM-DD format');
    error.statusCode = 400;
    throw error;
  }

  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    const error = new Error(
      'start_time and end_time must be in HH:mm format'
    );
    error.statusCode = 400;
    throw error;
  }

  if (`${endDate}T${endTime}` <= `${date}T${startTime}`) {
    const error = new Error('end_time must be after start_time');
    error.statusCode = 400;
    throw error;
  }

  if (!EVENT_STATUSES.has(status)) {
    const error = new Error('Invalid status');
    error.statusCode = 400;
    throw error;
  }

  const parsedReminder = Number(reminderMinutes);

  if (!Number.isInteger(parsedReminder) || parsedReminder < 0) {
    const error = new Error(
      'reminder_minutes_before must be a non-negative integer'
    );
    error.statusCode = 400;
    throw error;
  }

  const assignedUsers =
    body.assigned_users !== undefined
      ? normalizeStringArray(body.assigned_users)
      : normalizeStringArray(existingEvent?.assigned_users);

  if (currentUser.role === 'law_student' && loadedCase) {
    const invalidUsers = assignedUsers.filter(
      (userId) => !loadedCase.assignedUserIds.includes(userId)
    );

    if (invalidUsers.length) {
      const error = new Error(
        'Students can only assign case events to assigned case users'
      );
      error.statusCode = 403;
      throw error;
    }
  }

  const fallbackAssignedUsers = loadedCase
    ? loadedCase.assignedUserIds.length > 0
      ? loadedCase.assignedUserIds
      : [actorId]
    : [actorId];

  return {
    title,
    event_type: eventType,
    case_id: loadedCase?.id || null,
    case_title: loadedCase
      ? getCaseTitle(
          loadedCase.data,
          body.case_title ?? existingEvent?.case_title
        )
      : null,
    date,
    end_date: endDate,
    group_id: groupId,
    visibility,
    category: loadedCase ? 'case' : 'general',
    start_time: startTime,
    end_time: endTime,
    location: normalizeOptionalText(
      body.location ?? existingEvent?.location
    ),
    description: normalizeOptionalText(
      body.description ?? existingEvent?.description
    ),
    reminder_minutes_before: parsedReminder,
    assigned_users: assignedUsers.length
      ? assignedUsers
      : fallbackAssignedUsers,
    status,
  };
};

const eventMatchesQuery = (event, query) => {
  const eventType = normalizeText(query.event_type);
  const caseId = normalizeText(query.case_id);
  const groupId = normalizeText(query.group_id);
  const status = normalizeText(query.status);
  const date = normalizeText(query.date);
  const dateFrom = normalizeText(query.date_from || query.from);
  const dateTo = normalizeText(query.date_to || query.to);

  if (eventType && eventType !== 'all' && event.event_type !== eventType) {
    return false;
  }

  if (caseId && caseId !== 'all' && event.case_id !== caseId) {
    return false;
  }
  if (groupId && event.group_id !== groupId && !query.workspaceCaseIds?.has(event.case_id)) return false;

  if (status && status !== 'all' && event.status !== status) {
    return false;
  }

  if (date && event.date !== date) return false;
  if (dateFrom && event.date < dateFrom) return false;
  if (dateTo && event.date > dateTo) return false;

  return true;
};

const sortEvents = (events) =>
  [...events].sort((a, b) => {
    const dateCompare = (a.date || '').localeCompare(b.date || '');

    if (dateCompare !== 0) return dateCompare;

    return (a.start_time || '').localeCompare(b.start_time || '');
  });

const applyLimit = (events, query) => {
  const limit = Number(query.limit);

  if (!Number.isInteger(limit) || limit <= 0) {
    return events;
  }

  return events.slice(0, Math.min(limit, 100));
};

const serializeEventDoc = (doc) => ({
  id: doc.id,
  ...doc.data(),
});

const logEventActivity = async (eventData, req, action) => {
  if (!eventData?.case_id) return;

  const actorId = getActorId(req);

  if (!actorId) return;

  await db.collection('activities').add({
    case_id: eventData.case_id,
    court_name: null,
    description: `${action}: ${eventData.title}`,
    event_id: eventData.id || null,
    logged_by_user_id: actorId,
    logged_at: admin.firestore.FieldValue.serverTimestamp(),
    type: `event_${action.toLowerCase().replace(/\s+/g, '_')}`,
  });
};

// POST /api/events
router.post('/events', requireAuth, async (req, res) => {
  try {
    const actorId = getActorId(req);

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    const eventPayload = await validateEventPayload(req.body || {}, req);
    const eventRef = db.collection('events').doc();

    const newEvent = {
      ...eventPayload,
      created_by: actorId,
      created_by_role: req.currentUser.role,
      organizer: normalizeText(req.currentUser.name || req.currentUser.displayName || req.currentUser.email) || 'Clinic member',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    await eventRef.set(newEvent);

    await logEventActivity(
      {
        id: eventRef.id,
        ...eventPayload,
      },
      req,
      'Created scheduled event'
    );

    const savedEvent = await eventRef.get();

    return res.status(201).json({
      message: 'Event created successfully',
      eventId: eventRef.id,
      event: serializeEventDoc(savedEvent),
    });
  } catch (error) {
    console.error('Error creating event:', error);

    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to create event',
    });
  }
});

// GET /api/events
router.get('/events', requireAuth, async (req, res) => {
  try {
    const currentUser = req.currentUser;
    const actorId = getActorId(req);
    let events = [];
    const filters = { ...req.query };
    if (normalizeText(req.query.group_id)) {
      await loadWorkspace(normalizeText(req.query.group_id), currentUser);
      const assignments = await db.collection('case_assignments').where('group_id', '==', normalizeText(req.query.group_id)).get();
      filters.workspaceCaseIds = new Set(assignments.docs.filter((doc) => doc.data().assigned_to_type === ASSIGNMENT_TYPE.GROUP).map((doc) => doc.data().case_id));
    }

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    if (currentUser.role === 'admin') {
      const snapshot = await db.collection('events').get();
      events = snapshot.docs.map(serializeEventDoc);
    } else if (
      currentUser.role === 'law_student' ||
      currentUser.role === 'lawyer' || currentUser.role === 'supervisor'
    ) {
      const caseIds =
        currentUser.role === 'law_student'
          ? await getVisibleCaseIdsForStudent(actorId)
          : currentUser.role === 'lawyer' ? await getDirectCaseIdsForUser(actorId) : [];

      const caseDocs = caseIds.length
        ? await Promise.all(
            caseIds.map((caseId) => db.collection('cases').doc(caseId).get())
          )
        : [];

      const visibleCaseIds = caseDocs
        .filter((caseDoc) => caseDoc.exists && !isCaseDeleted(caseDoc.data()))
        .map((caseDoc) => caseDoc.id);

      const [eventSnapshots, generalEventsSnapshot] = await Promise.all([
        Promise.all(
          visibleCaseIds.map((caseId) =>
            db.collection('events').where('case_id', '==', caseId).get()
          )
        ),
        db.collection('events').where('case_id', '==', null).get(),
      ]);

      const generalEvents = generalEventsSnapshot.docs.map(serializeEventDoc);
      const generalAccess = await Promise.all(generalEvents.map((event) => canViewGeneralEvent(event, req)));
      events = [
        ...eventSnapshots.flatMap((snapshot) =>
          snapshot.docs.map(serializeEventDoc)
        ),
        ...generalEvents.filter((_event, index) => generalAccess[index]),
      ];
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    const filteredEvents = applyLimit(
      sortEvents(events.filter((event) => eventMatchesQuery(event, filters))),
      req.query
    );

    return res.status(200).json(filteredEvents);
  } catch (error) {
    console.error('Error fetching events:', error);

    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to fetch events',
    });
  }
});

// GET /api/events/:eventId
router.get('/events/:eventId', requireAuth, async (req, res) => {
  try {
    const eventDoc = await db.collection('events').doc(req.params.eventId).get();

    if (!eventDoc.exists) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = serializeEventDoc(eventDoc);
    await assertVisibleEvent(event, req);

    return res.status(200).json(event);
  } catch (error) {
    console.error('Error fetching event:', error);

    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to fetch event',
    });
  }
});

// GET /api/cases/:caseId/events
router.get('/cases/:caseId/events', requireAuth, async (req, res) => {
  try {
    const { caseId } = req.params;

    await loadCaseForEventAccess(caseId, req);

    const snapshot = await db
      .collection('events')
      .where('case_id', '==', caseId)
      .get();

    const events = snapshot.docs
      .map(serializeEventDoc)
      .filter((event) => eventMatchesQuery(event, req.query));

    return res.status(200).json(applyLimit(sortEvents(events), req.query));
  } catch (error) {
    console.error('Error fetching case events:', error);

    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to fetch case events',
    });
  }
});

// PATCH /api/events/:eventId
router.patch('/events/:eventId', requireAuth, async (req, res) => {
  try {
    const actorId = getActorId(req);
    const eventRef = db.collection('events').doc(req.params.eventId);
    const eventDoc = await eventRef.get();

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    if (!eventDoc.exists) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const existingEvent = eventDoc.data();
    await assertVisibleEvent(existingEvent, req);
    assertGeneralEventManagement(existingEvent, req);

    const updates = await validateEventPayload(
      req.body || {},
      req,
      existingEvent
    );

    // Check the resulting event too, including when a case link is removed.
    assertGeneralEventManagement({ ...existingEvent, ...updates }, req);

    await eventRef.update({
      ...updates,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_by: actorId,
    });

    await logEventActivity(
      {
        id: req.params.eventId,
        ...updates,
      },
      req,
      updates.status === 'cancelled'
        ? 'Cancelled scheduled event'
        : 'Updated scheduled event'
    );

    const savedEvent = await eventRef.get();

    return res.status(200).json({
      message: 'Event updated successfully',
      event: serializeEventDoc(savedEvent),
    });
  } catch (error) {
    console.error('Error updating event:', error);

    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to update event',
    });
  }
});

// DELETE /api/events/:eventId
router.delete('/events/:eventId', requireAuth, async (req, res) => {
  try {
    const actorId = getActorId(req);
    const hardDelete = req.query.mode === 'delete' || req.query.hard === 'true';
    const eventRef = db.collection('events').doc(req.params.eventId);
    const eventDoc = await eventRef.get();

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    if (!eventDoc.exists) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const existingEvent = {
      id: eventDoc.id,
      ...eventDoc.data(),
    };

    await assertVisibleEvent(existingEvent, req);
    assertGeneralEventManagement(existingEvent, req);

    if (req.currentUser.role === 'lawyer') {
      return res.status(403).json({
        error: 'Lawyers can view scheduled events but cannot change them',
      });
    }

    if (hardDelete) {
      if (req.currentUser.role !== 'admin') {
        return res.status(403).json({
          error: 'Only admins can permanently delete events',
        });
      }

      await eventRef.delete();
      await logEventActivity(existingEvent, req, 'Deleted scheduled event');

      return res.status(200).json({
        message: 'Event deleted successfully',
        eventId: req.params.eventId,
      });
    }

    await eventRef.update({
      status: 'cancelled',
      cancelled_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_by: actorId,
    });

    await logEventActivity(existingEvent, req, 'Cancelled scheduled event');

    return res.status(200).json({
      message: 'Event cancelled successfully',
      event: {
        ...existingEvent,
        status: 'cancelled',
      },
    });
  } catch (error) {
    console.error('Error deleting event:', error);

    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to delete event',
    });
  }
});

export default router;
