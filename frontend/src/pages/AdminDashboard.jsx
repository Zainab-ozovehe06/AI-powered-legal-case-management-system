import { Users, AlertTriangle, TrendingUp, BarChart } from 'lucide-react';

export default function AdminDashboard() {
    return (
        <div className="flex flex-col gap-6 w-full animate-fade-in">
            <div className="flex justify-between items-center mb-2">
                <h1 className="text-2xl font-bold text-slate-800">Clinic Overview</h1>
                <button className="btn btn-primary bg-slate-800 hover:bg-slate-900 border-none">Generate Report</button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { title: 'Total Active Cases', value: '34', icon: <TrendingUp size={20} />, color: 'text-blue-600', bg: 'bg-blue-100' },
                    { title: 'Pending Reviews', value: '12', icon: <AlertTriangle size={20} />, color: 'text-amber-600', bg: 'bg-amber-100' },
                    { title: 'Total Students', value: '128', icon: <Users size={20} />, color: 'text-indigo-600', bg: 'bg-indigo-100' },
                    { title: 'Success Rate (30d)', value: '92%', icon: <BarChart size={20} />, color: 'text-emerald-600', bg: 'bg-emerald-100' },
                ].map((stat, i) => (
                    <div key={i} className="card p-5 flex items-center justify-between border-slate-100">
                        <div>
                            <p className="text-sm font-medium text-muted mb-1">{stat.title}</p>
                            <h3 className="text-3xl font-bold text-slate-800">{stat.value}</h3>
                        </div>
                        <div className={`w-12 h-12 rounded-full ${stat.bg} ${stat.color} flex items-center justify-center`}>
                            {stat.icon}
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">

                {/* User Management */}
                <div className="lg:col-span-2 card">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-semibold text-slate-800">User Management</h2>
                        <div className="flex gap-2">
                            <input type="text" placeholder="Search users..." className="input-field py-1.5 px-3 text-sm h-9 w-48" />
                            <button className="btn btn-secondary text-sm h-9">Filter</button>
                        </div>
                    </div>

                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th className="text-center">Assigned Cases</th>
                                    <th className="text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    { name: 'Dr. Admin', role: 'admin', status: 'Active', cases: '-' },
                                    { name: 'Jane Student', role: 'student', status: 'Active', cases: '2' },
                                    { name: 'John Doe', role: 'student', status: 'Inactive', cases: '0' },
                                    { name: 'Prof. Smith', role: 'supervisor', status: 'Active', cases: '8' },
                                ].map((u, i) => (
                                    <tr key={i}>
                                        <td className="font-medium text-sm text-slate-800">{u.name}</td>
                                        <td><span className={`badge ${u.role === 'admin' ? 'badge-primary' : u.role === 'supervisor' ? 'badge-warning' : 'badge-neutral'} uppercase`}>{u.role}</span></td>
                                        <td><span className={`badge ${u.status === 'Active' ? 'badge-success' : 'badge-danger'}`}>{u.status}</span></td>
                                        <td className="text-sm text-center text-slate-600 font-medium">{u.cases}</td>
                                        <td className="text-right">
                                            <button className="text-blue-600 hover:text-blue-800 text-xs font-semibold">Edit</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* System Alerts */}
                <div className="card border-red-100 bg-red-50/10 h-full">
                    <h2 className="text-lg font-semibold flex items-center gap-2 mb-5 text-slate-800"><AlertTriangle className="text-red-500" size={20} /> System Alerts</h2>
                    <div className="flex flex-col gap-3">
                        {[
                            "Case #102 stalled > 14 days without update",
                            "3 Deadlines missed this week across teams",
                            "Server maintenance scheduled at 2AM EST"
                        ].map((msg, i) => (
                            <div key={i} className="p-3.5 bg-white rounded-lg border border-red-100 text-sm flex gap-3 items-start shadow-sm hover:border-red-200 transition-colors cursor-default">
                                <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0"></div>
                                <span className="text-slate-700 leading-snug">{msg}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
