import React from 'react';
import { GamePhase } from '@optcgsim/shared';
import './GameBoard.css';

interface ActionButtonsProps {
  phase: GamePhase | null;
  isMyTurn: boolean;
  isSpectator: boolean;
  onEndTurn: () => void;
  onPass: () => void;
  onKeepHand: () => void;
  onMulligan: () => void;
  onUseCounter?: () => void;
  onPassCounter?: () => void;
  onActivateTrigger?: () => void;
  onPassTrigger?: () => void;
  mulliganAvailable?: boolean;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  phase,
  isMyTurn,
  isSpectator,
  onEndTurn,
  onPass,
  onKeepHand,
  onMulligan,
  onUseCounter,
  onPassCounter,
  onActivateTrigger,
  onPassTrigger,
  mulliganAvailable = true
}) => {
  // Spectators can't take actions
  if (isSpectator) {
    return (
      <div className="action-buttons">
        <div style={{ color: '#888', textAlign: 'center', fontSize: '12px' }}>
          Spectating
        </div>
      </div>
    );
  }

  // Mulligan phase buttons
  if (phase === GamePhase.START_MULLIGAN) {
    return (
      <div className="action-buttons">
        <button
          className="action-btn action-btn--keep"
          onClick={onKeepHand}
        >
          Keep Hand
        </button>
        {mulliganAvailable && (
          <button
            className="action-btn action-btn--mulligan"
            onClick={onMulligan}
          >
            Mulligan
          </button>
        )}
      </div>
    );
  }

  // Counter step buttons
  if (phase === GamePhase.COUNTER_STEP) {
    return (
      <div className="action-buttons">
        <button
          className="action-btn action-btn--attack"
          onClick={onUseCounter}
          disabled={!isMyTurn}
        >
          Use Counter
        </button>
        <button
          className="action-btn action-btn--pass"
          onClick={onPassCounter}
          disabled={!isMyTurn}
        >
          Pass
        </button>
      </div>
    );
  }

  // Trigger step buttons
  if (phase === GamePhase.TRIGGER_STEP) {
    return (
      <div className="action-buttons">
        <button
          className="action-btn action-btn--attack"
          onClick={onActivateTrigger}
          disabled={!isMyTurn}
        >
          Activate Trigger
        </button>
        <button
          className="action-btn action-btn--pass"
          onClick={onPassTrigger}
          disabled={!isMyTurn}
        >
          Pass
        </button>
      </div>
    );
  }

  // Main phase buttons
  return (
    <div className="action-buttons">
      <button
        className="action-btn action-btn--end"
        onClick={onEndTurn}
        disabled={!isMyTurn}
      >
        End Turn
      </button>
      <button
        className="action-btn action-btn--pass"
        onClick={onPass}
        disabled={!isMyTurn}
      >
        Pass
      </button>
    </div>
  );
};

export default ActionButtons;
