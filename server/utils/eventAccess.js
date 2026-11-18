import { loadWorkspace } from './unitWorkspace.js';

// Case assignment is checked separately. A case link never overrides a private
// audience or an explicitly unit-scoped audience on an event.
export const canViewCaseEventAudience = async (event, user) => {
  if (user.role === 'admin') return true;
  if (event.visibility === 'private' && event.created_by !== user.uid &&
    !(Array.isArray(event.assigned_users) && event.assigned_users.includes(user.uid))) return false;
  if (event.group_id) {
    try { await loadWorkspace(event.group_id, user); }
    catch (error) { if ([403, 404].includes(error.statusCode)) return false; throw error; }
  }
  return true;
};
