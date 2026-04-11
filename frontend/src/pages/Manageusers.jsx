import { useEffect, useState } from 'react';
import { Loader2, UserCog } from 'lucide-react';
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
    if (role === 'admin') return 'bg-purple-50 text-purple-700 border border-purple-200';
    if (role === 'supervisor') return 'bg-amber-50 text-amber-700 border border-amber-200';
    if (role === 'lawyer') return 'bg-blue-50 text-blue-700 border border-blue-200';
    return 'bg-slate-50 text-slate-700 border border-slate-200';
  };

  const getStatusBadgeClass = (status) => {
    return status === 'active'
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      : 'bg-red-50 text-red-700 border border-red-200';
  };

  return (
    <div className="w-full min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <UserCog size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Admin workspace</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                Manage Users
              </h1>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-5">
          {loading ? (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-8 text-center text-slate-500 flex items-center justify-center gap-2">
              <Loader2 size={18} className="animate-spin" />
              Loading users...
            </div>
          ) : users.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-300 p-8 text-center">
              <p className="text-slate-600 font-medium">No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-3">
                <thead>
                  <tr className="text-left text-sm text-slate-500">
                    <th className="px-3">Name</th>
                    <th className="px-3">Email</th>
                    <th className="px-3">Role</th>
                    <th className="px-3">Status</th>
                    <th className="px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const isSaving = savingUserId === user.id;

                    return (
                      <tr key={user.id} className="bg-slate-50">
                        <td className="px-3 py-4 rounded-l-2xl">
                          <p className="font-medium text-slate-900">
                            {user.name || 'Unnamed User'}
                          </p>
                        </td>

                        <td className="px-3 py-4 text-sm text-slate-600">
                          {user.email || 'No email'}
                        </td>

                        <td className="px-3 py-4">
                          <div className="flex flex-col gap-2">
                            <span
                              className={`inline-flex w-fit px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getRoleBadgeClass(
                                user.role
                              )}`}
                            >
                              {user.role || 'unknown'}
                            </span>

                            <select
                              value={user.role || 'law_student'}
                              onChange={(e) =>
                                handleRoleChange(user.id, e.target.value)
                              }
                              disabled={isSaving}
                              className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            >
                              <option value="law_student">Law Student</option>
                              <option value="admin">Admin</option>
                              <option value="supervisor">Supervisor</option>
                              <option value="lawyer">Lawyer</option>
                            </select>
                          </div>
                        </td>

                        <td className="px-3 py-4">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getStatusBadgeClass(
                              user.status
                            )}`}
                          >
                            {user.status || 'inactive'}
                          </span>
                        </td>

                        <td className="px-3 py-4 rounded-r-2xl">
                          <button
                            type="button"
                            onClick={() =>
                              handleStatusToggle(user.id, user.status || 'inactive')
                            }
                            disabled={isSaving}
                            className={`inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-medium transition-colors ${
                              (user.status || 'inactive') === 'active'
                                ? 'bg-red-600 text-white hover:bg-red-700'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                            }`}
                          >
                            {isSaving
                              ? 'Saving...'
                              : (user.status || 'inactive') === 'active'
                              ? 'Deactivate'
                              : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}