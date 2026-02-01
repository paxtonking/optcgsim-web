import React, { useEffect, useState } from 'react';
import { GameCard as GameCardType } from '@optcgsim/shared';
import './GameBoard.css';

interface Position {
  x: number;
  y: number;
}

interface AnimatingCardProps {
  card: GameCardType;
  faceUp: boolean;
  startPos: Position;
  endPos: Position;
  delay: number;  // ms delay before animation starts
  duration?: number;  // animation duration in ms (default 300)
  endRotation?: number;  // rotation at end position in degrees (default 0)
  flipDuringFlight?: boolean;  // flip from face-down to face-up during flight
  isDon?: boolean;  // DON card (smaller size)
  onComplete?: () => void;  // callback when animation completes
}

export const AnimatingCard: React.FC<AnimatingCardProps> = ({
  card,
  faceUp,
  startPos,
  endPos,
  delay,
  duration = 300,
  endRotation = 0,
  flipDuringFlight = false,
  isDon = false,
  onComplete
}) => {
  const [animationState, setAnimationState] = useState<'waiting' | 'flying' | 'landing' | 'done'>('waiting');
  const [currentPos, setCurrentPos] = useState(startPos);
  const [currentRotation, setCurrentRotation] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const cardWidth = 70;
  const cardHeight = 100;
  const flyDuration = duration;
  const landDuration = 150; // Quick rotation/landing phase

  // Start animation after delay
  useEffect(() => {
    const delayTimer = setTimeout(() => {
      setAnimationState('flying');
      setCurrentPos(endPos);

      // If flipping during flight, trigger flip at midpoint
      if (flipDuringFlight) {
        const flipTimer = setTimeout(() => {
          setIsFlipped(true);
        }, flyDuration * 0.4); // Flip at 40% through flight
        return () => clearTimeout(flipTimer);
      }
    }, delay);

    return () => clearTimeout(delayTimer);
  }, [delay, endPos, flipDuringFlight, flyDuration]);

  // Handle flying phase completion - start landing phase
  useEffect(() => {
    if (animationState === 'flying') {
      const flyTimer = setTimeout(() => {
        if (endRotation !== 0) {
          // Start landing/rotation phase
          setAnimationState('landing');
          setCurrentRotation(endRotation);
        } else {
          // No rotation needed, we're done
          setAnimationState('done');
          onComplete?.();
        }
      }, flyDuration + 20);

      return () => clearTimeout(flyTimer);
    }
  }, [animationState, flyDuration, endRotation, onComplete]);

  // Handle landing phase completion
  useEffect(() => {
    if (animationState === 'landing') {
      const landTimer = setTimeout(() => {
        setAnimationState('done');
        onComplete?.();
      }, landDuration + 20);

      return () => clearTimeout(landTimer);
    }
  }, [animationState, landDuration, onComplete]);

  // Don't render if done
  if (animationState === 'done') {
    return null;
  }

  // Calculate styles based on animation state
  const getTransformStyle = () => {
    if (animationState === 'waiting') {
      return 'scale(0.8) rotate(0deg)';
    }
    if (animationState === 'flying') {
      return 'scale(1) rotate(0deg)';
    }
    if (animationState === 'landing') {
      return `scale(1) rotate(${currentRotation}deg)`;
    }
    return 'scale(1) rotate(0deg)';
  };

  const getTransition = () => {
    if (animationState === 'flying') {
      return `left ${flyDuration}ms cubic-bezier(0.4, 0, 0.2, 1), top ${flyDuration}ms cubic-bezier(0.4, 0, 0.2, 1), transform ${flyDuration}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${flyDuration * 0.3}ms ease`;
    }
    if (animationState === 'landing') {
      return `transform ${landDuration}ms cubic-bezier(0.34, 1.56, 0.64, 1)`; // Slight overshoot for "settling" feel
    }
    return 'none';
  };

  // Determine if card should show face up (original faceUp or flipped)
  const showFaceUp = faceUp || (flipDuringFlight && isFlipped);
  const cardSizeClass = isDon ? 'game-card--don' : 'game-card--normal';

  return (
    <div
      className={`animating-card animating-card--${animationState} ${isDon ? 'animating-card--don' : ''}`}
      style={{
        position: 'fixed',
        left: currentPos.x - cardWidth / 2,
        top: currentPos.y - cardHeight / 2,
        width: cardWidth,
        height: cardHeight,
        zIndex: 2000,
        pointerEvents: 'none',
        transition: getTransition(),
        transform: getTransformStyle(),
        opacity: animationState === 'waiting' ? 0 : 1,
        perspective: flipDuringFlight ? '600px' : undefined
      }}
    >
      <div
        className={`animating-card__flipper ${isFlipped ? 'animating-card__flipper--flipped' : ''}`}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          transformStyle: flipDuringFlight ? 'preserve-3d' : undefined,
          transition: flipDuringFlight ? 'transform 0.3s ease-out' : undefined,
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
        }}
      >
        {/* Front face (face-down / card back) */}
        <div
          className={`animating-card__face animating-card__face--back`}
          style={{
            position: flipDuringFlight ? 'absolute' : 'relative',
            width: '100%',
            height: '100%',
            backfaceVisibility: flipDuringFlight ? 'hidden' : undefined,
            display: (!flipDuringFlight && showFaceUp) ? 'none' : undefined
          }}
        >
          <div className={`game-card ${cardSizeClass} game-card--face-down`} style={{ width: '100%', height: '100%' }}>
            <img
              src={isDon ? "/assets/cardbacks/CardBackDon.png" : "/assets/cardbacks/CardBackRegular.png"}
              alt={isDon ? "DON card back" : "Card back"}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '3px' }}
            />
          </div>
        </div>

        {/* Back face (face-up / card front) */}
        <div
          className={`animating-card__face animating-card__face--front`}
          style={{
            position: flipDuringFlight ? 'absolute' : 'relative',
            width: '100%',
            height: '100%',
            backfaceVisibility: flipDuringFlight ? 'hidden' : undefined,
            transform: flipDuringFlight ? 'rotateY(180deg)' : undefined,
            display: (!flipDuringFlight && !showFaceUp) ? 'none' : undefined
          }}
        >
          <div className={`game-card ${cardSizeClass}`} style={{ width: '100%', height: '100%' }}>
            {isDon ? (
              /* DON card face - use local image */
              <img
                src="/assets/cardbacks/CardFrontDon.png"
                alt="DON!!"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: '3px'
                }}
              />
            ) : (
              /* Regular card - try to load image with fallback */
              <>
                <img
                  src={`${import.meta.env.VITE_API_URL || ''}/api/images/cards/${card.cardId}.png`}
                  alt={card.cardId}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: '5px'
                  }}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const placeholder = target.nextElementSibling as HTMLElement;
                    if (placeholder) placeholder.style.display = 'flex';
                  }}
                />
                <div
                  className="game-card__placeholder"
                  style={{
                    backgroundColor: '#444',
                    width: '100%',
                    height: '100%',
                    display: 'none',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'absolute',
                    top: 0,
                    left: 0
                  }}
                >
                  <div className="game-card__placeholder-content">
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#fff' }}>
                      {card.cardId}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnimatingCard;
