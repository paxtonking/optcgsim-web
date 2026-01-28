import React, { useState, useEffect, useCallback } from 'react';
import { EffectToast as EffectToastType, EffectToastType as ToastType } from '../../hooks/useEffectToast';
import './EffectToast.css';

interface EffectToastProps {
  toast: EffectToastType;
  onRemove: (id: string) => void;
}

export const EffectToastItem: React.FC<EffectToastProps> = ({ toast, onRemove }) => {
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = useCallback(() => {
    setIsExiting(true);
    // Wait for exit animation to complete
    setTimeout(() => {
      onRemove(toast.id);
    }, 250);
  }, [toast.id, onRemove]);

  // Set up auto-dismiss with exit animation
  useEffect(() => {
    const exitTime = toast.duration - 250; // Start exit animation 250ms before removal
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, exitTime);

    return () => clearTimeout(exitTimer);
  }, [toast.duration]);

  const toastClasses = [
    'effect-toast',
    `effect-toast--${toast.type}`,
    isExiting ? 'effect-toast--exiting' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={toastClasses}
      style={{ '--toast-duration': `${toast.duration}ms` } as React.CSSProperties}
    >
      <div className="effect-toast__icon" />
      <div className="effect-toast__content">
        {toast.cardName && (
          <div className="effect-toast__card-name">{toast.cardName}</div>
        )}
        <div className="effect-toast__message">{toast.message}</div>
      </div>
      <button
        className="effect-toast__close"
        onClick={handleClose}
        aria-label="Close notification"
      >
        ×
      </button>
      <div className="effect-toast__progress" />
    </div>
  );
};

interface EffectToastContainerProps {
  toasts: EffectToastType[];
  onRemove: (id: string) => void;
}

export const EffectToastContainer: React.FC<EffectToastContainerProps> = ({
  toasts,
  onRemove,
}) => {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="effect-toast-container">
      {toasts.map(toast => (
        <EffectToastItem
          key={toast.id}
          toast={toast}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
};

// Helper component for quick toast creation
interface QuickToastProps {
  type: ToastType;
  message: string;
  cardName?: string;
}

export const createQuickToast = (props: QuickToastProps): Omit<EffectToastType, 'id' | 'createdAt'> => ({
  type: props.type,
  message: props.message,
  cardName: props.cardName,
  duration: 3000,
});

// Preset toast creators for common effects
export const toastPresets = {
  buff: (cardName: string, amount: number) => createQuickToast({
    type: 'buff',
    message: `+${amount} Power`,
    cardName,
  }),

  debuff: (cardName: string, amount: number) => createQuickToast({
    type: 'debuff',
    message: `-${amount} Power`,
    cardName,
  }),

  draw: (count: number) => createQuickToast({
    type: 'draw',
    message: `Drew ${count} card${count > 1 ? 's' : ''}`,
  }),

  ko: (cardName: string) => createQuickToast({
    type: 'ko',
    message: 'KO\'d',
    cardName,
  }),

  donGain: (count: number) => createQuickToast({
    type: 'don',
    message: `+${count} DON!!`,
  }),

  donAttach: (cardName: string, count: number) => createQuickToast({
    type: 'don',
    message: `${count} DON!! attached`,
    cardName,
  }),

  triggerActivate: (cardName: string, effectDesc: string) => createQuickToast({
    type: 'trigger',
    message: effectDesc,
    cardName,
  }),

  counterUse: (cardName: string, amount: number) => createQuickToast({
    type: 'counter',
    message: `+${amount} Counter`,
    cardName,
  }),

  search: (message: string) => createQuickToast({
    type: 'search',
    message,
  }),

  play: (cardName: string, fromZone?: string) => createQuickToast({
    type: 'play',
    message: fromZone ? `Played from ${fromZone}` : 'Played',
    cardName,
  }),

  generic: (message: string, cardName?: string) => createQuickToast({
    type: 'neutral',
    message,
    cardName,
  }),
};

export default EffectToastContainer;
