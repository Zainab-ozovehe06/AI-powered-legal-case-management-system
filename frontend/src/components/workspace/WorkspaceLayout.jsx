import { Link, NavLink, useNavigate } from 'react-router-dom';
import { CalendarDays, CheckSquare, FileText, FolderOpen, Home, Library, MessageSquare, Users } from 'lucide-react';
import { useUnits } from '../../context/UnitsContext';

const sections = [
  ['overview', 'Overview', Home], ['community', 'Community', MessageSquare],
  ['reports', 'Reports', FileText], ['tasks', 'Tasks', CheckSquare],
  ['cases', 'Cases', FolderOpen], ['resources', 'Shared Resources', Library],
  ['calendar', 'Calendar', CalendarDays], ['members', 'Members', Users],
];

export function UnitNavigation({ groupId, compact = false }) {
  return <nav className={compact ? 'unit-tree-pages' : 'workspace-navigation'} aria-label="Unit pages">
    {sections.map(([path, title, SectionIcon]) => {
      const Icon = SectionIcon;
      return <NavLink key={path} to={`/units/${encodeURIComponent(groupId)}/${path}`}
        className={({ isActive }) => `workspace-nav-link${isActive ? ' active' : ''}`}>
        <Icon size={16} /><span>{title}</span>
      </NavLink>;
    })}
  </nav>;
}

export function WorkspaceLayout({ group, children }) {
  const { units } = useUnits();
  const navigate = useNavigate();
  return <div className="unit-workspace">
    <div className="workspace-breadcrumb"><Link to="/units">Units</Link><span>/</span><span>{group.name}</span></div>
    <header className="workspace-header">
      <div className="workspace-unit-icon"><Library size={27} /></div>
      <div className="workspace-heading"><p className="workspace-eyebrow">NILE UNIVERSITY LAW CLINIC</p>
        <h1>{group.name}</h1><p>{group.description || 'A shared space for your unit to learn, organise and collaborate.'}</p>
      </div>
      {units.length > 1 && <label className="workspace-switcher"><span>Switch unit</span>
        <select aria-label="Switch unit" value={group.id} onChange={(event) => navigate(`/units/${encodeURIComponent(event.target.value)}/overview`)}>
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
        </select>
      </label>}
    </header>
    <UnitNavigation groupId={group.id} />
    {group.status === 'inactive' && <p className="workspace-notice">This unit is inactive. Activate it in Student Groups to add content.</p>}
    <div className="workspace-content">{children}</div>
  </div>;
}

export function WorkspaceMembers({ group, preview = false }) {
  const people = [...group.supervisors.map((person) => ({ ...person, role_in_group: 'supervisor' })), ...group.members];
  return <div className="workspace-members">{(preview ? people.slice(0, 5) : people).map((person) => <article className="workspace-member" key={person.id}>
    <div className={`workspace-avatar${person.role_in_group === 'supervisor' ? ' supervisor' : ''}`} aria-hidden="true">{person.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div>
    <div><strong>{person.name}</strong><span>{person.role_in_group === 'leader' ? 'Unit leader · Student' : person.role_in_group === 'supervisor' ? 'Unit supervisor' : 'Student member'}</span>
      {!preview && person.email && <a href={`mailto:${person.email}`}>{person.email}</a>}
      {!preview && person.joined_at && <small>Joined {workspaceDate(person.joined_at)}</small>}
    </div>
  </article>)}{!people.length && <p className="workspace-empty">No members have been assigned yet.</p>}</div>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function workspaceDate(value) {
  if (!value) return 'Recently';
  const date = new Date((value._seconds ?? value.seconds) !== undefined ? (value._seconds ?? value.seconds) * 1000 : value);
  return Number.isNaN(date.getTime()) ? 'Recently' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}
