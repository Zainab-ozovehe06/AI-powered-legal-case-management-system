import React, { useState } from 'react';
import { MessageSquare, X, Send, Sparkles, Maximize2, Minimize2 } from 'lucide-react';

export const AIAssistantWidget = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [messages, setMessages] = useState([
        { id: 1, text: "Hi! I'm Gemini, your AI legal assistant. How can I help you with your cases today?", sender: 'ai' }
    ]);
    const [inputValue, setInputValue] = useState('');

    const handleSend = (e) => {
        e.preventDefault();
        if (!inputValue.trim()) return;

        const userMsg = { id: Date.now(), text: inputValue, sender: 'user' };
        setMessages(prev => [...prev, userMsg]);
        setInputValue('');

        // Mock AI response
        setTimeout(() => {
            const aiMsg = { id: Date.now() + 1, text: "I've noted that. Let me look up relevant precedents or draft that document for you.", sender: 'ai' };
            setMessages(prev => [...prev, aiMsg]);
        }, 1000);
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 z-50 p-4 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all flex items-center justify-center animate-bounce-in"
                title="Open AI Assistant"
            >
                <Sparkles size={24} />
            </button>
        );
    }

    return (
        <div className={`fixed bottom-6 right-6 z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'w-[600px] h-[700px]' : 'w-[350px] h-[500px]'}`}>
            {/* Header */}
            <div className="p-4 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex justify-between items-center shadow-md z-10">
                <div className="flex items-center gap-2">
                    <Sparkles size={18} />
                    <span className="font-semibold tracking-wide">Gemini Assistant</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-white/90 hover:text-white">
                        {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>
                    <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-white/90 hover:text-white">
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 p-4 bg-slate-50 overflow-y-auto flex flex-col gap-4 relative">
                {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
                        <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white border border-slate-100 text-slate-700 rounded-tl-sm'}`}>
                            {msg.text}
                        </div>
                    </div>
                ))}
            </div>

            {/* Input Area */}
            <div className="p-3 bg-white border-t border-slate-100 pb-4">
                <form onSubmit={handleSend} className="relative flex items-center">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Ask Gemini..."
                        className="w-full py-3 pl-4 pr-12 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700"
                    />
                    <button
                        type="submit"
                        disabled={!inputValue.trim()}
                        className="absolute right-2 p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                    >
                        <Send size={18} />
                    </button>
                </form>
            </div>
        </div>
    );
};
