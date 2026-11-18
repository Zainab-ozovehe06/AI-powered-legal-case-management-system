import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Plus,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { api } from '../api/apiClient';
import { Link } from 'react-router-dom';
import { useUnits } from '../context/UnitsContext';

const getDisplayName = (user) =>
  user?.name || user?.displayName || user?.email || 'Unnamed user';

export default function GroupManagement() {
  const { refresh: refreshUnits } = useUnits();
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingAction, setSavingAction] = useState('');
  const [memberForm, setMemberForm] = useState({ groupId: '', userId: '' });
  const [memberMessage, setMemberMessage] = useState({ type: '', text: '' });
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
  const eligibleMembers = useMemo(() => users.filter((user) => ['law_student', 'lawyer'].includes(user.role))
    .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b))), [users]);
  const selectedMemberGroup = useMemo(
    () => groups.find((group) => group.id === memberForm.groupId) || null,
    [groups, memberForm.groupId]
  );
  const availableMembers = useMemo(() => {
    if (!selectedMemberGroup) return [];
    const memberIds = new Set(
      (selectedMemberGroup.members || []).map((member) => member.user_id)
    );
    return eligibleMembers.filter((user) => !memberIds.has(user.id));
  }, [eligibleMembers, selectedMemberGroup]);

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

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!memberForm.groupId || !memberForm.userId) return;

    const member = availableMembers.find((user) => user.id === memberForm.userId);
    setSavingAction('add-member');
    setMemberMessage({ type: '', text: '' });
    try {
      await api.addGroupMembers(memberForm.groupId, [memberForm.userId]);
      setMemberForm((current) => ({ ...current, userId: '' }));
      await fetchData();
      setMemberMessage({
        type: 'success',
        text: `Added ${getDisplayName(member)} to ${selectedMemberGroup.name}.`,
      });
    } catch (error) {
      console.error('Error adding group member:', error);
      setMemberMessage({
        type: 'error',
        text: error.message || 'Failed to add member.',
      });
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
            Create clinic groups, add students or lawyers, and assign supervisors.
          </p>
        </div>
        <Link to="/admin/groups/list" className="group-management-secondary-button">
          <Users size={16} />
          List of units
        </Link>
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
                    {eligibleMembers.length === 0 ? (
                      <div className="group-management-empty-inline">
                        No students or lawyers found.
                      </div>
                    ) : (
                      eligibleMembers.map((student) => (
                        <label
                          key={student.id}
                          className="group-management-checkbox-row"
                        >
                          <input
                            type="checkbox"
                            checked={form.member_ids.includes(student.id)}
                            onChange={() => toggleCreateMember(student.id)}
                          />
                          <span>{getDisplayName(student)} ({student.role === 'lawyer' ? 'Lawyer' : 'Student'})</span>
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

          </div>

          <div className="group-management-side">
            <section className="group-management-panel">
              <div className="group-management-panel-header">
                <h2 className="group-management-panel-title">Add Student or Lawyer</h2>
              </div>

              <form onSubmit={handleAddMember} className="group-management-form">
                <label className="group-management-field">
                  <span>Group</span>
                  <select
                    value={memberForm.groupId}
                    onChange={(e) => {
                      setMemberForm({ groupId: e.target.value, userId: '' });
                      setMemberMessage({ type: '', text: '' });
                    }}
                    className="group-management-input"
                    disabled={groups.length === 0 || savingAction === 'add-member'}
                    required
                  >
                    <option value="">{groups.length ? 'Select group' : 'No groups created yet'}</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                  </select>
                </label>

                <label className="group-management-field">
                  <span>Student or Lawyer</span>
                  <select
                    value={memberForm.userId}
                    onChange={(e) => {
                      setMemberForm((current) => ({ ...current, userId: e.target.value }));
                      setMemberMessage({ type: '', text: '' });
                    }}
                    className="group-management-input"
                    disabled={availableMembers.length === 0 || savingAction === 'add-member'}
                    required
                  >
                    <option value="">
                      {!selectedMemberGroup
                        ? 'Select a group first'
                        : availableMembers.length
                          ? 'Select student or lawyer to add'
                          : 'All eligible members already added'}
                    </option>
                    {availableMembers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {getDisplayName(user)} ({user.role === 'lawyer' ? 'Lawyer' : 'Student'})
                      </option>
                    ))}
                  </select>
                </label>

                {memberMessage.text ? (
                  <div
                    role={memberMessage.type === 'error' ? 'alert' : 'status'}
                    className={`group-management-assignment-message group-management-assignment-${memberMessage.type}`}
                  >
                    {memberMessage.text}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={savingAction === 'add-member' || !memberForm.groupId || !memberForm.userId}
                  className="group-management-primary-button"
                >
                  {savingAction === 'add-member' ? (
                    <Loader2 size={16} className="manage-users-loader" />
                  ) : (
                    <UserPlus size={16} />
                  )}
                  {savingAction === 'add-member' ? 'Adding...' : 'Add Member'}
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

        </div>
      )}
    </div>
  );
}
