import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowRight, CalendarDays, CheckSquare, FileText, Plus, Users } from 'lucide-react';
import { api } from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import { WorkspaceLayout, WorkspaceMembers, workspaceDate } from '../components/workspace/WorkspaceLayout';
import { WorkspaceItemCard, WorkspaceItemDetail } from '../components/workspace/WorkspaceItem';
import WorkspaceComposer from '../components/workspace/WorkspaceComposer';
import WorkspaceDialog from '../components/workspace/WorkspaceDialog';
import Calendar from '../components/calendar/Calendar';
import EventCard from '../components/calendar/EventCard';
import EventModal from '../components/calendar/EventModal';
import { getTodayDateString } from '../components/calendar/eventUtils';
import '../components/workspace/workspace.css';

const sectionMeta = {
  overview: ['Overview', 'A snapshot of your unit and the work moving it forward.'],
  community: ['Community', 'Updates, conversations and work shared with your unit.'],
  reports: ['Reports & reflections', 'Submit your reflections and read reports shared with you.'],
  tasks: ['Tasks', 'Plan the work, follow progress and celebrate what is done.'],
  cases: ['Unit cases', 'Cases explicitly assigned to this unit that you are authorised to access.'],
  resources: ['Shared resources', 'Useful reading, tools and references for the team.'],
  members: ['Members', 'The people learning and working together in this unit.'],
  activities: ['Student Activities', 'Review student progress within your supervision scope.'],
};

export default function UnitWorkspace() {
  const { groupId, section = 'overview' } = useParams();
  return <WorkspacePage key={groupId} groupId={groupId} section={section} />;
}

function WorkspacePage({ groupId, section }) {
  const { userRole } = useAuth();
  const [data, setData] = useState(null);
  const [cases, setCases] = useState([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [composer, setComposer] = useState('');
  const [editingReport, setEditingReport] = useState(null);
  const [selected, setSelected] = useState(null);
  const [eventDetail, setEventDetail] = useState(null);
  const [feedFilter, setFeedFilter] = useState('all');
  const [selectedStudent, setSelectedStudent] = useState('');
  const refresh = useCallback(async () => {
    try {
      const [workspace, unitCases, unitEvents] = await Promise.all([
        api.getWorkspace(groupId),
        api.getVisibleCases({ group_id: groupId, ...(userRole === 'supervisor' ? { student_id: selectedStudent } : {}) }),
        api.getEvents({ group_id: groupId, status: 'upcoming', date_from: getTodayDateString() }),
      ]);
      setData(workspace); setCases(unitCases); setEvents(unitEvents); setError('');
    } catch (error) { setData(null); setError(error.message); throw error; }
  }, [groupId, userRole, selectedStudent]);
  useEffect(() => {
    const load = () => { refresh().catch(() => {}); };
    load(); window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [refresh]);

  if (error) return <div className="workspace-error" role="alert"><h1>Workspace unavailable</h1><p>{error}</p><button className="btn btn-secondary" onClick={() => refresh().catch(() => {})}>Try again</button> <Link to="/units">Back to units</Link></div>;
  if (!data) return <p role="status" className="workspace-empty">Loading unit workspace…</p>;
  if (!sectionMeta[section] && section !== 'calendar') return <Navigate to={`/units/${encodeURIComponent(groupId)}/overview`} replace />;
  const { group, reflections, feed, tasks, resources } = data;
  if (section === 'activities' && !['admin', 'supervisor'].includes(userRole)) return <Navigate to={`/units/${encodeURIComponent(groupId)}/overview`} replace />;
  const base = `/units/${encodeURIComponent(group.id)}`;
  const writable = group.status !== 'inactive';
  const createKind = { community: 'posts', reports: 'reflections', tasks: 'tasks', resources: 'resources' }[section];
  const activeItem = selected && (selected.kind === 'reflection' ? reflections : selected.kind === 'task' ? tasks : selected.kind === 'resource' ? resources : feed)
    .find((item) => item.id === selected.id);
  const openItem = (item) => setSelected(item);
  const cards = (items, empty) => items.length ? <div className="workspace-feed">{items.map((item) => <WorkspaceItemCard key={`${item.kind}-${item.id}`} item={item} onOpen={openItem} />)}</div> : <p className="workspace-empty">{empty}</p>;
  const recentSubmissions = [...reflections.map((item) => ({ ...item, kind: 'reflection' })), ...tasks.filter((item) => item.status === 'completed').map((item) => ({ ...item, kind: 'task' }))]
    .sort((a, b) => ((b.updated_at?._seconds ?? b.updated_at?.seconds) || 0) - ((a.updated_at?._seconds ?? a.updated_at?.seconds) || 0)).slice(0, 4);
  return <WorkspaceLayout group={group}>
    {section !== 'calendar' && <div className="workspace-section-heading"><div><h2>{sectionMeta[section][0]}</h2><p>{sectionMeta[section][1]}</p></div>
      {createKind && writable && (section !== 'reports' || userRole === 'law_student') && <button className="btn btn-primary" onClick={() => setComposer(createKind)}><Plus size={16} />{{ posts: 'New post', reflections: 'Submit report', tasks: 'New task', resources: 'Share resource' }[createKind]}</button>}
      {section === 'members' && userRole === 'admin' && <Link className="btn btn-secondary" to="/admin/groups/list">Manage memberships</Link>}
    </div>}
    {section === 'overview' && <>
      <div className="workspace-stats">{[[<Users size={19} />, group.members.length, 'Unit members'], [<FileText size={19} />, reflections.length, 'Visible reports'], [<CheckSquare size={19} />, tasks.filter((task) => task.status !== 'completed').length, 'Open tasks'], [<CalendarDays size={19} />, events.length, 'Upcoming events']].map(([icon, count, title]) => <div key={title}>{icon}<strong>{count}</strong><span>{title}</span></div>)}</div>
      <div className="workspace-overview-grid"><div>
        <section className="workspace-panel"><div className="workspace-panel-heading"><h3>Recent activity</h3><Link to={`${base}/community`}>Community <ArrowRight size={14} /></Link></div>{cards(feed.slice(0, 4), 'Your unit’s shared activity will appear here.')}</section>
        <section className="workspace-panel"><div className="workspace-panel-heading"><h3>Recent submissions</h3><Link to={`${base}/reports`}>View reports <ArrowRight size={14} /></Link></div>{cards(recentSubmissions, 'No reports or completed tasks to show yet.')}</section>
      </div><div>
        <section className="workspace-panel"><div className="workspace-panel-heading"><h3>Upcoming events</h3><Link to={`${base}/calendar`}>Calendar <ArrowRight size={14} /></Link></div>{events.length ? events.slice(0, 5).map((event) => <EventCard key={event.id} event={event} compact readOnly onEdit={setEventDetail} />) : <p className="workspace-empty">No upcoming unit events.</p>}</section>
        <section className="workspace-panel"><div className="workspace-panel-heading"><h3>Your team</h3><Link to={`${base}/members`}>All members <ArrowRight size={14} /></Link></div><WorkspaceMembers group={group} preview />{!group.supervisors.length && <p className="workspace-muted">A supervisor has not been assigned yet.</p>}</section>
      </div></div>
    </>}
    {section === 'community' && <><div className="workspace-filter-row" role="group" aria-label="Filter activity">{[['all', 'All updates'], ['post', 'Conversations'], ['reflection', 'Reports'], ['task', 'Tasks'], ['resource', 'Resources']].map(([value, title]) => <button className={`btn ${feedFilter === value ? 'btn-primary' : 'btn-secondary'}`} key={value} onClick={() => setFeedFilter(value)} aria-pressed={feedFilter === value}>{title}</button>)}</div>{cards(feed.filter((item) => feedFilter === 'all' || item.kind === feedFilter), 'No shared updates yet. Start a conversation with your unit.')}
      <section className="workspace-panel"><h3>People in this unit</h3><WorkspaceMembers group={group} preview /></section></>}
    {section === 'reports' && cards(reflections.map((item) => ({ ...item, kind: 'reflection' })), 'No reports are shared with you yet. Restricted reports are visible only to their author and authorised reviewers.')}
    {section === 'tasks' && <div className="workspace-task-board">{[['todo', 'To do'], ['in_progress', 'In progress'], ['completed', 'Completed']].map(([status, title]) => <section key={status}><h3>{title}<span>{tasks.filter((item) => item.status === status).length}</span></h3>{cards(tasks.filter((item) => item.status === status).map((item) => ({ ...item, kind: 'task' })), 'No tasks')}</section>)}</div>}
    {section === 'cases' && <>
      {userRole === 'supervisor' && <label className="workspace-student-filter">Student<select value={selectedStudent} onChange={(event) => setSelectedStudent(event.target.value)}><option value="">All students</option>{group.members.filter((member) => member.role === 'law_student').map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>}
      {cases.length ? <div className="workspace-case-list">{cases.map((item) => <Link key={item.id} to={`/cases/${encodeURIComponent(item.id)}`}><div><span className="workspace-muted">Case {item.caseDisplayId || item.id}</span><h3>{item.case_title || item.client_name || 'Untitled case'}</h3><p>{item.offence || item.case_type}</p></div><span className="workspace-pill">{item.status || 'Open'}</span><ArrowRight size={18} /></Link>)}</div> : <p className="workspace-empty">No cases are available within your current permissions.</p>}
    </>}
    {section === 'activities' && <StudentActivities group={group} />}
    {section === 'resources' && cards(resources.map((item) => ({ ...item, kind: 'resource' })), 'Share reading, templates or other approved resource links with the unit.')}
    {section === 'members' && <WorkspaceMembers group={group} />}
    {section === 'calendar' && <Calendar key={group.id} groupId={group.id} groupName={group.name} inactive={!writable} />}
    {composer && <WorkspaceComposer key={composer} kind={composer} group={group} cases={cases} onClose={() => setComposer('')} onSaved={refresh} />}
    {activeItem && <WorkspaceItemDetail key={`${selected.kind}-${selected.id}`} item={{ ...activeItem, kind: selected.kind }} group={group} onClose={() => setSelected(null)} onSaved={refresh} onEdit={(item) => { setSelected(null); setEditingReport(item); }} />}
    {editingReport && <WorkspaceComposer key={editingReport.id} kind="reflections" item={editingReport} group={group} cases={cases} onClose={() => setEditingReport(null)} onSaved={refresh} />}
    {eventDetail && <EventModal key={eventDetail.id} isOpen event={eventDetail} readOnly onClose={() => setEventDetail(null)} />}
  </WorkspaceLayout>;
}

function StudentActivities({ group }) {
  const [filters, setFilters] = useState({ student_id: '', date_from: '', date_to: '' });
  const [activities, setActivities] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api.getWorkspaceActivities(group.id, filters).then((items) => { if (active) { setActivities(items); setError(''); } })
      .catch((error) => { if (active) { setActivities([]); setError(error.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [group.id, filters]);
  const updateFilter = (field, value) => { setLoading(true); setSelected(null); setFilters((previous) => ({ ...previous, [field]: value })); };
  return <>
    <div className="workspace-activity-filters">
      <label>Student<select value={filters.student_id} onChange={(event) => updateFilter('student_id', event.target.value)}><option value="">All students</option>{group.members.filter((member) => member.role === 'law_student').map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label>From<input type="date" value={filters.date_from} onChange={(event) => updateFilter('date_from', event.target.value)} /></label>
      <label>To<input type="date" value={filters.date_to} onChange={(event) => updateFilter('date_to', event.target.value)} /></label>
    </div>
    {error && <p role="alert" className="workspace-error">{error}</p>}
    {loading ? <p role="status" className="workspace-empty">Loading student activities...</p> : activities.length ? <div className="workspace-feed">{activities.map((activity) => <button key={activity.id} type="button" className="workspace-item-card" onClick={() => setSelected(activity)}><div className="workspace-item-copy"><div className="workspace-item-meta">{activity.student_name} · {workspaceDate(activity.logged_at)}</div><h3>{activity.case_title || 'Restricted case activity'}</h3><p>{activity.description}</p></div></button>)}</div> : !error && <p className="workspace-empty">No student activities match these filters.</p>}
    {selected && <WorkspaceDialog title="Student activity" onClose={() => setSelected(null)}><div className="workspace-detail"><p>{selected.student_name} · {workspaceDate(selected.logged_at)}</p><p className="workspace-detail-copy">{selected.description}</p>{selected.court_name && <p>{selected.court_name}</p>}{selected.case_id && <Link className="btn btn-secondary" to={`/cases/${encodeURIComponent(selected.case_id)}`}>Review case</Link>}</div></WorkspaceDialog>}
  </>;
}
