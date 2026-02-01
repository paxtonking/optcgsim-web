import React from 'react';
import { PlayerState, GameCard as GameCardType, CardState } from '@optcgsim/shared';
import { GameCard, CardPile } from './GameCard';
import { LifeBar } from './LifeBar';
import './GameBoard.css';

interface CardDefinition {
  id: string;
  name: string;
  type?: string;
  cardType?: string;
  color?: string;
  colors?: string[];
  cost?: number | null;
  power?: number | null;
  counter?: number | null;
  imageUrl?: string;
  keywords?: string[];
}

// Create a fake DON deck card for the pile display
const createDonDeckCard = (): GameCardType => ({
  id: 'don-deck',
  cardId: 'DON',
  zone: 'DON_DECK' as any,
  state: 'ACTIVE' as any,
  owner: '',
});

interface AttackAnimation {
  attackerId: string;
  targetId: string;
  phase: 'jumping' | 'returning' | 'done';
}

interface PlayerAreaProps {
  player: PlayerState;
  isOpponent: boolean;
  cardDefinitions: Map<string, CardDefinition>;
  playableCards?: Set<string>;
  targetableCards?: Set<string>;
  blockerCards?: Set<string>;
  selectedCard?: GameCardType | null;
  selectedDon?: GameCardType | null;
  donAttachTargets?: Set<string>;
  activationDonTargets?: Set<string>;  // DON cards valid for activation ability selection
  activationTargets?: Set<string>;      // Characters/Leader valid for activation ability target
  attackEffectTargets?: Set<string>;    // Valid targets for ON_ATTACK effect selection
  attackEffectSelected?: Set<string>;   // Currently selected targets for ON_ATTACK effect
  playEffectTargets?: Set<string>;      // Valid targets for ON_PLAY effect selection
  playEffectSelected?: Set<string>;     // Currently selected targets for ON_PLAY effect
  eventEffectTargets?: Set<string>;     // Valid targets for event [Main] effect selection
  eventEffectSelected?: Set<string>;    // Currently selected targets for event effect
  counterEffectTargets?: Set<string>;   // Valid targets for event counter effect selection
  counterEffectSelected?: Set<string>;  // Currently selected targets for counter effect
  attackAnimation?: AttackAnimation | null;
  onCardHover: (card: GameCardType | null) => void;
  onCardClick: (card: GameCardType) => void;
  onDonClick?: (don: GameCardType) => void;
  onDeckClick?: () => void;
  onTrashClick?: () => void;
  visibleLifeCount?: number;
  visibleDonCount?: number;  // Control how many DON cards to show (for animation)
  hideLifeZone?: boolean;
  gameOverResult?: 'winner' | 'loser' | null;  // Result for this player when game ends
  playmatImage?: string;  // Custom playmat background image path
  isMyTurn?: boolean;  // Whether it's the current player's turn (for DON power display)
}

export const PlayerArea: React.FC<PlayerAreaProps> = ({
  player,
  isOpponent,
  cardDefinitions,
  playableCards = new Set(),
  targetableCards = new Set(),
  blockerCards = new Set(),
  selectedCard,
  selectedDon,
  donAttachTargets = new Set(),
  activationDonTargets = new Set(),
  activationTargets = new Set(),
  attackEffectTargets = new Set(),
  attackEffectSelected = new Set(),
  playEffectTargets = new Set(),
  playEffectSelected = new Set(),
  eventEffectTargets = new Set(),
  eventEffectSelected = new Set(),
  counterEffectTargets = new Set(),
  counterEffectSelected = new Set(),
  attackAnimation,
  onCardHover,
  onCardClick,
  // onDonClick - reserved for future use
  onDeckClick,
  onTrashClick,
  visibleLifeCount,
  visibleDonCount,
  hideLifeZone = false,
  gameOverResult,
  playmatImage,
  isMyTurn = true
}) => {
  // DON attached to cards are inactive (dimmed) when it's not the card owner's turn
  // For player's cards: inactive when it's opponent's turn
  // For opponent's cards: always inactive (from player's perspective)
  const isDonInactiveForArea = isOpponent ? true : !isMyTurn;
  // Helper to get attack animation class for a card
  const getAttackAnimationClass = (cardId: string): string => {
    if (!attackAnimation) return '';
    if (attackAnimation.attackerId === cardId) {
      if (attackAnimation.phase === 'jumping') return 'game-card--attack-jumping';
      if (attackAnimation.phase === 'returning') return 'game-card--attack-returning';
    }
    if (attackAnimation.targetId === cardId && attackAnimation.phase === 'jumping') {
      return 'game-card--attack-target';
    }
    return '';
  };
  const areaClasses = [
    'player-area',
    isOpponent ? 'player-area--opponent' : 'player-area--player',
    gameOverResult === 'winner' && 'player-area--winner',
    gameOverResult === 'loser' && 'player-area--loser'
  ].filter(Boolean).join(' ');

  // Get characters on field (non-leader)
  const characters = player.field.filter(card => card.zone === 'FIELD');

  // Helper to get attached DON cards for a card
  const getAttachedDon = (cardId: string): GameCardType[] => {
    return player.donField.filter(don => don.attachedTo === cardId);
  };

  // Get unattached DON (shown in Cost Area)
  const allUnattachedDon = player.donField.filter(don => !don.attachedTo);

  // Slice to visible count if specified (for animation)
  const unattachedDon = visibleDonCount !== undefined
    ? allUnattachedDon.slice(0, visibleDonCount)
    : allUnattachedDon;

  // Count active DON in cost area (reserved for future use)
  void unattachedDon.filter(d => d.state === 'ACTIVE').length;

  // Helper to calculate buff total from a card's powerBuffs
  const getBuffTotal = (card: GameCardType): number => {
    if (!card.powerBuffs || card.powerBuffs.length === 0) return 0;
    return card.powerBuffs.reduce((sum, buff) => sum + buff.value, 0);
  };

  // Helper to calculate effective power (base + buffs + DON)
  const getEffectivePower = (card: GameCardType, attachedDonCount: number): number => {
    const basePower = card.basePower ?? card.power ?? 0;
    const buffTotal = getBuffTotal(card);
    const donBonus = attachedDonCount * 1000;
    return basePower + buffTotal + donBonus;
  };

  return (
    <div className={areaClasses}>
      {/* Playmat background */}
      <div
        className="player-area__playmat"
        style={{
          backgroundImage: `url('${playmatImage || '/assets/playmats/playmatt.jpg'}')`
        }}
      />

      {/* Game over result banner */}
      {gameOverResult && (
        <div className={`player-area__result-banner player-area__result-banner--${gameOverResult}`}>
          {gameOverResult === 'winner' ? 'WINNER' : 'LOSER'}
        </div>
      )}

      {/* Left column: Life Zone + DON Deck */}
      <div className="player-area__left">
        <div className={`zone zone--life ${hideLifeZone ? 'zone--life--hidden' : ''}`}>
          <span className="zone__label zone__label--inside">Life</span>
          <LifeBar
            current={visibleLifeCount !== undefined && visibleLifeCount >= 0 ? visibleLifeCount : player.lifeCards.length}
            max={player.maxLife ?? 5}
          />
          <div className="life-stack">
            {(visibleLifeCount !== undefined && visibleLifeCount >= 0
              ? player.lifeCards.slice(0, visibleLifeCount)
              : player.lifeCards
            ).map((card) => (
              <GameCard
                key={card.id}
                card={card}
                faceUp={false}
                onHover={onCardHover}
                onClick={onCardClick}
              />
            ))}
          </div>
        </div>

        {/* DON Deck pile */}
        <div className="zone zone--don-deck">
          <span className="zone__label zone__label--bottom">DON Deck</span>
          <div className="don-deck-pile">
            {player.donDeck > 0 ? (
              <>
                {player.donDeck > 2 && <div className="don-deck-layer don-deck-layer--3" />}
                {player.donDeck > 1 && <div className="don-deck-layer don-deck-layer--2" />}
                <div className="don-deck-top">
                  <GameCard
                    card={createDonDeckCard()}
                    faceUp={false}
                    isDon={true}
                  />
                </div>
                <div className="don-deck-count">{player.donDeck}</div>
              </>
            ) : (
              <div className="don-deck-empty" />
            )}
          </div>
        </div>
      </div>

      {/* Second column: Leader, Stage, Deck (stacked vertically) */}
      <div className="player-area__second-col">
        {/* Leader Zone */}
        <div className="zone zone--leader">
          <span className="zone__label zone__label--bottom">Leader</span>
          {player.leaderCard && (() => {
            const leaderDef = cardDefinitions.get(player.leaderCard.cardId);
            const isLeaderRested = player.leaderCard.state === CardState.RESTED;
            const leaderAttachedDons = getAttachedDon(player.leaderCard.id);
            return (
              <div className="card-with-stats">
                <div className={`card-with-don ${isLeaderRested ? 'card-with-don--rested' : ''}`}>
                  {leaderAttachedDons.length > 0 && (
                    <div className="attached-don-stack">
                      {leaderAttachedDons.map((don) => (
                        <div key={don.id} className="attached-don-card">
                          <GameCard
                            card={don}
                            faceUp={true}
                            isDon={true}
                            isDonInactive={isDonInactiveForArea}
                            onHover={onCardHover}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <GameCard
                    card={player.leaderCard}
                    cardDef={leaderDef}
                    faceUp={true}
                    isTarget={targetableCards.has(player.leaderCard.id)}
                    isDonTarget={!isOpponent && (donAttachTargets.has(player.leaderCard.id) || activationTargets.has(player.leaderCard.id))}
                    isSelected={selectedCard?.id === player.leaderCard.id}
                    isAttackEffectTarget={attackEffectTargets.has(player.leaderCard.id)}
                    isAttackEffectSelected={attackEffectSelected.has(player.leaderCard.id)}
                    isPlayEffectTarget={playEffectTargets.has(player.leaderCard.id)}
                    isPlayEffectSelected={playEffectSelected.has(player.leaderCard.id)}
                    isEventEffectTarget={eventEffectTargets.has(player.leaderCard.id)}
                    isEventEffectSelected={eventEffectSelected.has(player.leaderCard.id)}
                    isCounterEffectTarget={counterEffectTargets.has(player.leaderCard.id)}
                    isCounterEffectSelected={counterEffectSelected.has(player.leaderCard.id)}
                    attachedDonCount={leaderAttachedDons.length}
                    effectivePower={getEffectivePower(player.leaderCard, leaderAttachedDons.length)}
                    buffTotal={getBuffTotal(player.leaderCard)}
                    className={[
                      getAttackAnimationClass(player.leaderCard.id),
                      gameOverResult === 'winner' && 'game-card--winner-leader',
                      gameOverResult === 'loser' && 'game-card--loser-leader'
                    ].filter(Boolean).join(' ')}
                    onHover={onCardHover}
                    onClick={onCardClick}
                  />
                </div>
                <span className={`card-with-stats__stats ${getBuffTotal(player.leaderCard) > 0 ? 'card-with-stats__stats--buffed' : getBuffTotal(player.leaderCard) < 0 ? 'card-with-stats__stats--debuffed' : ''}`}>
                  {getEffectivePower(player.leaderCard, leaderAttachedDons.length)}
                </span>
              </div>
            );
          })()}
        </div>

        {/* Stage Zone */}
        <div className="zone zone--stage">
          <span className="zone__label zone__label--bottom">Stage</span>
          {player.stage ? (
            <GameCard
              card={player.stage}
              cardDef={cardDefinitions.get(player.stage.cardId)}
              faceUp={true}
              hasActiveEffect={player.stage.hasActiveEffect}
              isEventEffectTarget={eventEffectTargets.has(player.stage.id)}
              isEventEffectSelected={eventEffectSelected.has(player.stage.id)}
              onHover={onCardHover}
              onClick={onCardClick}
            />
          ) : (
            <div className="zone-empty-placeholder" />
          )}
        </div>

        {/* Deck Zone */}
        <div className="zone zone--deck">
          <span className="zone__label zone__label--bottom">Deck</span>
          <CardPile
            cards={player.deck}
            label="Deck"
            showCount={true}
            faceUp={false}
            onClick={onDeckClick}
          />
        </div>
      </div>

      {/* Main center area: Characters, Cost Area, Trash */}
      <div className="player-area__center">
        {/* Character Area */}
        <div className="zone zone--characters">
          <span className="zone__label zone__label--inside">Characters</span>
          {characters.map(card => {
            const cardDef = cardDefinitions.get(card.cardId);
            const isRested = card.state === CardState.RESTED;
            const attachedDons = getAttachedDon(card.id);
            const extraMarginRight = (isRested ? 28 : 0) + (attachedDons.length * 15);
            const extraMarginLeft = isRested ? 28 : 0;
            return (
              <div
                key={card.id}
                className="card-with-stats"
                style={{
                  marginRight: extraMarginRight > 0 ? extraMarginRight : undefined,
                  marginLeft: extraMarginLeft > 0 ? extraMarginLeft : undefined
                }}
              >
                <div className={`card-with-don ${isRested ? 'card-with-don--rested' : ''}`}>
                  {attachedDons.length > 0 && (
                    <div className="attached-don-stack">
                      {attachedDons.map((don) => (
                        <div key={don.id} className="attached-don-card">
                          <GameCard
                            card={don}
                            faceUp={true}
                            isDon={true}
                            isDonInactive={isDonInactiveForArea}
                            onHover={onCardHover}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <GameCard
                    card={card}
                    cardDef={cardDef}
                    faceUp={true}
                    isPlayable={!isOpponent && (playableCards.has(card.id) || blockerCards.has(card.id))}
                    isTarget={targetableCards.has(card.id)}
                    isDonTarget={!isOpponent && (donAttachTargets.has(card.id) || activationTargets.has(card.id))}
                    isSelected={selectedCard?.id === card.id}
                    isAttackEffectTarget={attackEffectTargets.has(card.id)}
                    isAttackEffectSelected={attackEffectSelected.has(card.id)}
                    isPlayEffectTarget={playEffectTargets.has(card.id)}
                    isPlayEffectSelected={playEffectSelected.has(card.id)}
                    isEventEffectTarget={eventEffectTargets.has(card.id)}
                    isEventEffectSelected={eventEffectSelected.has(card.id)}
                    isCounterEffectTarget={counterEffectTargets.has(card.id)}
                    isCounterEffectSelected={counterEffectSelected.has(card.id)}
                    attachedDonCount={attachedDons.length}
                    effectivePower={getEffectivePower(card, attachedDons.length)}
                    buffTotal={getBuffTotal(card)}
                    className={getAttackAnimationClass(card.id)}
                    onHover={onCardHover}
                    onClick={onCardClick}
                  />
                </div>
                <span className={`card-with-stats__stats ${getBuffTotal(card) > 0 ? 'card-with-stats__stats--buffed' : getBuffTotal(card) < 0 ? 'card-with-stats__stats--debuffed' : ''}`}>
                  {cardDef?.cost ?? '?'}/{getEffectivePower(card, attachedDons.length)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Bottom row: Cost Area | Trash */}
        <div className="player-area__bottom-row">
          {/* Cost Area (DON cards in play) */}
          <div className="zone zone--cost-area">
            <span className="zone__label zone__label--inside">Cost Area</span>
            <div className="cost-area-cards">
              {unattachedDon.map((don) => (
                <GameCard
                  key={don.id}
                  card={don}
                  faceUp={true}
                  isDon={true}
                  isPlayable={!isOpponent && don.state === 'ACTIVE'}
                  isDonTarget={!isOpponent && activationDonTargets.has(don.id)}
                  isSelected={selectedDon?.id === don.id}
                  isPlayEffectTarget={playEffectTargets.has(don.id)}
                  isPlayEffectSelected={playEffectSelected.has(don.id)}
                  onHover={onCardHover}
                  onClick={!isOpponent ? onCardClick : undefined}
                />
              ))}
            </div>
          </div>

          {/* Trash Zone */}
          <div className="zone zone--trash">
            <span className="zone__label zone__label--bottom">Trash</span>
            <CardPile
              cards={player.trash}
              label="Trash"
              showCount={true}
              faceUp={player.trash.length > 0}
              showLastCard={true}
              onClick={onTrashClick}
              onCardHover={onCardHover}
              cardDefinitions={cardDefinitions}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// Hand Zone Component (separate for better flexibility)
interface HandZoneProps {
  cards: GameCardType[];
  isOpponent: boolean;
  cardDefinitions: Map<string, CardDefinition>;
  playableCards?: Set<string>;
  selectedCard?: GameCardType | null;
  pinnedCard?: GameCardType | null;  // For combat phase card selection highlighting
  activateEffectSelectedTargets?: string[];  // Cards selected for activate effect
  handSelectMode?: boolean;                  // Whether hand select mode is active (discard, etc.)
  handSelectSelectedCards?: Set<string>;     // Cards selected for hand select effect
  onCardHover: (card: GameCardType | null) => void;
  onCardClick: (card: GameCardType) => void;
  onHandSelectCardClick?: (card: GameCardType) => void;  // Handler for hand select clicks
}

export const HandZone: React.FC<HandZoneProps> = ({
  cards,
  isOpponent,
  cardDefinitions,
  playableCards = new Set(),
  selectedCard,
  pinnedCard,
  activateEffectSelectedTargets = [],
  handSelectMode = false,
  handSelectSelectedCards = new Set(),
  onCardHover,
  onCardClick,
  onHandSelectCardClick
}) => {
  const classes = [
    'hand-zone',
    isOpponent && 'hand-zone--opponent'
  ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <div className="hand-zone__cards">
        {cards.map(card => {
          // Add extra spacing for rested cards shown in hand zone (during blocker step)
          const isRested = card.state === CardState.RESTED;
          const isHandSelectTarget = !isOpponent && handSelectMode;
          const isHandSelectSelected = handSelectSelectedCards.has(card.id);

          // Determine click handler based on mode
          const handleClick = handSelectMode && onHandSelectCardClick
            ? () => onHandSelectCardClick(card)
            : onCardClick;

          return (
            <div
              key={card.id}
              className={`hand-zone__card-wrapper ${isRested ? 'hand-zone__card-wrapper--rested' : ''}`}
            >
              <GameCard
                card={card}
                cardDef={isOpponent ? undefined : cardDefinitions.get(card.cardId)}
                faceUp={!isOpponent}
                isPlayable={!isOpponent && !handSelectMode && playableCards.has(card.id)}
                isSelected={!isOpponent && (selectedCard?.id === card.id || pinnedCard?.id === card.id || activateEffectSelectedTargets.includes(card.id))}
                isEventEffectTarget={isHandSelectTarget && !isHandSelectSelected}
                isEventEffectSelected={isHandSelectSelected}
                hasCostModified={!isOpponent && card.modifiedCost !== undefined}
                onHover={isOpponent ? undefined : onCardHover}
                onClick={isOpponent ? undefined : handleClick}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PlayerArea;
