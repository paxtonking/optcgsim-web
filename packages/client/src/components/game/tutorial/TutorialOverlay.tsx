import React, { useEffect, useRef, useReducer } from 'react';
import { useTutorialStore } from '../../../stores/tutorialStore';
import './TutorialOverlay.css';

interface TutorialOverlayProps {
  onSkip: () => void;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

function rectsEqual(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ onSkip }) => {
  const { isActive, getCurrentStep, advanceStep } = useTutorialStore();
  const rectRef = useRef<Rect | null>(null);
  const [, forceRender] = useReducer(x => x + 1, 0);
  const observerRef = useRef<MutationObserver | null>(null);
  const measurePendingRef = useRef(false);

  const step = getCurrentStep();
  const highlightTarget = step?.highlightTarget ?? null;

  // Measure the target element and only trigger re-render if rect actually changed
  const measureTarget = useRef(() => {
    if (!highlightTarget) {
      if (rectRef.current !== null) {
        rectRef.current = null;
        forceRender();
      }
      return;
    }
    const el = document.querySelector(highlightTarget);
    if (el) {
      const domRect = el.getBoundingClientRect();
      const newRect: Rect = {
        x: domRect.x, y: domRect.y,
        width: domRect.width, height: domRect.height,
        top: domRect.top, bottom: domRect.bottom,
        left: domRect.left, right: domRect.right,
      };
      if (!rectsEqual(rectRef.current, newRect)) {
        rectRef.current = newRect;
        forceRender();
      }
    } else if (rectRef.current !== null) {
      rectRef.current = null;
      forceRender();
    }
  });

  // Keep the measure function up to date with the current highlightTarget
  useEffect(() => {
    measureTarget.current = () => {
      if (!highlightTarget) {
        if (rectRef.current !== null) {
          rectRef.current = null;
          forceRender();
        }
        return;
      }
      const el = document.querySelector(highlightTarget);
      if (el) {
        const domRect = el.getBoundingClientRect();
        const newRect: Rect = {
          x: domRect.x, y: domRect.y,
          width: domRect.width, height: domRect.height,
          top: domRect.top, bottom: domRect.bottom,
          left: domRect.left, right: domRect.right,
        };
        if (!rectsEqual(rectRef.current, newRect)) {
          rectRef.current = newRect;
          forceRender();
        }
      } else if (rectRef.current !== null) {
        rectRef.current = null;
        forceRender();
      }
    };
    // Measure immediately on step change
    measureTarget.current();
  }, [highlightTarget]);

  // Set up MutationObserver and periodic polling — stable effect, runs once
  useEffect(() => {
    const handleMutation = () => {
      // Batch mutations with requestAnimationFrame to avoid cascading re-renders
      if (!measurePendingRef.current) {
        measurePendingRef.current = true;
        requestAnimationFrame(() => {
          measurePendingRef.current = false;
          measureTarget.current();
        });
      }
    };

    const handleResize = () => measureTarget.current();
    window.addEventListener('resize', handleResize);

    observerRef.current = new MutationObserver(handleMutation);
    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Periodic fallback for layout shifts (e.g. animations)
    const interval = setInterval(() => measureTarget.current(), 1000);

    return () => {
      window.removeEventListener('resize', handleResize);
      observerRef.current?.disconnect();
      clearInterval(interval);
    };
  }, []);

  if (!isActive || !step) return null;

  const highlightRect = rectRef.current;
  const padding = 12;
  const hasHighlight = highlightRect !== null;

  // Calculate speech bubble position
  const getBubbleStyle = (): React.CSSProperties => {
    if (!hasHighlight || step.bubblePosition === 'center') {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const gap = 16;
    switch (step.bubblePosition) {
      case 'top':
        return {
          position: 'fixed',
          bottom: `${window.innerHeight - highlightRect!.top + gap}px`,
          left: `${Math.min(Math.max(highlightRect!.left + highlightRect!.width / 2, 200), window.innerWidth - 200)}px`,
          transform: 'translateX(-50%)',
        };
      case 'bottom':
        return {
          position: 'fixed',
          top: `${highlightRect!.bottom + gap}px`,
          left: `${Math.min(Math.max(highlightRect!.left + highlightRect!.width / 2, 200), window.innerWidth - 200)}px`,
          transform: 'translateX(-50%)',
        };
      case 'left':
        return {
          position: 'fixed',
          top: `${highlightRect!.top + highlightRect!.height / 2}px`,
          right: `${window.innerWidth - highlightRect!.left + gap}px`,
          transform: 'translateY(-50%)',
        };
      case 'right':
        return {
          position: 'fixed',
          top: `${highlightRect!.top + highlightRect!.height / 2}px`,
          left: `${highlightRect!.right + gap}px`,
          transform: 'translateY(-50%)',
        };
      default:
        return {
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        };
    }
  };

  return (
    <div className="tutorial-overlay">
      {/* Highlight border ring */}
      {hasHighlight && (
        <div
          className="tutorial-overlay__highlight-ring"
          style={{
            left: highlightRect!.x - padding,
            top: highlightRect!.y - padding,
            width: highlightRect!.width + padding * 2,
            height: highlightRect!.height + padding * 2,
          }}
        />
      )}

      {/* Speech bubble */}
      <div
        className="tutorial-bubble"
        style={getBubbleStyle()}
      >
        <p className="tutorial-bubble__text">{step.message}</p>
        {step.hasNextButton && (
          <button className="tutorial-bubble__next-btn" onClick={() => advanceStep()}>
            Next
          </button>
        )}
      </div>

      {/* Skip button */}
      <button className="tutorial-overlay__skip-btn" onClick={onSkip}>
        Skip Tutorial
      </button>
    </div>
  );
};
