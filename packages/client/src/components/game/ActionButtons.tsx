import React from 'react';
import { GamePhase } from '@optcgsim/shared';
import './GameBoard.css';

interface ActionButtonsProps {
  phase: GamePhase | null;
  isMyTurn: boolean;
  isDefender: boolean;  // True if player is the defender in current combat
  onEndTurn: () => void;
  onPass: () => void;
  onKeepHand: () => void;
  onMulligan: () => void;
  onUseCounter?: () => void;
  onPassCounter?: () => void;
  onSelectBlocker?: () => void;
  onPassBlocker?: () => void;
  onActivateTrigger?: () => void;
  onPassTrigger?: () => void;
  mulliganAvailable?: boolean;
  // Attack mode props (for cards with abilities)
  showAttackButton?: boolean;  // True when a card with abilities is selected
  canAttack?: boolean;         // True when the selected card can actually attack
  isAttackMode?: boolean;
  onAttack?: () => void;
  onCancelAttack?: () => void;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  phase,
  isMyTurn,
  isDefender,
  onEndTurn,
  onPass,
  onKeepHand: _onKeepHand,
  onMulligan: _onMulligan,
  onUseCounter: _onUseCounter,
  onPassCounter: _onPassCounter,
  onSelectBlocker: _onSelectBlocker,
  onPassBlocker: _onPassBlocker,
  onActivateTrigger,
  onPassTrigger,
  mulliganAvailable: _mulliganAvailable = true,
  showAttackButton = false,
  canAttack = false,
  isAttackMode = false,
  onAttack,
  onCancelAttack,
}) => {
  // Note: These props are kept for interface compatibility but are handled elsewhere
  // Combat actions are handled by CombatModal, mulligan actions by MulliganModal
  void _onUseCounter;
  void _onPassCounter;
  void _onSelectBlocker;
  void _onPassBlocker;
  void _onKeepHand;
  void _onMulligan;
  void _mulliganAvailable;

  // Pre-game phases (RPS, First Choice) - modal handles these
  if (phase === GamePhase.RPS_PHASE || phase === GamePhase.FIRST_CHOICE) {
    return (
      <div className="action-buttons">
        <div style={{ color: '#a0aec0', textAlign: 'center', fontSize: '12px', padding: '8px' }}>
          Waiting for game setup...
        </div>
      </div>
    );
  }

  // Mulligan phase - buttons are in the main overlay, show helper text here
  if (phase === GamePhase.START_MULLIGAN) {
    return (
      <div className="action-buttons">
        <div style={{ color: '#a0aec0', textAlign: 'center', fontSize: '12px', padding: '8px' }}>
          Review your starting hand above
        </div>
      </div>
    );
  }

  // Combat phases (BLOCKER_STEP and COUNTER_STEP) are handled by CombatModal
  // Show waiting state during combat for sidebar
  if (phase === GamePhase.COUNTER_STEP || phase === GamePhase.BLOCKER_STEP) {
    return (
      <div className="action-buttons">
        <div style={{ color: '#888', textAlign: 'center', fontSize: '12px', padding: '8px' }}>
          {isDefender ? 'Use the combat modal to respond' : 'Waiting for opponent...'}
        </div>
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
      {/* Attack button for cards with abilities - shown when card with abilities is selected, greyed when can't attack */}
      {showAttackButton && !isAttackMode && (
        <button
          className="action-btn action-btn--attack"
          onClick={onAttack}
          disabled={!canAttack}
          title={!canAttack ? 'Cannot attack (card may be rested, already attacked, or has summoning sickness)' : 'Declare an attack'}
        >
          Attack
        </button>
      )}
      {/* Cancel attack button when in attack mode */}
      {isAttackMode && (
        <button
          className="action-btn action-btn--pass"
          onClick={onCancelAttack}
        >
          Cancel Attack
        </button>
      )}
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
