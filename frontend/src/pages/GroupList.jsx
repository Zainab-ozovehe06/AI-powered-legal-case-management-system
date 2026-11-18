import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Crown,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { api } from '../api/apiClient';
import { useUnits } from '../context/UnitsContext';

const getDisplayName = (user) =>
  user?.name || user?.displayName || user?.email || 'Unnamed user';

export default function GroupList() {
  const { refresh: refreshUnits } = useUnits();
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingAction, setSavingAction] = useState('');

  const students = useMemo(
    () => users
      .filter((user) => user.role === 'law_student')
      .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b))),
    [users]
  );

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [nextGroups, nextUsers] = await Promise.all([
        api.getGroups(),
        api.getUsers(),
      ]);
      setGroups(nextGroups);
      setUsers(nextUsers);
      await refreshUnits();
    } catch (error) {
      console.error('Error loading groups:', error);
      alert('Failed to load groups: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [refreshUnits]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRemoveMember = async (groupId, userId, memberName) => {
    if (!window.confirm(`Remove ${memberName} from this group?`)) return;

    setSavingAction(`remove-${groupId}-${userId}`);
    try {
      await api.removeGroupMember(groupId, userId);
      await fetchData();
    } catch (error) {
      console.error('Error removing group member:', error);
      alert('Failed to remove member: ' + error.message);
    } finally {
      setSavingAction('');
    }
  };

  const handleLeaderChange = async (groupId, leaderId) => {
    if (!leaderId) return;

    setSavingAction(`leader-${groupId}`);
    try {
      await api.updateGroupLeader(groupId, leaderId);
      await fetchData();
    } catch (error) {
      console.error('Error updating leader:', error);
      alert('Failed to update leader: ' + error.message);
    } finally {
      setSavingAction('');
    }
  };

  const handleStatusToggle = async (group) => {
    const nextStatus = group.status === 'active' ? 'inactive' : 'active';

    setSavingAction(`status-${group.id}`);
    try {
      await api.updateGroupStatus(group.id, nextStatus);
      await fetchData();
    } catch (error) {
      console.error('Error updating group status:', error);
      alert('Failed to update group status: ' + error.message);
    } finally {
      setSavingAction('');
    }
  };

  return (
    <div className="group-management-page animate-fade-in">
      <div className="group-management-hero">
        <div>
          <p className="group-management-eyebrow">Admin workspace</p>
          <h1 className="group-management-title">Groups &amp; Units</h1>
          <p className="group-management-subtitle">
            View group details, manage membership and leaders, and open unit workspaces.
          </p>
        </div>
        <Link to="/admin/groups" className="group-management-primary-button">
          <UserPlus size={16} />
          Create or assign members
        </Link>
      </div>

      {loading ? (
        <div className="group-management-panel group-management-feedback">
          <Loader2 size={20} className="manage-users-loader" />
          <span>Loading groups...</span>
        </div>
      ) : (
        <section className="group-management-panel group-management-list-panel">
          <div className="group-management-panel-header">
            <h2 className="group-management-panel-title">Groups &amp; Units</h2>
            <span className="group-management-count">
              {groups.length} {groups.length === 1 ? 'group' : 'groups'}
            </span>
          </div>

          {groups.length === 0 ? (
            <div className="group-management-empty">
              <Users size={22} />
              <span>No groups created yet. <Link to="/admin/groups">Create a group</Link></span>
            </div>
          ) : (
            <div className="group-management-list">
              {groups.map((group) => {
                const isSavingStatus = savingAction === `status-${group.id}`;
                const isChangingLeader = savingAction === `leader-${group.id}`;

                return (
                  <article key={group.id} className="group-management-card">
                    <div className="group-management-card-header">
                      <div>
                        <div className="group-management-card-title-row">
                          <h3>{group.name}</h3>
                          <Link to={`/units/${encodeURIComponent(group.id)}/overview`}>Open workspace</Link>
                          <span className={`group-management-status group-management-status-${group.status || 'active'}`}>
                            {group.status || 'active'}
                          </span>
                        </div>
                        <p>{group.description || 'No description provided.'}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleStatusToggle(group)}
                        disabled={isSavingStatus}
                        className="group-management-status-button"
                        aria-label={`Set ${group.name} ${group.status === 'active' ? 'inactive' : 'active'}`}
                      >
                        {isSavingStatus ? (
                          <Loader2 size={18} className="manage-users-loader" />
                        ) : group.status === 'active' ? (
                          <ToggleRight size={22} />
                        ) : (
                          <ToggleLeft size={22} />
                        )}
                      </button>
                    </div>

                    <div className="group-management-leader-row">
                      <Crown size={16} />
                      <select
                        value={group.leader_id || ''}
                        onChange={(e) => handleLeaderChange(group.id, e.target.value)}
                        disabled={isChangingLeader}
                        className="group-management-input"
                        aria-label={`Leader for ${group.name}`}
                      >
                        <option value="">Select leader</option>
                        {students.map((student) => (
                          <option key={student.id} value={student.id}>
                            {getDisplayName(student)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="group-management-supervisor-row">
                      <UserCheck size={16} />
                      <span>Supervisor</span>
                      <strong>{group.supervisor_name || 'Not assigned'}</strong>
                    </div>

                    <div className="group-management-member-list">
                      {(group.members || []).map((member) => {
                        const isLeader = member.user_id === group.leader_id;
                        const removeAction = `remove-${group.id}-${member.user_id}`;

                        return (
                          <div key={member.id || member.user_id} className="group-management-member-row">
                            <div>
                              <span className="group-management-member-name">
                                {member.user_name || member.user_id}
                              </span>
                              <span className="group-management-member-role">
                                {isLeader ? 'Leader' : member.user?.role === 'lawyer' ? 'Lawyer' : 'Member'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(group.id, member.user_id, member.user_name || 'this member')}
                              disabled={isLeader || savingAction === removeAction}
                              className="group-management-icon-button"
                              aria-label={`Remove ${member.user_name || 'member'}`}
                              title={isLeader ? 'Assign another leader before removing' : 'Remove member'}
                            >
                              {savingAction === removeAction ? (
                                <Loader2 size={15} className="manage-users-loader" />
                              ) : (
                                <Trash2 size={15} />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="group-management-add-row">
                      <Link to="/admin/groups" className="group-management-secondary-button">
                        <UserPlus size={16} />
                        Add members or assign supervisor
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
