import React, { useEffect, useRef } from 'react';

function Modal({ title, children, onClose }) {
    const overlayMouseDownRef = useRef(false);
    const mountTimeRef = useRef(Date.now());

    useEffect(() => {
        mountTimeRef.current = Date.now();
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleOverlayMouseDown = (e) => {
        if (e.target === e.currentTarget) {
            overlayMouseDownRef.current = true;
        } else {
            overlayMouseDownRef.current = false;
        }
    };

    const handleOverlayClick = (e) => {
        // Prevent accidental closing within 250ms of mounting (e.g. double click or rapid clicks)
        if (Date.now() - mountTimeRef.current < 250) {
            return;
        }
        if (overlayMouseDownRef.current && e.target === e.currentTarget) {
            onClose();
        }
        overlayMouseDownRef.current = false;
    };

    return (
        <div
            className="modal-overlay"
            onMouseDown={handleOverlayMouseDown}
            onClick={handleOverlayClick}
        >
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button type="button" className="btn-close" onClick={onClose} aria-label="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
                <div className="modal-content">
                    {children}
                </div>
            </div>
        </div>
    );
}

export default Modal;
