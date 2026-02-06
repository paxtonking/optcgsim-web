import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTutorialStore } from '../../../stores/tutorialStore';
import './TutorialOverlay.css';

interface TutorialOverlayProps {
  onSkip: () => void;
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ onSkip }) => {
  const { isActive, getCurrentStep, advanceStep } = useTutorialStore();
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  const step = getCurrentStep();

  // Find and measure the highlight target element
  const measureTarget = useCallback(() => {
    if (!step?.highlightTarget) {
      setHighlightRect(null);
      return;
    }

    const el = document.querySelector(step.highlightTarget);
    if (el) {
      const rect = el.getBoundingClientRect();
      setHighlightRect(rect);
    } else {
      setHighlightRect(null);
    }
  }, [step?.highlightTarget]);

  useEffect(() => {
    measureTarget();

    // Re-measure on window resize
    window.addEventListener('resize', measureTarget);

    // Observe DOM changes to catch when target elements appear
    observerRef.current = new MutationObserver(() => {
      measureTarget();
    });
    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    return () => {
      window.removeEventListener('resize', measureTarget);
      observerRef.current?.disconnect();
    };
  }, [measureTarget]);

  // Re-measure periodically for layout shifts
  useEffect(() => {
    if (!step?.highlightTarget) return;
    const interval = setInterval(measureTarget, 500);
    return () => clearInterval(interval);
  }, [step?.highlightTarget, measureTarget]);

  if (!isActive || !step) return null;

  const handleNext = () => {
    advanceStep();
  };

  const handleSkip = () => {
    onSkip();
  };

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
      {/* Dark overlay with spotlight cutout */}
      <svg className="tutorial-overlay__mask" width="100%" height="100%">
        <defs>
          <mask id="tutorial-spotlight">
            <rect width="100%" height="100%" fill="white" />
            {hasHighlight && (
              <rect
                x={highlightRect!.x - padding}
                y={highlightRect!.y - padding}
                width={highlightRect!.width + padding * 2}
                height={highlightRect!.height + padding * 2}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.55)"
          mask="url(#tutorial-spotlight)"
        />
      </svg>

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
          <button className="tutorial-bubble__next-btn" onClick={handleNext}>
            Next
          </button>
        )}
      </div>

      {/* Skip button */}
      <button className="tutorial-overlay__skip-btn" onClick={handleSkip}>
        Skip Tutorial
      </button>
    </div>
  );
};
