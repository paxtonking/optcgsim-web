import { useEffect } from 'react';

/**
 * Hook to prevent browser zoom gestures during gameplay.
 * Prevents:
 * - Ctrl+scroll (mouse wheel zoom)
 * - Ctrl+Plus/Minus (keyboard zoom)
 * - Pinch-to-zoom (touch gestures)
 * - Double-tap zoom (touch gestures)
 *
 * @param enabled - Whether zoom prevention is active (default: true)
 */
export function usePreventZoom(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    // Prevent Ctrl+scroll wheel zoom
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    // Prevent Ctrl+Plus/Minus keyboard zoom
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
        e.preventDefault();
      }
    };

    // Prevent touch gesture zoom (pinch-to-zoom, double-tap)
    const handleTouchStart = (e: TouchEvent) => {
      // Prevent multi-touch gestures (pinch-to-zoom)
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };

    // Track for double-tap detection
    let lastTouchEnd = 0;
    const handleTouchEnd = (e: TouchEvent) => {
      const now = Date.now();
      // Prevent double-tap zoom (taps within 300ms)
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    };

    // Prevent gesture events (Safari specific)
    const handleGestureStart = (e: Event) => {
      e.preventDefault();
    };

    const handleGestureChange = (e: Event) => {
      e.preventDefault();
    };

    // Add all event listeners with passive: false to allow preventDefault
    document.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('keydown', handleKeyDown, { passive: false });
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: false });
    document.addEventListener('gesturestart', handleGestureStart, { passive: false });
    document.addEventListener('gesturechange', handleGestureChange, { passive: false });

    return () => {
      document.removeEventListener('wheel', handleWheel);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('gesturestart', handleGestureStart);
      document.removeEventListener('gesturechange', handleGestureChange);
    };
  }, [enabled]);
}
