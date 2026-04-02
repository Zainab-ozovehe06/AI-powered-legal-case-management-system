import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, X } from 'lucide-react';

export default function CalendarView() {
    const [events, setEvents] = useState([
        { id: 1, title: 'Bail Hearing - Adebayo', date: 12, case: 'Adebayo v. State', time: '10:00 AM' },
        { id: 2, title: 'Client Meeting - Okafor', date: 15, case: 'Okafor Property', time: '02:00 PM' }
    ]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newEvent, setNewEvent] = useState({ title: '', date: '', case: '', time: '' });

    // Mock cases
    const cases = ['Adebayo v. State', 'Okafor Property', 'State v. Mensah'];

    // Generate days (simplified for September 2026)
    const days = Array.from({ length: 30 }, (_, i) => i + 1);
    const startOffset = 2; // Sept 1, 2026 is a Tuesday (0=Sun, 1=Mon, 2=Tue)

    const handleAddEvent = (e) => {
        e.preventDefault();
        if (!newEvent.title || !newEvent.date || !newEvent.case) return;
        const eventDate = parseInt(newEvent.date.split('-')[2]); // Just extracting the day for mock purpose
        setEvents([...events, { id: Date.now(), title: newEvent.title, date: eventDate || 20, case: newEvent.case, time: newEvent.time || '12:00 PM' }]);
        setIsModalOpen(false);
        setNewEvent({ title: '', date: '', case: '', time: '' });
    };

    return (
        <div className="flex flex-col h-full animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Calendar</h1>
                    <p className="text-slate-500 text-sm">Schedule events and reminders for your cases.</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="btn btn-primary shadow-sm hover:shadow-md transition-shadow">
                    <Plus size={18} /> Add Event
                </button>
            </div>

            <div className="card flex-1 flex flex-col bg-white border border-slate-200 p-0 overflow-hidden">
                {/* Calendar Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                        <CalendarIcon size={20} className="text-blue-600" /> September 2026
                    </h2>
                    <div className="flex gap-2">
                        <button className="p-1.5 rounded-lg bg-white border border-slate-200 shadow-sm hover:bg-slate-50 text-slate-600 transition-colors"><ChevronLeft size={18} /></button>
                        <button className="p-1.5 rounded-lg bg-white border border-slate-200 shadow-sm hover:bg-slate-50 text-slate-600 transition-colors"><ChevronRight size={18} /></button>
                    </div>
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-px bg-slate-200 flex-1">
                    {/* Days of week */}
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="bg-white py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">{day}</div>
                    ))}

                    {/* Empty slots */}
                    {Array.from({ length: startOffset }).map((_, i) => (
                        <div key={`empty-${i}`} className="bg-slate-50/50 min-h-[120px] p-2"></div>
                    ))}

                    {/* Days */}
                    {days.map(day => {
                        const dayEvents = events.filter(e => e.date === day);
                        const isToday = day === 20; // Mock today
                        return (
                            <div key={day} className={`bg-white min-h-[120px] p-2 hover:bg-slate-50/50 transition-colors cursor-pointer group relative ${isToday ? 'bg-blue-50/10' : ''}`}>
                                <span className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-sm font-medium mb-1.5 ${isToday ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 group-hover:bg-slate-100'}`}>
                                    {day}
                                </span>
                                <div className="flex flex-col gap-1.5 mt-1 overflow-y-auto max-h-[80px] hide-scrollbar">
                                    {dayEvents.map(event => (
                                        <div key={event.id} className="text-[11px] leading-tight px-2 py-1.5 bg-blue-50 text-blue-700 rounded border border-blue-100/50 shadow-[0_1px_2px_rgba(0,0,0,0.02)] font-medium" title={`${event.time} - ${event.title}`}>
                                            <span className="opacity-75 font-semibold block mb-0.5">{event.time}</span>
                                            <span className="truncate block">{event.title}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Add Event Modal */}
            {isModalOpen && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden flex flex-col relative bottom-10">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h2 className="text-lg font-bold text-slate-800">Create Event / Reminder</h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 ml-auto text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6">
                            <form id="add-event-form" onSubmit={handleAddEvent} className="flex flex-col gap-5">
                                <div className="input-group">
                                    <label className="input-label">Event Title</label>
                                    <input type="text" required className="input-field" placeholder="e.g. Follow-up Call" value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Related Case</label>
                                    <select required className="input-field bg-white" value={newEvent.case} onChange={e => setNewEvent({ ...newEvent, case: e.target.value })}>
                                        <option value="">-- Select Case --</option>
                                        {cases.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="flex gap-4">
                                    <div className="input-group flex-1">
                                        <label className="input-label">Date</label>
                                        <input type="date" required className="input-field text-slate-700" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} />
                                    </div>
                                    <div className="input-group flex-1">
                                        <label className="input-label">Time</label>
                                        <input type="time" className="input-field text-slate-700" value={newEvent.time} onChange={e => setNewEvent({ ...newEvent, time: e.target.value })} />
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary bg-white">Cancel</button>
                            <button type="submit" form="add-event-form" className="btn btn-primary"><Plus size={16} /> Save Event</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
