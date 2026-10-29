import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckSquare, FileText, Library, MessageSquare } from 'lucide-react';
import { api } from '../../api/apiClient';
import { useAuth } from '../../context/AuthContext';
import WorkspaceDialog from './WorkspaceDialog';
import { workspaceDate } from './WorkspaceLayout';

const icons = { reflection: FileText, post: MessageSquare, task: CheckSquare, resource: Library };
const label = (value = '') => value.replaceAll('_', ' ');

export function WorkspaceItemCard({ item, onOpen }) {
  const Icon = icons[item.kind] || MessageSquare;
  return <button type="button" className="workspace-item-card" onClick={() => onOpen(item)}>
    <div className={`workspace-item-icon ${item.kind}`}><Icon size={18} /></div>
    <div className="workspace-item-copy"><div className="workspace-item-meta"><span>{item.author_name || 'Clinic member'}</span><span>·</span><span>{workspaceDate(item.updated_at || item.submitted_at || item.created_at)}</span></div>
      <h3>{item.title}</h3><p>{item.content || 'Open to view details and discussion.'}</p>
      <div className="workspace-item-tags"><span className="workspace-pill">{item.post_type || item.kind}</span>{item.status && <span className={`workspace-pill ${item.status}`}>{label(item.status)}</span>}{item.visibility === 'restricted' || (item.kind === 'reflection' && item.visibility !== 'unit') ? <span className="workspace-pill">Restricted</span> : null}</div>
    </div>
  </button>;
}

export function WorkspaceItemDetail({ item, group, onClose, onSaved, onEdit }) {
  const { currentUser, userRole } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [feedback, setFeedback] = useState(item.supervisor_feedback || '');
  const [reviewStatus, setReviewStatus] = useState('reviewed');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shared = item.kind !== 'reflection' || (item.visibility === 'unit' && !item.case_id);
  const manager = ['admin', 'supervisor'].includes(userRole);
  const writable = group.status !== 'inactive';
  const update = async (action) => {
    setBusy(true); setError('');
    try { await action(); await onSaved(); } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    let active = true;
    if (shared) api.getWorkspaceComments(group.id, item.kind, item.id)
      .then((data) => { if (active) setComments(data); })
      .catch((error) => { if (active) setError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [group.id, item.id, item.kind, shared]);
  const sendComment = (event) => {
    event.preventDefault();
    update(async () => {
      const created = await api.addWorkspaceComment(group.id, item.kind, item.id, comment);
      setComments((previous) => [...previous, created]); setComment('');
    });
  };
  const remove = () => {
    if (!window.confirm(`Remove “${item.title}” from this unit?`)) return;
    update(async () => { await api.deleteWorkspaceItem(group.id, `${item.kind}s`, item.id); onClose(); });
  };
  return <WorkspaceDialog title={item.title} onClose={onClose} busy={busy}>
    <div className="workspace-detail">
      {error && <p className="workspace-error" role="alert">{error}</p>}
      <p className="workspace-muted">{item.author_name || 'Clinic member'} · {workspaceDate(item.submitted_at || item.created_at)} {item.status ? `· ${label(item.status)}` : ''}</p>
      <p className="workspace-detail-copy">{item.content}</p>
      {item.kind === 'reflection' && <p className="workspace-notice">{shared ? 'Shared with this unit' : 'Restricted report'}</p>}
      {item.kind === 'reflection' && writable && userRole === 'law_student' && item.submitted_by === currentUser.uid && (!item.case_id || group.leader_id === currentUser.uid) && <button className="btn btn-secondary" onClick={() => onEdit(item)}>Edit & resubmit</button>}
      {item.case_id && <Link to={`/cases/${encodeURIComponent(item.case_id)}`} className="btn btn-secondary">Open authorised case</Link>}
      {item.url && <a className="btn btn-secondary" href={item.url} target="_blank" rel="noopener noreferrer">Open shared resource ↗</a>}
      {item.kind === 'task' && <div className="workspace-task-details"><p>Assigned to {group.members.find((member) => member.id === item.assigned_to)?.name || 'Former unit member'}{item.due_date ? ` · Due ${workspaceDate(item.due_date)}` : ''}</p>
        {writable && (manager || [item.assigned_to, item.created_by].includes(currentUser.uid)) && <label>Status<select value={item.status} disabled={busy} onChange={(event) => update(() => api.updateWorkspaceItem(group.id, 'tasks', item.id, { status: event.target.value }))}>
          <option value="todo">To do</option><option value="in_progress">In progress</option><option value="completed">Completed</option>
        </select></label>}</div>}
      {item.supervisor_feedback && <div className="workspace-feedback"><strong>Supervisor feedback · {item.reviewer_name || 'Reviewer'}</strong><p>{item.supervisor_feedback}</p></div>}
      {item.kind === 'reflection' && manager && writable && <form className="workspace-form workspace-review" onSubmit={(event) => { event.preventDefault(); update(() => api.updateWorkspaceItem(group.id, 'reflections', item.id, { status: reviewStatus, supervisor_feedback: feedback })); }}>
        <label>Feedback<textarea required maxLength={10000} rows={3} value={feedback} onChange={(event) => setFeedback(event.target.value)} /></label>
        <label>Review outcome<select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)}><option value="reviewed">Reviewed</option><option value="revision_requested">Request revision</option></select></label>
        <button className="btn btn-primary" disabled={busy}>Save review</button>
      </form>}
      {shared && <section className="workspace-comments"><h3>Discussion</h3>
        {loading ? <p role="status">Loading discussion…</p> : !comments.length ? <p className="workspace-muted">Start the conversation.</p> : comments.map((entry) => <article key={entry.id}><strong>{entry.author_name}</strong><small>{entry.author_role === 'supervisor' ? 'Supervisor · ' : ''}{workspaceDate(entry.created_at)}</small><p>{entry.content}</p></article>)}
        {writable && <form onSubmit={sendComment} className="workspace-form"><label>Add a comment<textarea rows={2} value={comment} required maxLength={4000} onChange={(event) => setComment(event.target.value)} /></label><button className="btn btn-primary" disabled={busy || loading || !comment.trim()}>Post comment</button></form>}
      </section>}
      {item.kind !== 'reflection' && writable && (manager || item.created_by === currentUser.uid) && <button className="btn btn-ghost" disabled={busy} onClick={remove}>Remove {item.kind}</button>}
    </div>
  </WorkspaceDialog>;
}
