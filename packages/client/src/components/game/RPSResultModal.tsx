import React from 'react';
import { RPSChoice, RPSState } from '@optcgsim/shared';
import './RPSModal.css';

interface RPSResultModalProps {
  isOpen: boolean;
  playerId: string;
  rpsState: RPSState;
  player1Username?: string;
  player2Username?: string;
}

const CHOICE_ICONS: Record<RPSChoice, string> = {
  rock: '✊',
  paper: '✋',
  scissors: '✌️',
};

export const RPSResultModal: React.FC<RPSResultModalProps> = ({
  isOpen,
  playerId,
  rpsState,
  player1Username = 'Player 1',
  player2Username = 'Player 2',
}) => {
  if (!isOpen || !rpsState.player1Choice || !rpsState.player2Choice) return null;

  const isPlayer1 = playerId === rpsState.player1Id;
  const myChoice = isPlayer1 ? rpsState.player1Choice : rpsState.player2Choice;
  const opponentChoice = isPlayer1 ? rpsState.player2Choice : rpsState.player1Choice;
  // Username variables reserved for future display customization
  void (isPlayer1 ? player1Username : player2Username);
  void (isPlayer1 ? player2Username : player1Username);

  const iWon = rpsState.winnerId === playerId;
  const isTie = rpsState.isTie;

  return (
    <div className="rps-modal-overlay">
      <div className="rps-modal rps-result-modal">
        <div className="rps-modal__header">
          <h2 className="rps-modal__title">
            {isTie ? "It's a Tie!" : iWon ? 'You Win!' : 'You Lose!'}
          </h2>
        </div>

        <div className="rps-result__choices">
          <div className="rps-result__player">
            <span className="rps-result__player-name">You</span>
            <span className="rps-result__choice-icon">{CHOICE_ICONS[myChoice]}</span>
            <span className="rps-result__choice-label">{myChoice}</span>
          </div>

          <div className="rps-result__vs">VS</div>

          <div className="rps-result__player">
            <span className="rps-result__player-name">Opponent</span>
            <span className="rps-result__choice-icon">{CHOICE_ICONS[opponentChoice]}</span>
            <span className="rps-result__choice-label">{opponentChoice}</span>
          </div>
        </div>

        {isTie && (
          <p className="rps-result__message rps-result__message--tie">
            Get ready for another round...
          </p>
        )}

        {!isTie && iWon && (
          <p className="rps-result__message rps-result__message--win">
            You get to choose who goes first!
          </p>
        )}

        {!isTie && !iWon && (
          <p className="rps-result__message rps-result__message--lose">
            Opponent will choose who goes first...
          </p>
        )}
      </div>
    </div>
  );
};

export default RPSResultModal;
