import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Calendar, User, FileText, CheckCircle2, MessageSquare, Plus, Download, Send, Sparkles, Clock, UploadCloud, Loader2 } from 'lucide-react';
import { ProgressBar } from '../components/ui/ProgressBar';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/firebase';
import { doc, getDoc, collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { api } from '../api/apiClient';
export default function CaseDetail() {
    const { caseId } = useParams();
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState('overview');

    const [caseData, setCaseData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activities, setActivities] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [newActivity, setNewActivity] = useState({ description: '' }); // Simplified type
    const [isLogging, setIsLogging] = useState(false);
    
    const fileInputRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);

    // Fetch Case Detail
    useEffect(() => {
        if (!caseId) return;

        const fetchCaseData = async () => {
            try {
                const docRef = doc(db, 'cases', caseId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setCaseData({ id: docSnap.id, ...docSnap.data() });
                }
            } catch (err) {
                console.error("Error fetching case details:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchCaseData();
    }, [caseId]);

    // Fetch Activities
    useEffect(() => {
        if (!caseId) return;
        const q = query(
            collection(db, 'activities'),
            where('case_id', '==', caseId)
            // orderBy('date', 'desc') // Requires composite index, so sorted client-side for now
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const acts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            acts.sort((a, b) => (b.date?.toMillis() || 0) - (a.date?.toMillis() || 0));
            setActivities(acts);
        });
        return () => unsubscribe();
    }, [caseId]);

    // Fetch Documents
    useEffect(() => {
        if (!caseId) return;
        const q = query(
            collection(db, 'documents'),
            where('case_id', '==', caseId)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            docs.sort((a, b) => (b.upload_date?.toMillis() || 0) - (a.upload_date?.toMillis() || 0));
            setDocuments(docs);
        });
        return () => unsubscribe();
    }, [caseId]);

    const handleAddActivity = async (e) => {
        e.preventDefault();
        if (!newActivity.description.trim()) return;
        setIsLogging(true);
        try {
            await api.logActivity(caseId, { description: newActivity.description });
            setNewActivity({ description: '' });
        } catch (err) {
            console.error('Failed to log activity', err);
            alert('Failed to log activity: ' + err.message);
        } finally {
            setIsLogging(false);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        try {
            await api.uploadDocument(caseId, file);
        } catch (err) {
            console.error('Upload failed', err);
            alert('Failed to upload document: ' + err.message);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-500" size={32} /></div>;
    if (!caseData) return <div className="p-10 text-center text-slate-500">Case not found.</div>;

    return (
        <div className="flex flex-col gap-6 w-full animate-fade-in h-full">
            {/* Header */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-2 text-sm text-slate-500 font-medium">
                        <Link to="/" className="hover:text-blue-600 flex items-center transition-colors"><ChevronLeft size={16} /> Dashboard</Link>
                        <span>/</span>
                        <span>Case #{caseId}</span>
                    </div>
                    <h1 className="text-2xl font-bold flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-slate-800">
                        {caseData.client_name} - {caseData.case_type}
                        <div className="flex items-center gap-3">
                            <span className={`badge text-xs shadow-sm ${caseData.status === 'Closed' ? 'badge-success' : 'badge-warning'}`}>{caseData.status}</span>
                            <div className="hidden md:block w-px h-5 bg-slate-200"></div>
                            <ProgressBar currentStatus={(caseData.status || 'open').toLowerCase().replace(' ', '_')} className="min-w-[180px]" />
                        </div>
                    </h1>
                    <p className="text-muted mt-3 flex items-center gap-6 text-sm">
                        <span className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded"><User size={14} /> Client: {caseData.client_name}</span>
                        <span className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded"><FileText size={14} /> {caseData.date_opened?.toDate()?.toLocaleDateString() || 'N/A'}</span>
                    </p>
                </div>
                <div className="flex gap-3">
                    <button className="btn btn-secondary bg-white"><Plus size={16} /> Add Member</button>
                    <button className="btn btn-primary"><CheckCircle2 size={16} /> Mark Status</button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-8 border-b border-slate-200 mt-2 px-2 overflow-x-auto hide-scrollbar">
                {['overview', 'activity log', 'documents', 'ai workspace'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`pb-4 font-semibold text-sm transition-colors border-b-2 capitalize whitespace-nowrap ${activeTab === tab ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden flex flex-col pt-2 min-h-[500px]">
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-slide-up">
                        <div className="lg:col-span-2 flex flex-col gap-6">
                            <div className="card h-full">
                                <h2 className="text-lg font-semibold mb-4 text-slate-800">Case Summary</h2>
                                <p className="text-slate-700 text-sm leading-relaxed mb-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
                                    <strong>Offence:</strong> {caseData.offence || 'Not specified'}
                                </p>
                                <h3 className="font-semibold text-sm mt-2 mb-3 text-slate-800">Key Legal Issues</h3>
                                <ul className="list-disc pl-5 text-sm text-slate-600 space-y-2">
                                    <li>Reliability of single eyewitness testimony under Nigerian Evidence Act.</li>
                                    <li>Verification of medical clinic alibi.</li>
                                </ul>
                            </div>
                        </div>

                        <div className="flex flex-col gap-6">
                            <div className="card bg-blue-50/80 border-blue-100 shadow-sm">
                                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-blue-900"><Calendar size={20} /> Milestone Dates</h2>
                                <div className="space-y-4">
                                    <div className="p-3 bg-white rounded flex justify-between items-center shadow-sm border border-slate-100">
                                        <p className="text-xs text-slate-500 font-medium">Bail Hearing</p>
                                        <p className="text-sm font-semibold text-slate-800">Oct 12, 2026</p>
                                    </div>
                                    <div className="p-3 bg-white rounded flex justify-between items-center shadow-sm border border-slate-100">
                                        <p className="text-xs text-slate-500 font-medium">Pleading Submission</p>
                                        <p className="text-sm font-semibold text-amber-600">Oct 25, 2026</p>
                                    </div>
                                </div>
                            </div>

                            <div className="card">
                                <h2 className="text-lg font-semibold mb-4 text-slate-800">Assigned Team</h2>
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">D</div>
                                        <div>
                                            <p className="text-sm font-semibold text-slate-800">Dr. Admin</p>
                                            <p className="text-xs text-slate-500 font-medium">Supervisor</p>
                                        </div>
                                    </div>
                                    <div className="w-full h-px bg-slate-100"></div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">J</div>
                                        <div>
                                            <p className="text-sm font-semibold text-slate-800">Jane Student</p>
                                            <p className="text-xs text-blue-600 font-medium">Lead Student</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'ai workspace' && (
                    <div className="flex flex-col lg:flex-row gap-6 h-[650px] animate-slide-up">
                        {/* Chat Left */}
                        <div className="w-full lg:w-1/3 card p-0 flex flex-col border border-blue-100 shadow-sm overflow-hidden bg-white">
                            <div className="p-4 border-b border-blue-100 bg-blue-50/50 flex justify-between items-center">
                                <h3 className="font-semibold flex items-center gap-2 text-blue-900"><MessageSquare size={18} className="text-blue-600" /> Gemini Assistant</h3>
                                <button className="btn btn-ghost text-xs py-1 px-2 border border-slate-200 bg-white hover:bg-slate-50">Clear</button>
                            </div>

                            <div className="flex-1 p-4 bg-slate-50/50 overflow-y-auto flex flex-col gap-5">
                                {/* Chat Bubble AI */}
                                <div className="flex gap-2 w-full">
                                    <div className="w-6 h-6 rounded bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex justify-center items-center shrink-0 shadow-sm mt-1 text-xs"><Sparkles size={12} /></div>
                                    <div className="bg-white p-3.5 rounded-2xl border border-slate-100 text-sm shadow-[0_2px_8px_-4px_rgba(0,0,0,0.1)] rounded-tl-sm text-slate-700 leading-relaxed">
                                        <p>Hello! I have the context for <strong>Adebayo v. State</strong>. How can I assist you today?</p>
                                    </div>
                                </div>

                                {/* Chat Bubble User */}
                                <div className="flex gap-2 w-full flex-row-reverse">
                                    <div className="bg-blue-600 text-white p-3.5 rounded-2xl text-sm shadow-md shadow-blue-200 rounded-tr-sm">
                                        <p>Generate 5 key interview questions for the alibi witness.</p>
                                    </div>
                                </div>

                                {/* Chat Bubble AI */}
                                <div className="flex gap-2 w-full pb-4">
                                    <div className="w-6 h-6 rounded bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex justify-center items-center shrink-0 shadow-sm mt-1 text-xs"><Sparkles size={12} /></div>
                                    <div className="bg-white p-4 rounded-2xl border border-slate-100 text-sm shadow-[0_2px_8px_-4px_rgba(0,0,0,0.1)] rounded-tl-sm text-slate-700 w-full">
                                        <p className="mb-3 font-medium">Here are 5 questions to establish the alibi:</p>
                                        <ol className="list-decimal pl-4 space-y-2 mb-4">
                                            <li>What exact time did Mr. Adebayo arrive at the clinic?</li>
                                            <li>Can you describe the procedures he underwent?</li>
                                            <li>Who else was present at the clinic during his visit?</li>
                                            <li>Did he sign any register upon entry?</li>
                                            <li>How long did he stay in the waiting area?</li>
                                        </ol>
                                        <div className="pt-3 border-t border-slate-100 flex justify-end">
                                            <button className="text-xs text-blue-600 font-semibold flex items-center gap-1.5 hover:text-blue-800 transition-colors bg-blue-50 px-2 py-1 rounded">
                                                <Plus size={14} /> Add to Editor
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-3 bg-white border-t border-slate-200">
                                <div className="relative flex items-center">
                                    <input type="text" placeholder="Message Gemini..." className="input-field py-2.5 pr-10 w-full text-sm bg-slate-50 border-slate-200 rounded-xl focus:bg-white" />
                                    <button className="absolute right-2 text-blue-600 hover:text-blue-800 p-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                                        <Send size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Editor Right */}
                        <div className="w-full lg:w-2/3 card flex flex-col p-0 shadow-sm overflow-hidden border-slate-200">
                            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex justify-between items-center backdrop-blur-sm">
                                <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2"><FileText size={16} className="text-slate-400" /> Draft: Interview Notes</h3>
                                <div className="flex gap-2">
                                    <button className="btn btn-ghost text-xs h-8 bg-white border border-slate-200">Save</button>
                                    <button className="btn btn-secondary text-xs h-8 bg-white"><Download size={14} /> Export</button>
                                </div>
                            </div>
                            <div className="flex-1 px-8 py-6 relative bg-white">
                                <textarea
                                    className="w-full h-full resize-none outline-none text-slate-800 leading-[1.8] font-serif tracking-wide"
                                    placeholder="Start typing draft here..."
                                    defaultValue="INTERVIEW SCRIPT: ALIBI WITNESS&#10;Date: __/__/____&#10;&#10;1. What exact time did Mr. Adebayo arrive at the clinic?&#10;2. Can you describe the procedures he underwent?&#10;3. Who else was present at the clinic during his visit?&#10;4. Did he sign any register upon entry?&#10;5. How long did he stay in the waiting area?"
                                ></textarea>
                                <div className="absolute bottom-4 right-6 text-xs text-slate-400 font-medium flex items-center gap-1"><CheckCircle2 size={12} /> Auto-saved just now</div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'activity log' && (
                    <div className="flex flex-col gap-6 animate-slide-up pb-8">
                        <div className="card bg-white shadow-sm border border-slate-200">
                            <h2 className="text-lg font-semibold mb-4 text-slate-800">Log New Activity</h2>
                            <form onSubmit={handleAddActivity} className="flex flex-col gap-4">
                                <div className="input-group">
                                    <label className="input-label" htmlFor="activityDesc">Description / Notes</label>
                                    <textarea
                                        id="activityDesc"
                                        required
                                        rows={3}
                                        placeholder="What happened? Or add your reflection..."
                                        className="input-field resize-none"
                                        value={newActivity.description}
                                        onChange={e => setNewActivity({ ...newActivity, description: e.target.value })}
                                        disabled={isLogging}
                                    ></textarea>
                                </div>
                                <div className="flex justify-end">
                                    <button type="submit" disabled={isLogging} className="btn btn-primary">
                                        {isLogging ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} 
                                        {isLogging ? 'Logging...' : 'Log Activity'}
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div className="card bg-white shadow-sm flex-1 border border-slate-200">
                            <h2 className="text-lg font-semibold mb-4 text-slate-800">Activity Timeline</h2>
                            <div className="flex flex-col gap-4 relative">
                                <div className="absolute left-[19px] top-4 bottom-4 w-px bg-slate-200"></div>
                                {activities.length === 0 && <p className="p-4 text-center text-slate-500">No activities logged yet.</p>}
                                {activities.map(activity => (
                                    <div key={activity.id} className="flex gap-4 relative z-10 hover:bg-slate-50/50 p-2 -mx-2 rounded-xl transition-colors">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-4 border-white shadow-sm bg-blue-100 text-blue-600`}>
                                            <Clock size={16} />
                                        </div>
                                        <div className="bg-white border border-slate-100 shadow-sm rounded-xl p-4 flex-1">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700`}>Log</span>
                                                    <span className="text-sm font-semibold text-slate-800">You</span>
                                                </div>
                                                <span className="text-xs text-slate-500 font-medium bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                                    {activity.date?.toDate()?.toLocaleString() || 'Just now'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-700 leading-relaxed">{activity.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'documents' && (
                    <div className="flex flex-col gap-6 animate-slide-up pb-8">
                        <div 
                            className="card bg-slate-50 border-dashed border-2 flex flex-col items-center justify-center p-8 transition-colors hover:bg-blue-50/30 hover:border-blue-200 cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input 
                                type="file" 
                                className="hidden" 
                                ref={fileInputRef} 
                                onChange={handleFileUpload} 
                                disabled={isUploading}
                            />
                            {isUploading ? (
                                <div className="flex flex-col items-center">
                                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-slate-100 text-blue-600 animate-pulse">
                                        <Loader2 size={28} className="animate-spin" />
                                    </div>
                                    <h3 className="font-semibold text-slate-800 mb-1">Uploading Document...</h3>
                                </div>
                            ) : (
                                <>
                                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-slate-100 text-blue-600">
                                        <UploadCloud size={28} />
                                    </div>
                                    <h3 className="font-semibold text-slate-800 mb-1">Upload New Document</h3>
                                    <p className="text-sm text-slate-500 mb-4">Click to browse files (Max 5MB)</p>
                                    <button className="btn btn-primary shadow-sm"><Plus size={16} /> Select Files</button>
                                </>
                            )}
                        </div>

                        <div className="card shadow-sm bg-white border border-slate-200">
                            <h2 className="text-lg font-semibold mb-4 text-slate-800">Case Documents Files</h2>
                            <div className="flex flex-col gap-3">
                                {documents.length === 0 && <p className="p-4 text-center text-slate-500 border border-dashed rounded bg-slate-50/50">No documents uploaded yet.</p>}
                                {documents.map(doc => (
                                    <div key={doc.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors group bg-white shadow-sm">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-100/50">
                                                <FileText size={20} />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-sm text-slate-800 group-hover:text-blue-600 transition-colors">{doc.name}</p>
                                                <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                                    <span className="font-medium bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{Math.round((doc.size || 0) / 1024)} KB</span>
                                                    <span>Uploaded: {doc.upload_date?.toDate()?.toLocaleString() || 'Just now'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <a href={doc.file_path} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100">
                                            <Download size={18} />
                                        </a>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
