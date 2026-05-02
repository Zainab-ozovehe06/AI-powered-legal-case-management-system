import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../api/apiClient';

export default function ManageUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await api.getUsers();

      data.sort((a, b) => {
        const nameA = (a.name || a.email || '').toLowerCase();
        const nameB = (b.name || b.email || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });

      setUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
      alert('Failed to fetch users: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId, newRole) => {
    try {
      setSavingUserId(userId);
      await api.updateUser(userId, { role: newRole });
      await fetchUsers();
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Failed to update role: ' + error.message);
    } finally {
      setSavingUserId(null);
    }
  };

  const handleStatusToggle = async (userId, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';

    try {
      setSavingUserId(userId);
      await api.updateUser(userId, { status: newStatus });
      await fetchUsers();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status: ' + error.message);
    } finally {
      setSavingUserId(null);
    }
  };

  const getRoleBadgeClass = (role) => {
    if (role === 'admin') return 'manage-users-role-admin';
    if (role === 'supervisor') return 'manage-users-role-supervisor';
    if (role === 'lawyer') return 'manage-users-role-lawyer';
    return 'manage-users-role-student';
  };

  const getStatusBadgeClass = (status) => {
    return status === 'active'
      ? 'manage-users-status-active'
      : 'manage-users-status-inactive';
  };

  return (
    <div className="manage-users-page animate-fade-in">
      <div className="manage-users-hero">
        <h1 className="manage-users-title">Users</h1>
      </div>

      <section className="manage-users-panel">
        <div className="manage-users-panel-header">
          <h2 className="manage-users-panel-title">System Users</h2>
        </div>

        {loading ? (
          <div className="manage-users-feedback">
            <Loader2 size={20} className="manage-users-loader" />
            <span>Loading users...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="manage-users-empty">
            <p>No users found</p>
          </div>
        ) : (
          <div className="manage-users-table-shell">
            <table className="manage-users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isSaving = savingUserId === user.id;
                  const currentStatus = user.status || 'inactive';

                  return (
                    <tr key={user.id}>
                      <td>
                        <span className="manage-users-name">
                          {user.name || 'Unnamed User'}
                        </span>
                      </td>

                      <td>
                        <span className="manage-users-email">
                          {user.email || 'No email'}
                        </span>
                      </td>

                      <td>
                        <select
                          value={user.role || 'law_student'}
                          onChange={(e) =>
                            handleRoleChange(user.id, e.target.value)
                          }
                          disabled={isSaving}
                          className={`manage-users-role-select ${getRoleBadgeClass(
                            user.role
                          )}`}
                        >
                          <option value="law_student">Law Student</option>
                          <option value="admin">Admin</option>
                          <option value="supervisor">Supervisor</option>
                          <option value="lawyer">Lawyer</option>
                        </select>
                      </td>

                      <td>
                        <button
                          type="button"
                          onClick={() =>
                            handleStatusToggle(user.id, currentStatus)
                          }
                          disabled={isSaving}
                          aria-label={`${
                            currentStatus === 'active' ? 'Deactivate' : 'Activate'
                          } ${user.name || user.email || 'user'}`}
                          title={
                            currentStatus === 'active'
                              ? 'Deactivate user'
                              : 'Activate user'
                          }
                          className={`manage-users-status-button ${getStatusBadgeClass(
                            currentStatus
                          )}`}
                        >
                          {isSaving ? (
                            <>
                              <Loader2 size={14} className="manage-users-loader" />
                              <span>Saving</span>
                            </>
                          ) : (
                            <>
                              <span className="manage-users-status-dot" />
                              <span>{currentStatus}</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
