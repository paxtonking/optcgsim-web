import { useState, useCallback, useRef } from 'react';

/**
 * Hook for show-with-auto-dismiss patterns.
 * Returns [current value, show function, clear function].
 */
export function useTimedBanner<T = string>(
  timeoutMs: number
): [T | null, (val: T) => void, () => void] {
  const [value, setValue] = useState<T | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const show = useCallback((val: T) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setValue(val);
    timeoutRef.current = setTimeout(() => {
      setValue(null);
    }, timeoutMs);
  }, [timeoutMs]);

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setValue(null);
  }, []);

  return [value, show, clear];
}
