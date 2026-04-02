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
    'Authorization': `Bearer ${token}`
  };
};

export const api = {
  // Cases
  createCase: async (caseData) => {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/cases`, {
      method: 'POST',
      headers,
      body: JSON.stringify(caseData)
    });
    
    if (!response.ok) {
  const errorData = await response.json();
  throw new Error(errorData.error || errorData.message || 'Failed to create case');
}
    
    return response.json();
  },

  // Activities
  logActivity: async (caseId, activityData) => {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/cases/${caseId}/activities`, {
      method: 'POST',
      headers,
      body: JSON.stringify(activityData)
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
        'Authorization': `Bearer ${token}`
        // Do NOT set Content-Type header when sending FormData, the browser sets it with the correct boundary
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to upload document');
    }

    return response.json();
  }
};
