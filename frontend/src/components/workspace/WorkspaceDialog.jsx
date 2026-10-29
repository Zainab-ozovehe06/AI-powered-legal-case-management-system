import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function WorkspaceDialog({ title, onClose, children, busy = false }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return createPortal(<dialog ref={dialog} className="workspace-dialog" aria-labelledby="workspace-dialog-title"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="workspace-dialog-header"><h2 id="workspace-dialog-title">{title}</h2>
      <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} disabled={busy} aria-label="Close dialog"><X size={20} /></button></div>
    {children}
  </dialog>, document.body);
}
