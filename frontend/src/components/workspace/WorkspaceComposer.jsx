import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/apiClient';
import WorkspaceDialog from './WorkspaceDialog';

const labels = { reflections: 'Submit report', posts: 'Start a conversation', tasks: 'Create task', resources: 'Share resource' };

export default function WorkspaceComposer({ kind, group, cases, onClose, onSaved, item }) {
  const { currentUser, userRole } = useAuth();
  const [form, setForm] = useState({ title: item?.title || '', content: item?.content || '', visibility: item?.visibility || 'restricted', case_id: item?.case_id || '',
    post_type: 'discussion', url: '', assigned_to: group.members.find((member) => member.id === currentUser.uid)?.id || group.members[0]?.id || '', due_date: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value,
    ...(key === 'case_id' && event.target.value ? { visibility: 'restricted' } : {}) }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      if (item) await api.updateWorkspaceItem(group.id, kind, item.id, form);
      else await api.createWorkspaceItem(group.id, kind, form);
      await onSaved(); onClose();
    }
    catch (error) { setError(error.message); }
    finally { setSaving(false); }
  };
  return <WorkspaceDialog title={item ? 'Edit & resubmit report' : labels[kind]} onClose={onClose} busy={saving}>
    <form className="workspace-form" onSubmit={submit}>
      <p className="workspace-muted">{group.name}</p>
      {error && <p className="workspace-error" role="alert">{error}</p>}
      <label>Title<input autoFocus required maxLength={200} value={form.title} onChange={set('title')} /></label>
      {kind === 'posts' && (userRole !== 'law_student' || group.leader_id === currentUser.uid) && <label>Post type<select value={form.post_type} onChange={set('post_type')}><option value="discussion">Discussion</option><option value="announcement">Announcement</option></select></label>}
      {kind === 'resources' && <label>Resource link<input type="url" required maxLength={2000} value={form.url} onChange={set('url')} placeholder="https://…" /></label>}
      <label>{kind === 'reflections' ? 'Reflection' : 'Description'}<textarea rows={6} required={['reflections', 'posts'].includes(kind)} maxLength={kind === 'reflections' ? 20000 : 10000} value={form.content} onChange={set('content')} /></label>
      {kind === 'reflections' && <>
        {group.leader_id === currentUser.uid && <label>Related case (optional)<select value={form.case_id} onChange={set('case_id')} disabled={Boolean(item)}><option value="">General unit report</option>{cases.map((caseItem) => <option key={caseItem.id} value={caseItem.id}>{caseItem.caseDisplayId || caseItem.case_title || caseItem.client_name || caseItem.id}</option>)}</select></label>}
        <label>Who can read this report?<select value={form.visibility} onChange={set('visibility')} disabled={Boolean(form.case_id)}><option value="restricted">Restricted · You and authorised reviewers</option><option value="unit">Shared · Everyone in this unit</option></select></label>
        <p className="workspace-notice">{form.visibility === 'unit' ? 'This report and its discussion will be visible to all unit members. Include only information approved for sharing; keep client details and case documents in the case.' : 'This report stays out of the community feed. Case-linked reports also require existing case access.'}</p>
      </>}
      {kind === 'tasks' && <div className="workspace-form-row"><label>Assign to<select required value={form.assigned_to} onChange={set('assigned_to')}><option value="">Choose member</option>{group.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label>Due date<input type="date" value={form.due_date} onChange={set('due_date')} /></label></div>}
      {['resources', 'tasks', 'posts'].includes(kind) && <p className="workspace-muted">Visible to everyone in this unit. Share only material approved for the unit.</p>}
      <div className="workspace-form-actions"><button type="button" className="btn btn-secondary" disabled={saving} onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : item ? 'Resubmit report' : labels[kind]}</button></div>
    </form>
  </WorkspaceDialog>;
}
