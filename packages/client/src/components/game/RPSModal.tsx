import React, { useState, useEffect, useCallback } from 'react';
import { RPSChoice, RPSState } from '@optcgsim/shared';
import './RPSModal.css';

interface RPSModalProps {
  isOpen: boolean;
  playerId: string;
  rpsState?: RPSState;
  onChoose: (choice: RPSChoice) => void;
  timeoutSeconds?: number;
}

const CHOICE_ICONS: Record<RPSChoice, string> = {
  rock: '✊',
  paper: '✋',
  scissors: '✌️',
};

const CHOICE_LABELS: Record<RPSChoice, string> = {
  rock: 'Rock',
  paper: 'Paper',
  scissors: 'Scissors',
};

export const RPSModal: React.FC<RPSModalProps> = ({
  isOpen,
  playerId: _playerId,
  rpsState,
  onChoose,
  timeoutSeconds = 10,
}) => {
  const [selectedChoice, setSelectedChoice] = useState<RPSChoice | null>(null);
  const [timeLeft, setTimeLeft] = useState(timeoutSeconds);
  const [hasChosen, setHasChosen] = useState(false);

  // Reset state when modal opens or round changes
  // Also detect if player already made their choice (reconnection scenario)
  useEffect(() => {
    if (isOpen) {
      // Check if player already chose (sanitized state only shows their own choice)
      const existingChoice = rpsState?.player1Choice || rpsState?.player2Choice;
      if (existingChoice) {
        // Player reconnected after making their choice
        setSelectedChoice(existingChoice);
        setHasChosen(true);
      } else {
        setSelectedChoice(null);
        setHasChosen(false);
        setTimeLeft(timeoutSeconds);
      }
    }
  }, [isOpen, rpsState?.roundNumber, rpsState?.player1Choice, rpsState?.player2Choice, timeoutSeconds]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || hasChosen) return;

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
  }, [isOpen, hasChosen]);

  const handleChoose = useCallback((choice: RPSChoice) => {
    if (hasChosen) return;

    setSelectedChoice(choice);
    setHasChosen(true);
    onChoose(choice);
  }, [hasChosen, onChoose]);

  if (!isOpen) return null;

  const isWaitingForOpponent = hasChosen && !rpsState?.player1Choice && !rpsState?.player2Choice;
  const roundNumber = rpsState?.roundNumber || 1;

  return (
    <div className="rps-modal-overlay">
      <div className="rps-modal">
        <div className="rps-modal__header">
          <h2 className="rps-modal__title">
            {roundNumber > 1 ? `Rock Paper Scissors - Round ${roundNumber}` : 'Rock Paper Scissors'}
          </h2>
          <p className="rps-modal__subtitle">
            Choose to determine who picks first or second
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

        <div className="rps-modal__choices">
          {(['rock', 'paper', 'scissors'] as RPSChoice[]).map((choice) => (
            <button
              key={choice}
              className={`rps-modal__choice ${selectedChoice === choice ? 'rps-modal__choice--selected' : ''} ${hasChosen && selectedChoice !== choice ? 'rps-modal__choice--disabled' : ''}`}
              onClick={() => handleChoose(choice)}
              disabled={hasChosen}
            >
              <span className="rps-modal__choice-icon">{CHOICE_ICONS[choice]}</span>
              <span className="rps-modal__choice-label">{CHOICE_LABELS[choice]}</span>
            </button>
          ))}
        </div>

        {isWaitingForOpponent && (
          <div className="rps-modal__waiting">
            <div className="rps-modal__spinner" />
            <span>Waiting for opponent...</span>
          </div>
        )}

        {roundNumber > 1 && (
          <p className="rps-modal__tie-message">It was a tie! Choose again.</p>
        )}
      </div>
    </div>
  );
};

export default RPSModal;
