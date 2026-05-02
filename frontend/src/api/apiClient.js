import { auth } from '../services/firebase';

const API_BASE_URL = 'http://localhost:5000/api';

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
