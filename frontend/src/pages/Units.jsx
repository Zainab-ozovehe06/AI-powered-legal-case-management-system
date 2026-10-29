import { ArrowUpRight, Library, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUnits } from '../context/UnitsContext';
import { useAuth } from '../context/AuthContext';
import '../components/workspace/workspace.css';

export default function Units() {
  const { units, loading, error, refresh } = useUnits();
  const { userRole } = useAuth();
  return <div className="unit-directory">
    <header className="workspace-section-heading"><div><p className="workspace-eyebrow">LAW CLINIC / TEAMSPACES</p><h1>Your units</h1>
      <p>A home for your team's ideas, reports and shared work.</p></div>
      {userRole === 'admin' && <Link className="btn btn-primary" to="/admin/groups"><Plus size={16} />Manage units</Link>}
    </header>
    {loading && <p role="status" className="workspace-empty">Loading your units…</p>}
    {error && <div role="alert" className="workspace-error">{error} <button className="btn btn-secondary" onClick={refresh}>Try again</button></div>}
    {!loading && !error && !units.length && <div className="workspace-empty"><Library size={32} /><h2>No units assigned yet</h2>
      <p>{userRole === 'admin' ? 'Create a group to make its workspace available automatically.' : 'Your units will appear here when an administrator assigns you.'}</p></div>}
    <div className="unit-directory-grid">{units.map((unit) => <Link to={`/units/${encodeURIComponent(unit.id)}/overview`} key={unit.id} className="unit-directory-card">
      <div className="unit-directory-card-top"><div className="workspace-unit-icon"><Library size={23} /></div><ArrowUpRight size={19} /></div>
      <h2>{unit.name}</h2><p>{unit.description || 'Open your unit workspace to collaborate with the team.'}</p>
      <div className="unit-directory-card-footer"><span>{unit.supervisor_name ? `Supervised by ${unit.supervisor_name}` : 'Supervisor not yet assigned'}</span>
        {unit.status === 'inactive' && <span className="workspace-pill">Inactive</span>}</div>
    </Link>)}</div>
  </div>;
}
