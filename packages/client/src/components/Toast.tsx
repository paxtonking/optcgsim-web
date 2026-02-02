import React, { useState, useEffect, useCallback } from 'react';
import { useToastStore, Toast as ToastType } from '../stores/toastStore';
import './Toast.css';

const TOAST_ICONS: Record<ToastType['type'], string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

interface ToastItemProps {
  toast: ToastType;
  onRemove: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onRemove(toast.id);
    }, 250);
  }, [toast.id, onRemove]);

  // Start exit animation before auto-removal
  useEffect(() => {
    const exitTime = toast.duration - 250;
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, exitTime);

    return () => clearTimeout(exitTimer);
  }, [toast.duration]);

  const toastClasses = [
    'app-toast',
    `app-toast--${toast.type}`,
    isExiting ? 'app-toast--exiting' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={toastClasses}
      style={{ '--toast-duration': `${toast.duration}ms` } as React.CSSProperties}
    >
      <div className="app-toast__icon">{TOAST_ICONS[toast.type]}</div>
      <div className="app-toast__message">{toast.message}</div>
      <button
        className="app-toast__close"
        onClick={handleClose}
        aria-label="Close notification"
      >
        ×
      </button>
      <div className="app-toast__progress" />
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="app-toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
};

export default ToastContainer;
