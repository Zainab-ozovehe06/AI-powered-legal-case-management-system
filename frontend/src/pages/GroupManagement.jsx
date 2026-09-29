import { useEffect, useMemo, useState } from 'react';
import {
  Crown,
  Loader2,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { api } from '../api/apiClient';

const getDisplayName = (user) =>
  user?.name || user?.displayName || user?.email || 'Unnamed user';

export default function GroupManagement() {
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingAction, setSavingAction] = useState('');
  const [memberSelections, setMemberSelections] = useState({});
  const [assignmentForm, setAssignmentForm] = useState({
    groupId: '',
    supervisorId: '',
  });
  const [assignmentMessage, setAssignmentMessage] = useState({
    type: '',
    text: '',
  });
  const [form, setForm] = useState({
    name: '',
    description: '',
    leader_id: '',
    member_ids: [],
  });

  const students = useMemo(
    () =>
      users
        .filter((user) => user.role === 'law_student')
        .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b))),
    [users]
  );

  const supervisors = useMemo(
    () =>
      users
        .filter((user) => user.role === 'supervisor')
        .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b))),
    [users]
  );

  const selectedAssignmentGroup = useMemo(
    () => groups.find((group) => group.id === assignmentForm.groupId) || null,
    [assignmentForm.groupId, groups]
  );

  const fetchData = async () => {
    try {
      setLoading(true);
      const [nextGroups, nextUsers] = await Promise.all([
        api.getGroups(),
        api.getUsers(),
      ]);

      setGroups(nextGroups);
      setUsers(nextUsers);
    } catch (error) {
      console.error('Error loading groups:', error);
      alert('Failed to load groups: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAssignmentGroupChange = (groupId) => {
    const group = groups.find((item) => item.id === groupId);

    setAssignmentForm({
      groupId,
      supervisorId: group?.supervisor_id || '',
    });
    setAssignmentMessage({ type: '', text: '' });
  };

  const handleAssignmentSupervisorChange = (supervisorId) => {
    setAssignmentForm((current) => ({
      ...current,
      supervisorId,
    }));
    setAssignmentMessage({ type: '', text: '' });
  };

  const toggleCreateMember = (userId) => {
    setForm((current) => {
      const hasMember = current.member_ids.includes(userId);

      return {
        ...current,
        member_ids: hasMember
          ? current.member_ids.filter((memberId) => memberId !== userId)
          : [...current.member_ids, userId],
      };
    });
  };

  const handleAssignSupervisor = async (e) => {
    e.preventDefault();

    if (!assignmentForm.groupId || !assignmentForm.supervisorId) {
      setAssignmentMessage({
        type: 'error',
        text: 'Select a group and supervisor before assigning.',
      });
      return;
    }

    const group = groups.find((item) => item.id === assignmentForm.groupId);
    const supervisor = supervisors.find(
      (item) => item.id === assignmentForm.supervisorId
    );

    setSavingAction('assign-supervisor');
    setAssignmentMessage({ type: '', text: '' });

    try {
      const result = await api.assignSupervisorToGroup(
        assignmentForm.groupId,
        assignmentForm.supervisorId
      );

      await fetchData();

      setAssignmentMessage({
        type: 'success',
        text: `Assigned ${getDisplayName(supervisor)} to ${
          group?.name || 'the group'
        }. Updated ${result.updatedStudentsCount} ${
          result.updatedStudentsCount === 1 ? 'student' : 'students'
        }.`,
      });
    } catch (error) {
      console.error('Error assigning supervisor:', error);
      setAssignmentMessage({
        type: 'error',
        text: error.message || 'Failed to assign supervisor.',
      });
    } finally {
      setSavingAction('');
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();

    if (!form.name.trim() || !form.leader_id) {
      alert('Group name and leader are required.');
      return;
    }

    setSavingAction('create');
    try {
      await api.createGroup({
        name: form.name.trim(),
        description: form.description.trim(),
        leader_id: form.leader_id,
        member_ids: form.member_ids,
      });
      setForm({
        name: '',
        description: '',
        leader_id: '',
        member_ids: [],
      });
      await fetchData();
    } catch (error) {
      console.error('Error creating group:', error);
      alert('Failed to create group: ' + error.message);
    } finally {
      setSavingAction('');
    }
  };

  const handleAddMember = async (groupId) => {
    const selectedUserId = memberSelections[groupId];

    if (!selectedUserId) return;

    setSavingAction(`add-${groupId}`);
    try {
      await api.addGroupMembers(groupId, [selectedUserId]);
      setMemberSelections((current) => ({ ...current, [groupId]: '' }));
      await fetchData();
    } catch (error) {
      console.error('Error adding group member:', error);
      alert('Failed to add member: ' + error.message);
    } finally {
      setSavingAction('');
    }
  };

  const handleRemoveMember = async (groupId, userId, memberName) => {
    const confirmed = window.confirm(`Remove ${memberName} from this group?`);

    if (!confirmed) return;

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
          <h1 className="group-management-title">Student Groups</h1>
          <p className="group-management-subtitle">
            Create clinic groups, assign leaders, and keep membership current.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="group-management-panel group-management-feedback">
          <Loader2 size={20} className="manage-users-loader" />
          <span>Loading groups...</span>
        </div>
      ) : (
        <div className="group-management-layout">
          <div className="group-management-side">
            <section className="group-management-panel">
              <div className="group-management-panel-header">
                <h2 className="group-management-panel-title">Create Group</h2>
              </div>

              <form onSubmit={handleCreateGroup} className="group-management-form">
                <label className="group-management-field">
                  <span>Group Name</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="group-management-input"
                    required
                  />
                </label>

                <label className="group-management-field">
                  <span>Description</span>
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    rows={4}
                    className="group-management-textarea"
                  />
                </label>

                <label className="group-management-field">
                  <span>Group Leader</span>
                  <select
                    value={form.leader_id}
                    onChange={(e) =>
                      setForm({ ...form, leader_id: e.target.value })
                    }
                    className="group-management-input"
                    required
                  >
                    <option value="">Select leader</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {getDisplayName(student)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="group-management-field">
                  <span>Members</span>
                  <div className="group-management-checkbox-list">
                    {students.length === 0 ? (
                      <div className="group-management-empty-inline">
                        No law students found.
                      </div>
                    ) : (
                      students.map((student) => (
                        <label
                          key={student.id}
                          className="group-management-checkbox-row"
                        >
                          <input
                            type="checkbox"
                            checked={form.member_ids.includes(student.id)}
                            onChange={() => toggleCreateMember(student.id)}
                          />
                          <span>{getDisplayName(student)}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingAction === 'create' || students.length === 0}
                  className="group-management-primary-button"
                >
                  {savingAction === 'create' ? (
                    <Loader2 size={16} className="manage-users-loader" />
                  ) : (
                    <Plus size={16} />
                  )}
                  {savingAction === 'create' ? 'Creating...' : 'Create Group'}
                </button>
              </form>
            </section>

            <section className="group-management-panel">
              <div className="group-management-panel-header">
                <h2 className="group-management-panel-title">Assign Supervisor</h2>
              </div>

              <form
                onSubmit={handleAssignSupervisor}
                className="group-management-form"
              >
                <label className="group-management-field">
                  <span>Group</span>
                  <select
                    value={assignmentForm.groupId}
                    onChange={(e) => handleAssignmentGroupChange(e.target.value)}
                    className="group-management-input"
                    disabled={groups.length === 0 || savingAction === 'assign-supervisor'}
                    required
                  >
                    <option value="">Select group</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.supervisor_name
                          ? `${group.name} - ${group.supervisor_name}`
                          : group.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="group-management-field">
                  <span>Supervisor</span>
                  <select
                    value={assignmentForm.supervisorId}
                    onChange={(e) =>
                      handleAssignmentSupervisorChange(e.target.value)
                    }
                    className="group-management-input"
                    disabled={
                      supervisors.length === 0 ||
                      savingAction === 'assign-supervisor'
                    }
                    required
                  >
                    <option value="">
                      {supervisors.length
                        ? 'Select supervisor'
                        : 'No supervisors found'}
                    </option>
                    {supervisors.map((supervisor) => (
                      <option key={supervisor.id} value={supervisor.id}>
                        {getDisplayName(supervisor)}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedAssignmentGroup ? (
                  <div className="group-management-assignment-summary">
                    <UserCheck size={16} />
                    <span>
                      {selectedAssignmentGroup.supervisor_name
                        ? `Current supervisor: ${selectedAssignmentGroup.supervisor_name}`
                        : 'No supervisor assigned yet'}
                    </span>
                  </div>
                ) : null}

                {assignmentMessage.text ? (
                  <div
                    className={`group-management-assignment-message group-management-assignment-${assignmentMessage.type}`}
                  >
                    {assignmentMessage.text}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={
                    savingAction === 'assign-supervisor' ||
                    !assignmentForm.groupId ||
                    !assignmentForm.supervisorId
                  }
                  className="group-management-primary-button"
                >
                  {savingAction === 'assign-supervisor' ? (
                    <Loader2 size={16} className="manage-users-loader" />
                  ) : (
                    <UserCheck size={16} />
                  )}
                  {savingAction === 'assign-supervisor'
                    ? 'Assigning...'
                    : 'Assign Supervisor'}
                </button>
              </form>
            </section>
          </div>

          <section className="group-management-panel group-management-list-panel">
            <div className="group-management-panel-header">
              <h2 className="group-management-panel-title">Groups</h2>
              <span className="group-management-count">
                {groups.length} {groups.length === 1 ? 'group' : 'groups'}
              </span>
            </div>

            {groups.length === 0 ? (
              <div className="group-management-empty">
                <Users size={22} />
                <span>No groups created yet.</span>
              </div>
            ) : (
              <div className="group-management-list">
                {groups.map((group) => {
                  const memberIds = new Set(
                    (group.members || []).map((member) => member.user_id)
                  );
                  const availableMembers = students.filter(
                    (student) => !memberIds.has(student.id)
                  );
                  const isSavingStatus = savingAction === `status-${group.id}`;
                  const isAdding = savingAction === `add-${group.id}`;
                  const isChangingLeader = savingAction === `leader-${group.id}`;

                  return (
                    <article key={group.id} className="group-management-card">
                      <div className="group-management-card-header">
                        <div>
                          <div className="group-management-card-title-row">
                            <h3>{group.name}</h3>
                            <span
                              className={`group-management-status group-management-status-${group.status}`}
                            >
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
                          aria-label={`Set ${group.name} ${
                            group.status === 'active' ? 'inactive' : 'active'
                          }`}
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
                          onChange={(e) =>
                            handleLeaderChange(group.id, e.target.value)
                          }
                          disabled={isChangingLeader}
                          className="group-management-input"
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
                            <div
                              key={member.user_id}
                              className="group-management-member-row"
                            >
                              <div>
                                <span className="group-management-member-name">
                                  {member.user_name || member.user_email || 'Student'}
                                </span>
                                <span className="group-management-member-role">
                                  {isLeader ? 'Leader' : 'Member'}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveMember(
                                    group.id,
                                    member.user_id,
                                    member.user_name || 'this student'
                                  )
                                }
                                disabled={isLeader || savingAction === removeAction}
                                className="group-management-icon-button"
                                aria-label={`Remove ${
                                  member.user_name || 'student'
                                }`}
                                title={
                                  isLeader
                                    ? 'Assign another leader before removing'
                                    : 'Remove member'
                                }
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
                        <select
                          value={memberSelections[group.id] || ''}
                          onChange={(e) =>
                            setMemberSelections({
                              ...memberSelections,
                              [group.id]: e.target.value,
                            })
                          }
                          disabled={availableMembers.length === 0 || isAdding}
                          className="group-management-input"
                        >
                          <option value="">
                            {availableMembers.length
                              ? 'Select student to add'
                              : 'All students already added'}
                          </option>
                          {availableMembers.map((student) => (
                            <option key={student.id} value={student.id}>
                              {getDisplayName(student)}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => handleAddMember(group.id)}
                          disabled={!memberSelections[group.id] || isAdding}
                          className="group-management-secondary-button"
                        >
                          {isAdding ? (
                            <Loader2 size={16} className="manage-users-loader" />
                          ) : (
                            <UserPlus size={16} />
                          )}
                          Add
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
