import { auth } from '../services/firebase';
import { withCaseDisplayIds } from '../utils/caseDisplayId';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';


const getCurrentUserToken = async () => {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User is not authenticated');
  }

  return user.getIdToken();
};

const getErrorMessage = async (response) => {
  const text = await response.text();

  if (!text) {
    return response.statusText || 'Request failed';
  }

  try {
    const data = JSON.parse(text);
    return data.error || data.message || response.statusText || 'Request failed';
  } catch {
    return text;
  }
};

const getAuthHeaders = async () => {
  const token = await getCurrentUserToken();

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

const getQueryString = (params = {}) => {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value);
    }
  });

  const queryString = query.toString();

  return queryString ? `?${queryString}` : '';
};

export const api = {
  createCase: async (caseData) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/cases`, {
      method: 'POST',
      headers,
      body: JSON.stringify(caseData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || errorData.message || 'Failed to create case'
      );
    }

    return response.json();
  },

  getVisibleCases: async () => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/cases`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch cases');
    }

    const cases = await response.json();

    return withCaseDisplayIds(cases);
  },

  getCase: async (caseId) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/cases/${caseId}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  updateCaseStatus: async (caseId, status) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/cases/${caseId}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  updateCase: async (caseId, updates) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/cases/${caseId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  deleteCase: async (caseId) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/cases/${caseId}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  restoreCase: async (caseId) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/cases/${caseId}/restore`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  // Activities
  logActivity: async (caseId, activityData) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/cases/${caseId}/activities`, {
      method: 'POST',
      headers,
      body: JSON.stringify(activityData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to log activity');
    }

    return response.json();
  },

  updateActivity: async (caseId, activityId, updates) => {
    const headers = await getAuthHeaders();

    const response = await fetch(
      `${API_BASE_URL}/cases/${caseId}/activities/${activityId}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updates),
      }
    );

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  deleteActivity: async (caseId, activityId) => {
    const headers = await getAuthHeaders();

    const response = await fetch(
      `${API_BASE_URL}/cases/${caseId}/activities/${activityId}`,
      {
        method: 'DELETE',
        headers,
      }
    );

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  // Events
  createEvent: async (eventData) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify(eventData),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  getEvents: async (filters = {}) => {
    const headers = await getAuthHeaders();

    const response = await fetch(
      `${API_BASE_URL}/events${getQueryString(filters)}`,
      {
        method: 'GET',
        headers,
      }
    );

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  getEvent: async (eventId) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/events/${eventId}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  getCaseEvents: async (caseId, filters = {}) => {
    const headers = await getAuthHeaders();

    const response = await fetch(
      `${API_BASE_URL}/cases/${caseId}/events${getQueryString(filters)}`,
      {
        method: 'GET',
        headers,
      }
    );

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  updateEvent: async (eventId, updates) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/events/${eventId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  deleteEvent: async (eventId, options = {}) => {
    const headers = await getAuthHeaders();
    const queryString = options.hard ? '?mode=delete' : '';

    const response = await fetch(`${API_BASE_URL}/events/${eventId}${queryString}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  // Documents
  uploadDocument: async (caseId, file) => {
    const token = await getCurrentUserToken();

    const formData = new FormData();
    formData.append('case_id', caseId);
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/documents/${caseId}/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  openDocument: async (documentId, fileName = 'document') => {
    const token = await getCurrentUserToken();

    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/download`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const openedWindow = window.open(blobUrl, '_blank', 'noopener,noreferrer');

    if (!openedWindow) {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
  },

  updateDocument: async (documentId, updates) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  deleteDocument: async (documentId) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  // AI Assistant
  sendAssistantMessage: async ({ prompt, files = [], conversation = [], contextPath = '' }) => {
    const token = await getCurrentUserToken();
    const formData = new FormData();

    formData.append('prompt', prompt);
    formData.append('conversation', JSON.stringify(conversation));
    formData.append('contextPath', contextPath);

    files.forEach((file) => {
      formData.append('references', file);
    });

    const response = await fetch(`${API_BASE_URL}/ai/assistant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  // Groups
  createGroup: async (data) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/groups`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  getGroups: async () => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/groups`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  getMyGroups: async () => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/groups/my-groups`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  getGroup: async (groupId) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/groups/${groupId}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  addGroupMembers: async (groupId, memberIds) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/groups/${groupId}/members`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ member_ids: memberIds }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  removeGroupMember: async (groupId, userId) => {
    const headers = await getAuthHeaders();

    const response = await fetch(
      `${API_BASE_URL}/groups/${groupId}/members/${userId}`,
      {
        method: 'DELETE',
        headers,
      }
    );

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  updateGroupLeader: async (groupId, leaderId) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/groups/${groupId}/leader`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ leader_id: leaderId }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  updateGroupStatus: async (groupId, status) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/groups/${groupId}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  assignSupervisorToGroup: async (groupId, supervisorId) => {
    const headers = await getAuthHeaders();

    const response = await fetch(
      `${API_BASE_URL}/admin/groups/${groupId}/assign-supervisor`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ supervisorId }),
      }
    );

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  assignCaseToGroup: async (caseId, groupId) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/cases/${caseId}/assign-group`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ group_id: groupId }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  assignCaseToLawyer: async (caseId, lawyerId) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/admin/cases/${caseId}/assign-lawyer`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ lawyer_id: lawyerId }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  submitGroupReflection: async (caseId, data) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/cases/${caseId}/group-reflections`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  getCaseGroupReflections: async (caseId) => {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}/cases/${caseId}/group-reflections`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return response.json();
  },

  getUsers: async () => {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/users`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch users');
  }

  return response.json();
},

updateUser: async (userId, updates) => {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to update user');
  }

  return response.json();
}, 

getCaseActivities: async (caseId) => {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/cases/${caseId}/activities`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch case activities');
  }

  return response.json();
},

getSettings: async () => {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/settings`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch settings');
  }

  return response.json();
},

updateSettings: async (settingsData) => {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/settings`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(settingsData),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to update settings');
  }

  return response.json();
},
};
