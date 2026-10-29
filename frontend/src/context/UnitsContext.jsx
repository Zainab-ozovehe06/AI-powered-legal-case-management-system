import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/apiClient';
import { useAuth } from './AuthContext';

const UnitsContext = createContext({ units: [], loading: true, error: '' });

// Shared by workspace pages and the app sidebar. Recheck membership when the
// user returns to the app; the API validates it again on every content request.
export function UnitsProvider({ children }) {
  const { currentUser, userRole } = useAuth();
  const [state, setState] = useState({ units: [], loading: true, error: '' });
  const fetchUnits = useCallback(() => ['admin', 'law_student', 'supervisor'].includes(userRole)
    ? api.getWorkspaces() : Promise.resolve([]), [userRole]);
  const refresh = useCallback(async () => {
    try {
      const units = await fetchUnits();
      setState({ units, loading: false, error: '' });
    } catch (error) {
      setState({ units: [], loading: false, error: error.message });
    }
  }, [fetchUnits]);
  useEffect(() => {
    let active = true;
    fetchUnits().then((units) => { if (active) setState({ units, loading: false, error: '' }); })
      .catch((error) => { if (active) setState({ units: [], loading: false, error: error.message }); });
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, [fetchUnits, refresh, currentUser?.uid]);
  return <UnitsContext.Provider value={{ ...state, refresh }}>{children}</UnitsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useUnits = () => useContext(UnitsContext);
