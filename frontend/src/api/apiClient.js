import { auth } from '../services/firebase';

const API_BASE_URL = 'http://localhost:5000/api';

const getAuthHeaders = async () => {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User is not authenticated');
  }

  const token = await user.getIdToken();

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

export const api = {
  // Cases
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

  // Documents
  uploadDocument: async (caseId, file) => {
    const user = auth.currentUser;
    if (!user) throw new Error('User is not authenticated');

    const token = await user.getIdToken();

    const formData = new FormData();
    formData.append('case_id', caseId);
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/documents/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || 'Server returned a non-JSON response');
    }

    if (!response.ok) {
      throw new Error(data.error || 'Failed to upload document');
    }

    return data;
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