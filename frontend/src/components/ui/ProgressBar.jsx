import React from 'react';
import { Check } from 'lucide-react';

const steps = [
    { id: 'open', label: 'Open' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'closed', label: 'Closed' }
];

export const ProgressBar = ({ currentStatus = 'open', className = '' }) => {
    // Determine active step index
    const currentIndex = steps.findIndex(s => s.id === currentStatus);
    const activeIndex = currentIndex === -1 ? 0 : currentIndex;

    return (
        <div className={`flex items-center w-full max-w-sm ${className}`}>
            {steps.map((step, index) => {
                const isCompleted = index < activeIndex;
                const isActive = index === activeIndex;

                return (
                    <React.Fragment key={step.id}>
                        {/* Step Node */}
                        <div className="relative flex flex-col items-center group">
                            <div
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold z-10 transition-all duration-300
                  ${isCompleted ? 'bg-emerald-500 text-white shadow-sm' :
                                        isActive ? 'bg-blue-600 text-white shadow-md shadow-blue-200 ring-4 ring-blue-50' :
                                            'bg-slate-200 text-slate-400'}`}
                            >
                                {isCompleted ? <Check size={12} strokeWidth={3} /> : index + 1}
                            </div>

                            {/* Optional Label (Hidden on very small cards, shown on hover or larger views if needed) */}
                            <div className={`absolute top-7 text-[10px] font-medium whitespace-nowrap transition-colors
                ${isActive ? 'text-blue-700' : isCompleted ? 'text-emerald-600' : 'text-slate-400'}`}
                            >
                                {step.label}
                            </div>
                        </div>

                        {/* Connecting Line */}
                        {index < steps.length - 1 && (
                            <div className="flex-1 h-[2px] mx-1 relative bg-slate-200 rounded-full">
                                <div
                                    className="absolute top-0 left-0 h-full rounded-full transition-all duration-500 ease-out"
                                    style={{
                                        width: isCompleted ? '100%' : '0%',
                                        backgroundColor: isCompleted ? '#10b981' : 'transparent' // emerald-500
                                    }}
                                />
                            </div>
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};
