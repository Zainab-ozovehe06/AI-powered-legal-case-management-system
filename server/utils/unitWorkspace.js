import { db } from '../config/firebase.js';
import { getGroupIdsForUser, getMembership, normalizeText } from './groupCollaboration.js';

export const workspaceError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

// A workspace is a view of an existing group. There is no separate workspace
// record or membership list to provision, migrate, or keep in sync.
export const getWorkspaceGroupIds = async (user) => {
  if (user.role === 'law_student') return getGroupIdsForUser(user.uid);
  if (user.role === 'supervisor') {
    const snapshot = await db.collection('groups').where('supervisor_id', '==', user.uid).get();
    return snapshot.docs.map((doc) => doc.id);
  }
  return [];
};

export const loadWorkspace = async (groupId, user, { write = false } = {}) => {
  if (!['admin', 'law_student', 'supervisor'].includes(user?.role)) {
    throw workspaceError(403, 'You do not have access to unit workspaces');
  }
  const doc = await db.collection('groups').doc(groupId).get();
  if (!doc.exists) throw workspaceError(404, 'Unit not found');
  const group = { ...doc.data(), id: doc.id };
  if (user.role !== 'admin') {
    const permitted = user.role === 'supervisor'
      ? group.supervisor_id === user.uid
      : Boolean(await getMembership(groupId, user.uid));
    if (!permitted) throw workspaceError(403, 'You do not belong to this unit');
    if (group.status === 'inactive') throw workspaceError(403, 'This unit is inactive');
  }
  if (write && group.status === 'inactive') throw workspaceError(403, 'Activate this unit before adding workspace content');
  return group;
};

export const publicProfile = (user, id) => ({
  id,
  name: normalizeText(user?.name || user?.displayName || user?.email) || 'Clinic member',
  email: user?.email || null,
  role: user?.role || 'law_student',
});

export const workspaceManager = (user) => ['admin', 'supervisor'].includes(user?.role);

export const requiredText = (value, label, max = 10000) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw workspaceError(400, `${label} is required and must be at most ${max} characters`);
  }
  return value.trim();
};

export const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
