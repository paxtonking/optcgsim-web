import React, { useState, useEffect, useCallback } from 'react';
import './TurnBanner.css';

export interface TurnBannerProps {
  type: 'your-turn' | 'opponent-turn' | 'phase';
  text: string;
  subtext?: string;
  duration?: number;
  onDismiss?: () => void;
}

type AnimationPhase = 'entering' | 'visible' | 'exiting' | 'done';

const DEFAULT_TURN_DURATION = 2000;
const DEFAULT_PHASE_DURATION = 1000;

const ENTER_DURATION_TURN = 400;
const EXIT_DURATION_TURN = 300;
const ENTER_DURATION_PHASE = 300;
const EXIT_DURATION_PHASE = 300;

export const TurnBanner: React.FC<TurnBannerProps> = ({
  type,
  text,
  subtext,
  duration,
  onDismiss,
}) => {
  const [phase, setPhase] = useState<AnimationPhase>('entering');

  const isPhase = type === 'phase';
  const totalDuration = duration ?? (isPhase ? DEFAULT_PHASE_DURATION : DEFAULT_TURN_DURATION);
  const enterDuration = isPhase ? ENTER_DURATION_PHASE : ENTER_DURATION_TURN;
  const exitDuration = isPhase ? EXIT_DURATION_PHASE : EXIT_DURATION_TURN;

  const handleDismiss = useCallback(() => {
    onDismiss?.();
  }, [onDismiss]);

  useEffect(() => {
    // entering -> visible (after entry animation completes)
    const enterTimer = setTimeout(() => {
      setPhase('visible');
    }, enterDuration);

    // visible -> exiting (start exit before total duration ends)
    const exitStartTime = Math.max(totalDuration - exitDuration, enterDuration);
    const exitTimer = setTimeout(() => {
      setPhase('exiting');
    }, exitStartTime);

    // exiting -> done (after exit animation completes)
    const doneTimer = setTimeout(() => {
      setPhase('done');
    }, totalDuration);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [enterDuration, exitDuration, totalDuration]);

  useEffect(() => {
    if (phase === 'done') {
      handleDismiss();
    }
  }, [phase, handleDismiss]);

  if (phase === 'done') {
    return null;
  }

  const classNames = [
    'turn-banner',
    `turn-banner--${type}`,
    `turn-banner--${phase}`,
  ].join(' ');

  return (
    <div className={classNames}>
      <div className="turn-banner__text">{text}</div>
      {subtext && <div className="turn-banner__subtext">{subtext}</div>}
    </div>
  );
};
