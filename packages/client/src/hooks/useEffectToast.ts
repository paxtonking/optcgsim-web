import { useState, useCallback, useRef } from 'react';

export type EffectToastType =
  | 'buff'      // green - power increases
  | 'debuff'    // red - power decreases, negative effects
  | 'draw'      // blue - card draw effects
  | 'ko'        // purple - KO effects
  | 'don'       // gold - DON related effects
  | 'trigger'   // orange - trigger activations
  | 'counter'   // cyan - counter effects
  | 'search'    // teal - search/look at deck effects
  | 'play'      // green-blue - card play effects
  | 'neutral';  // gray - generic effects

export interface EffectToast {
  id: string;
  type: EffectToastType;
  message: string;
  cardName?: string;
  sourceCardId?: string;
  targetCardIds?: string[];
  duration: number;
  createdAt: number;
}

interface UseEffectToastReturn {
  toasts: EffectToast[];
  addToast: (toast: Omit<EffectToast, 'id' | 'createdAt'>) => string;
  removeToast: (id: string) => void;
  clearAllToasts: () => void;
}

const MAX_VISIBLE_TOASTS = 5;
const DEFAULT_DURATION = 3000;

let toastIdCounter = 0;

export function useEffectToast(): UseEffectToastReturn {
  const [toasts, setToasts] = useState<EffectToast[]>([]);
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const removeToast = useCallback((id: string) => {
    // Clear the timeout if it exists
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }

    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const addToast = useCallback((toastData: Omit<EffectToast, 'id' | 'createdAt'>): string => {
    const id = `toast-${++toastIdCounter}-${Date.now()}`;
    const duration = toastData.duration || DEFAULT_DURATION;

    const newToast: EffectToast = {
      ...toastData,
      id,
      duration,
      createdAt: Date.now(),
    };

    setToasts(prev => {
      // Remove oldest toasts if we exceed max
      const updated = [...prev, newToast];
      if (updated.length > MAX_VISIBLE_TOASTS) {
        const toRemove = updated.slice(0, updated.length - MAX_VISIBLE_TOASTS);
        toRemove.forEach(toast => {
          const timeout = timeoutsRef.current.get(toast.id);
          if (timeout) {
            clearTimeout(timeout);
            timeoutsRef.current.delete(toast.id);
          }
        });
        return updated.slice(-MAX_VISIBLE_TOASTS);
      }
      return updated;
    });

    // Set auto-dismiss timeout
    const timeout = setTimeout(() => {
      removeToast(id);
    }, duration);
    timeoutsRef.current.set(id, timeout);

    return id;
  }, [removeToast]);

  const clearAllToasts = useCallback(() => {
    // Clear all timeouts
    timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    timeoutsRef.current.clear();
    setToasts([]);
  }, []);

  return {
    toasts,
    addToast,
    removeToast,
    clearAllToasts,
  };
}

// Helper function to determine toast type from effect type
export function getToastTypeFromEffect(effectType: string): EffectToastType {
  const effectTypeLower = effectType.toLowerCase();

  // Buff effects
  if (effectTypeLower.includes('buff') ||
      effectTypeLower.includes('power') && !effectTypeLower.includes('debuff')) {
    return 'buff';
  }

  // Debuff effects
  if (effectTypeLower.includes('debuff') ||
      effectTypeLower.includes('reduce') ||
      effectTypeLower.includes('decrease')) {
    return 'debuff';
  }

  // Draw effects
  if (effectTypeLower.includes('draw')) {
    return 'draw';
  }

  // KO effects
  if (effectTypeLower.includes('ko') ||
      effectTypeLower.includes('destroy') ||
      effectTypeLower.includes('trash')) {
    return 'ko';
  }

  // DON effects
  if (effectTypeLower.includes('don')) {
    return 'don';
  }

  // Counter effects
  if (effectTypeLower.includes('counter')) {
    return 'counter';
  }

  // Search effects
  if (effectTypeLower.includes('search') ||
      effectTypeLower.includes('look') ||
      effectTypeLower.includes('reveal')) {
    return 'search';
  }

  // Play effects
  if (effectTypeLower.includes('play') ||
      effectTypeLower.includes('summon')) {
    return 'play';
  }

  return 'neutral';
}

// Helper function to determine toast type from trigger type
export function getToastTypeFromTrigger(triggerType: string): EffectToastType {
  const triggerLower = triggerType.toLowerCase();

  if (triggerLower.includes('on_play')) return 'play';
  if (triggerLower.includes('on_attack')) return 'buff';
  if (triggerLower.includes('on_block')) return 'counter';
  if (triggerLower.includes('counter')) return 'counter';
  if (triggerLower.includes('ko')) return 'ko';
  if (triggerLower.includes('don')) return 'don';
  if (triggerLower.includes('trigger')) return 'trigger';
  if (triggerLower.includes('draw')) return 'draw';

  return 'trigger';
}
