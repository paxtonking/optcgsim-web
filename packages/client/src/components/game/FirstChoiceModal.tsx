import React, { useState, useEffect, useCallback } from 'react';
import './RPSModal.css';

interface FirstChoiceModalProps {
  isOpen: boolean;
  isWinner: boolean;  // Whether this player won RPS (or AI game where player always chooses)
  isAIGame?: boolean;
  onChoose: (goFirst: boolean) => void;
  timeoutSeconds?: number;
}

export const FirstChoiceModal: React.FC<FirstChoiceModalProps> = ({
  isOpen,
  isWinner,
  isAIGame = false,
  onChoose,
  timeoutSeconds = 10,
}) => {
  const [timeLeft, setTimeLeft] = useState(timeoutSeconds);
  const [hasChosen, setHasChosen] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setHasChosen(false);
      setTimeLeft(timeoutSeconds);
    }
  }, [isOpen, timeoutSeconds]);

  // Countdown timer (only for the winner)
  useEffect(() => {
    if (!isOpen || hasChosen || !isWinner) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, hasChosen, isWinner]);

  const handleChoose = useCallback((goFirst: boolean) => {
    if (hasChosen || !isWinner) return;

    setHasChosen(true);
    onChoose(goFirst);
  }, [hasChosen, isWinner, onChoose]);

  if (!isOpen) return null;

  // If not the winner, show waiting message
  if (!isWinner) {
    return (
      <div className="rps-modal-overlay">
        <div className="rps-modal first-choice-modal">
          <div className="rps-modal__header">
            <h2 className="rps-modal__title">Waiting...</h2>
            <p className="rps-modal__subtitle">
              Opponent is choosing who goes first
            </p>
          </div>

          <div className="rps-modal__waiting">
            <div className="rps-modal__spinner" />
            <span>Please wait...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rps-modal-overlay">
      <div className="rps-modal first-choice-modal">
        <div className="rps-modal__header">
          <h2 className="rps-modal__title">
            {isAIGame ? 'Choose Turn Order' : 'You Won!'}
          </h2>
          <p className="rps-modal__subtitle">
            {isAIGame
              ? 'Would you like to go first or second?'
              : 'Choose whether to go first or second'}
          </p>
        </div>

        {!hasChosen && (
          <div className="rps-modal__timer">
            <div
              className={`rps-modal__timer-bar ${timeLeft <= 3 ? 'rps-modal__timer-bar--urgent' : ''}`}
              style={{ width: `${(timeLeft / timeoutSeconds) * 100}%` }}
            />
            <span className="rps-modal__timer-text">{timeLeft}s</span>
          </div>
        )}

        <div className="first-choice__options">
          <button
            className={`first-choice__option first-choice__option--first ${hasChosen ? 'first-choice__option--disabled' : ''}`}
            onClick={() => handleChoose(true)}
            disabled={hasChosen}
          >
            <span className="first-choice__option-icon">1st</span>
            <span className="first-choice__option-title">Go First</span>
            <span className="first-choice__option-desc">
              Start with initiative but draw fewer DON
            </span>
          </button>

          <button
            className={`first-choice__option first-choice__option--second ${hasChosen ? 'first-choice__option--disabled' : ''}`}
            onClick={() => handleChoose(false)}
            disabled={hasChosen}
          >
            <span className="first-choice__option-icon">2nd</span>
            <span className="first-choice__option-title">Go Second</span>
            <span className="first-choice__option-desc">
              Draw more DON on your first turn
            </span>
          </button>
        </div>

        {hasChosen && (
          <div className="rps-modal__waiting">
            <div className="rps-modal__spinner" />
            <span>Starting game...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FirstChoiceModal;
