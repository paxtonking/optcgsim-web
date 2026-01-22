import React, { useState, useCallback, useMemo } from 'react';
import { GameState, GameCard as GameCardType, GamePhase, CardZone } from '@optcgsim/shared';
import { useGameSocket } from '../../hooks/useGameSocket';
import { useGameState } from '../../hooks/useGameState';
import { PlayerArea, HandZone } from './PlayerArea';
import { CardPreview } from './CardPreview';
import { ActionButtons } from './ActionButtons';
import { GameCard } from './GameCard';
import { useLobbyStore } from '../../stores/lobbyStore';
import './GameBoard.css';

interface GameBoardProps {
  gameId: string;
  playerId: string;
  isAIGame: boolean;
  isSpectator: boolean;
  onLeave: () => void;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  gameId,
  playerId,
  isAIGame,
  isSpectator,
  onLeave
}) => {
  const [gameOver, setGameOver] = useState<{ winner: string; reason: string } | null>(null);
  const [mulliganDecisionMade, setMulliganDecisionMade] = useState(false);

  // Game state hook
  const {
    setGameState,
    isMyTurn,
    myPlayer,
    opponent,
    phase,
    turn,
    selectedCard,
    hoveredCard,
    cardDefinitions,
    setSelectedCard,
    setHoveredCard
  } = useGameState(playerId);

  // Handle state updates
  const handleStateUpdate = useCallback((state: GameState) => {
    console.log('[GameBoard] State update - Phase:', state.phase, 'Turn:', state.turn);
    setGameState(state);

    // Reset mulligan flag when entering new mulligan phase
    if (state.phase !== GamePhase.START_MULLIGAN) {
      setMulliganDecisionMade(false);
    }
  }, [setGameState]);

  // Handle game end
  const handleGameEnd = useCallback((winner: string, reason: string) => {
    console.log('[GameBoard] Game ended - Winner:', winner, 'Reason:', reason);
    setGameOver({ winner, reason });
    useLobbyStore.getState().reset();
  }, []);

  // Handle errors
  const handleError = useCallback((error: string) => {
    console.error('[GameBoard] Error:', error);
  }, []);

  // Socket hook
  const {
    keepHand,
    mulligan,
    playCard,
    declareAttack,
    endTurn,
    pass,
    useCounter,
    passCounter,
    activateTrigger,
    passTrigger
  } = useGameSocket({
    gameId,
    playerId,
    isAIGame,
    isSpectator,
    onStateUpdate: handleStateUpdate,
    onGameEnd: handleGameEnd,
    onError: handleError
  });

  // Calculate playable cards
  const playableCards = useMemo(() => {
    const playable = new Set<string>();
    if (!myPlayer || !isMyTurn || phase !== GamePhase.MAIN_PHASE) return playable;

    myPlayer.hand.forEach(card => {
      const def = cardDefinitions.get(card.cardId);
      if (def?.cost !== undefined && myPlayer.donField.length >= def.cost) {
        playable.add(card.id);
      }
    });

    return playable;
  }, [myPlayer, isMyTurn, phase, cardDefinitions]);

  // Calculate valid attack targets
  const targetableCards = useMemo(() => {
    const targets = new Set<string>();
    if (!opponent || !isMyTurn || phase !== GamePhase.MAIN_PHASE) return targets;
    if (!selectedCard) return targets;

    // Check if selected card can attack
    const canAttack = selectedCard.state !== 'RESTED' && !selectedCard.hasAttacked;
    if (!canAttack) return targets;

    // Leader is always targetable
    if (opponent.leaderCard) {
      targets.add(opponent.leaderCard.id);
    }

    // Rested characters are targetable
    opponent.field.forEach(card => {
      if (card.state === 'RESTED') {
        targets.add(card.id);
      }
    });

    return targets;
  }, [opponent, isMyTurn, phase, selectedCard]);

  // Card click handler
  const handleCardClick = useCallback((card: GameCardType) => {
    if (isSpectator) return;

    // If card is in hand and playable, play it
    if (card.zone === CardZone.HAND && playableCards.has(card.id)) {
      playCard(card.id);
      return;
    }

    // If we have a selected card and clicking a target, attack
    if (selectedCard && targetableCards.has(card.id)) {
      declareAttack(selectedCard.id, card.id);
      setSelectedCard(null);
      return;
    }

    // Select/deselect card
    if (selectedCard?.id === card.id) {
      setSelectedCard(null);
    } else if (card.owner === playerId && card.zone === CardZone.FIELD) {
      setSelectedCard(card);
    }
  }, [isSpectator, playableCards, selectedCard, targetableCards, playCard, declareAttack, setSelectedCard, playerId]);

  // Card hover handler
  const handleCardHover = useCallback((card: GameCardType | null) => {
    setHoveredCard(card);
  }, [setHoveredCard]);

  // Mulligan handlers
  const handleKeepHand = useCallback(() => {
    setMulliganDecisionMade(true);
    keepHand();
  }, [keepHand]);

  const handleMulligan = useCallback(() => {
    setMulliganDecisionMade(true);
    mulligan();
  }, [mulligan]);

  // Get phase display name
  const getPhaseDisplay = (p: GamePhase | null): string => {
    if (!p) return '';
    const phaseNames: Record<GamePhase, string> = {
      [GamePhase.START_WAITING]: 'Waiting',
      [GamePhase.START_MULLIGAN]: 'Mulligan',
      [GamePhase.START_SETUP]: 'Setup',
      [GamePhase.UNTAP_PHASE]: 'Untap',
      [GamePhase.DRAW_PHASE]: 'Draw',
      [GamePhase.DON_PHASE]: 'DON',
      [GamePhase.MAIN_PHASE]: 'Main',
      [GamePhase.COMBAT_PHASE]: 'Combat',
      [GamePhase.END_PHASE]: 'End',
      [GamePhase.COUNTER_STEP]: 'Counter',
      [GamePhase.BLOCKER_STEP]: 'Blocker',
      [GamePhase.TRIGGER_STEP]: 'Trigger',
      [GamePhase.GAME_OVER]: 'Game Over'
    };
    return phaseNames[p] || p;
  };

  // Check if hovered card should be hidden (opponent's hand or life)
  const isHoveredCardHidden = useMemo(() => {
    if (!hoveredCard) return false;
    if (hoveredCard.owner === playerId) return false;
    // Hide opponent's hand and life cards
    return hoveredCard.zone === CardZone.HAND || hoveredCard.zone === CardZone.LIFE;
  }, [hoveredCard, playerId]);

  // Show mulligan overlay
  const showMulligan = phase === GamePhase.START_MULLIGAN && !mulliganDecisionMade && myPlayer;

  return (
    <div className="game-board">
      {/* Header */}
      <div className="game-board__header">
        <div className="game-board__header-info">
          <span className="game-board__turn">Turn {turn}</span>
          <span className="game-board__phase">{getPhaseDisplay(phase)}</span>
          <span className={`game-board__turn-indicator ${isMyTurn ? 'game-board__turn-indicator--your-turn' : 'game-board__turn-indicator--waiting'}`}>
            {isMyTurn ? 'Your Turn' : "Opponent's Turn"}
          </span>
        </div>
      </div>

      {/* Main game area */}
      <div className="game-board__main">
        {/* Opponent hand indicator */}
        {opponent && (
          <HandZone
            cards={opponent.hand}
            isOpponent={true}
            cardDefinitions={cardDefinitions}
            onCardHover={handleCardHover}
            onCardClick={handleCardClick}
          />
        )}

        {/* Opponent area */}
        {opponent && (
          <PlayerArea
            player={opponent}
            isOpponent={true}
            cardDefinitions={cardDefinitions}
            targetableCards={targetableCards}
            selectedCard={selectedCard}
            onCardHover={handleCardHover}
            onCardClick={handleCardClick}
          />
        )}

        {/* Player area */}
        {myPlayer && (
          <PlayerArea
            player={myPlayer}
            isOpponent={false}
            cardDefinitions={cardDefinitions}
            playableCards={playableCards}
            selectedCard={selectedCard}
            onCardHover={handleCardHover}
            onCardClick={handleCardClick}
          />
        )}

        {/* Player hand */}
        {myPlayer && !showMulligan && (
          <HandZone
            cards={myPlayer.hand}
            isOpponent={false}
            cardDefinitions={cardDefinitions}
            playableCards={playableCards}
            selectedCard={selectedCard}
            onCardHover={handleCardHover}
            onCardClick={handleCardClick}
          />
        )}
      </div>

      {/* Sidebar: Card Preview + Actions */}
      <div className="game-board__sidebar">
        <CardPreview
          card={hoveredCard}
          cardDef={hoveredCard ? cardDefinitions.get(hoveredCard.cardId) : undefined}
          isHidden={isHoveredCardHidden}
        />
        <ActionButtons
          phase={phase}
          isMyTurn={isMyTurn}
          isSpectator={isSpectator}
          onEndTurn={endTurn}
          onPass={pass}
          onKeepHand={handleKeepHand}
          onMulligan={handleMulligan}
          onUseCounter={() => useCounter([])}
          onPassCounter={passCounter}
          onActivateTrigger={() => activateTrigger('')}
          onPassTrigger={passTrigger}
        />
      </div>

      {/* Mulligan overlay */}
      {showMulligan && myPlayer && (
        <div className="mulligan-overlay">
          <div className="mulligan-panel">
            <h2 className="mulligan-panel__title">Starting Hand</h2>
            <p className="mulligan-panel__subtitle">
              Review your starting hand. You may mulligan once for a new hand.
            </p>
            <div className="mulligan-panel__cards">
              {myPlayer.hand.map(card => (
                <div key={card.id} className="mulligan-panel__card">
                  <span className="mulligan-panel__card-name">
                    {cardDefinitions.get(card.cardId)?.name || card.cardId}
                  </span>
                  <GameCard
                    card={card}
                    cardDef={cardDefinitions.get(card.cardId)}
                    faceUp={true}
                    size="large"
                    onHover={handleCardHover}
                  />
                </div>
              ))}
            </div>
            <div className="mulligan-panel__buttons">
              <button
                className="action-btn action-btn--keep"
                onClick={handleKeepHand}
              >
                Keep Hand
              </button>
              <button
                className="action-btn action-btn--mulligan"
                onClick={handleMulligan}
              >
                Mulligan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {gameOver && (
        <div className="game-over-overlay">
          <h1 className={`game-over__title ${gameOver.winner === playerId ? 'game-over__title--victory' : 'game-over__title--defeat'}`}>
            {gameOver.winner === playerId ? 'Victory!' : 'Defeat'}
          </h1>
          <p className="game-over__reason">{gameOver.reason}</p>
          <button
            className="action-btn action-btn--end"
            onClick={onLeave}
          >
            Return to Lobby
          </button>
        </div>
      )}
    </div>
  );
};

export default GameBoard;
