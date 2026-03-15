import React from 'react';
import { PlayerState, GameCard as GameCardType, CardState } from '@optcgsim/shared';
import { ClientCardDefinition } from '../../types/card';
import { GameCard, CardPile } from './GameCard';
import { LifeBar } from './LifeBar';
import './GameBoard.css';

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

const PLAYMAT_TINT_MAP: Record<string, string> = {
  'red': 'linear-gradient(135deg, rgba(192,57,43,0.6), rgba(231,76,60,0.3))',
  'blue': 'linear-gradient(135deg, rgba(41,128,185,0.6), rgba(52,152,219,0.3))',
  'green': 'linear-gradient(135deg, rgba(39,174,96,0.6), rgba(46,204,113,0.3))',
  'purple': 'linear-gradient(135deg, rgba(142,68,173,0.6), rgba(155,89,182,0.3))',
  'black': 'linear-gradient(135deg, rgba(44,62,80,0.6), rgba(52,73,94,0.3))',
  'yellow': 'linear-gradient(135deg, rgba(243,156,18,0.6), rgba(241,196,15,0.3))',
};

function getPlaymatTint(color: string): string {
  // Handle multi-color strings like "RED GREEN" — use first color
  const firstColor = color.split(/[\s\/]+/)[0].toLowerCase();
  return PLAYMAT_TINT_MAP[firstColor] || 'none';
}

const PLAYMAT_TINT_BASE: React.CSSProperties = {
  position: 'absolute', inset: 0, zIndex: 0,
  pointerEvents: 'none', mixBlendMode: 'overlay',
  opacity: 0.3, borderRadius: 'inherit',
};

const DECK_BADGE_BASE: React.CSSProperties = {
  position: 'absolute', top: -8, right: -8,
  color: 'white', fontSize: '10px', fontWeight: 'bold',
  padding: '2px 5px', borderRadius: '8px',
  zIndex: 5, minWidth: '20px', textAlign: 'center',
};

const COUNT_BADGE_BASE: React.CSSProperties = {
  position: 'absolute', top: 2, right: 8,
  fontSize: '10px', zIndex: 5,
};

const DON_COUNT_STYLE: React.CSSProperties = {
  ...COUNT_BADGE_BASE,
  color: 'rgba(241, 196, 15, 0.8)',
  fontWeight: 'bold',
};

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
  cardDefinitions: Map<string, ClientCardDefinition>;
  playableCards?: ReadonlySet<string>;
  targetableCards?: ReadonlySet<string>;
  blockerCards?: ReadonlySet<string>;
  selectedCard?: GameCardType | null;
  selectedDon?: GameCardType | null;
  pendingPlayCard?: GameCardType | null;  // Character card selected from hand waiting to be placed
  donAttachTargets?: ReadonlySet<string>;
  activationDonTargets?: ReadonlySet<string>;  // DON cards valid for activation ability selection
  activationTargets?: ReadonlySet<string>;      // Characters/Leader valid for activation ability target
  attackEffectTargets?: ReadonlySet<string>;    // Valid targets for ON_ATTACK effect selection
  attackEffectSelected?: ReadonlySet<string>;   // Currently selected targets for ON_ATTACK effect
  playEffectTargets?: ReadonlySet<string>;      // Valid targets for ON_PLAY effect selection
  playEffectSelected?: ReadonlySet<string>;     // Currently selected targets for ON_PLAY effect
  eventEffectTargets?: ReadonlySet<string>;     // Valid targets for event [Main] effect selection
  eventEffectSelected?: ReadonlySet<string>;    // Currently selected targets for event effect
  counterEffectTargets?: ReadonlySet<string>;   // Valid targets for event counter effect selection
  counterEffectSelected?: ReadonlySet<string>;  // Currently selected targets for counter effect
  attackAnimation?: AttackAnimation | null;
  onCardHover: (card: GameCardType | null) => void;
  onCardClick: (card: GameCardType) => void;
  onDonClick?: (don: GameCardType) => void;
  onDeckClick?: () => void;
  onTrashClick?: () => void;
  onCharacterZoneClick?: () => void;  // Called when character zone is clicked (for placing pending cards)
  visibleLifeCount?: number;
  visibleDonCount?: number;  // Control how many DON cards to show (for animation)
  hideLifeZone?: boolean;
  gameOverResult?: 'winner' | 'loser' | null;  // Result for this player when game ends
  playmatImage?: string;  // Custom playmat background image path
  isMyTurn?: boolean;  // Whether it's the current player's turn (for DON power display)
  fieldSelectMode?: boolean;  // Whether field character selection is active
  fieldSelectValidTargets?: ReadonlySet<string>;  // Valid character IDs for field selection
  fieldSelectSelectedTargets?: ReadonlySet<string>;  // Currently selected character IDs
  onFieldSelectClick?: (cardId: string) => void;  // Called when a field card is clicked during selection
  combatTargetId?: string | null;  // Card ID being attacked during combat (for persistent highlight)
  leaderColor?: string;  // Leader card's color for playmat tinting (e.g., 'Red', 'Blue', etc.)
}

export const PlayerArea: React.FC<PlayerAreaProps> = ({
  player,
  isOpponent,
  cardDefinitions,
  playableCards = EMPTY_SET,
  targetableCards = EMPTY_SET,
  blockerCards = EMPTY_SET,
  selectedCard,
  selectedDon,
  donAttachTargets = EMPTY_SET,
  activationDonTargets = EMPTY_SET,
  activationTargets = EMPTY_SET,
  attackEffectTargets = EMPTY_SET,
  attackEffectSelected = EMPTY_SET,
  playEffectTargets = EMPTY_SET,
  playEffectSelected = EMPTY_SET,
  eventEffectTargets = EMPTY_SET,
  eventEffectSelected = EMPTY_SET,
  counterEffectTargets = EMPTY_SET,
  counterEffectSelected = EMPTY_SET,
  attackAnimation,
  onCardHover,
  onCardClick,
  // onDonClick - reserved for future use
  onDeckClick,
  onTrashClick,
  onCharacterZoneClick,
  pendingPlayCard,
  visibleLifeCount,
  visibleDonCount,
  hideLifeZone = false,
  gameOverResult,
  playmatImage,
  isMyTurn = true,
  fieldSelectMode = false,
  fieldSelectValidTargets = EMPTY_SET,
  fieldSelectSelectedTargets = EMPTY_SET,
  onFieldSelectClick,
  combatTargetId,
  leaderColor
}) => {
  // DON attached to cards are inactive (dimmed) when it's not the card owner's turn
  // For player's cards: inactive when it's opponent's turn
  // For opponent's cards: always inactive (from player's perspective)
  const isDonInactiveForArea = isOpponent ? true : !isMyTurn;
  // Helper to get attack animation class for a card
  const getAttackAnimationClass = (cardId: string): string => {
    if (attackAnimation) {
      if (attackAnimation.attackerId === cardId) {
        if (attackAnimation.phase === 'jumping') return 'game-card--attack-jumping';
        if (attackAnimation.phase === 'returning') return 'game-card--attack-returning';
      }
      if (attackAnimation.targetId === cardId && attackAnimation.phase === 'jumping') {
        return 'game-card--attack-target';
      }
    }
    // Persistent combat target highlight during BLOCKER_STEP/COUNTER_STEP
    if (combatTargetId && combatTargetId === cardId) {
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

  // Count active DON in cost area
  const activeDonCount = unattachedDon.filter(d => d.state === 'ACTIVE').length;

  // Helper to calculate buff total from a card's powerBuffs
  const getBuffTotal = (card: GameCardType): number => {
    if (!card.powerBuffs || card.powerBuffs.length === 0) return 0;
    return card.powerBuffs.reduce((sum, buff) => sum + buff.value, 0);
  };

  // DON bonus: player's cards get it on player's turn, opponent's cards get it on opponent's turn
  // This determines if DON bonus applies for cards in this PlayerArea
  const isOwnersTurn = isOpponent ? !isMyTurn : isMyTurn;

  // Helper to calculate effective power (base + buffs + DON)
  // DON bonus only applies on the card owner's turn (One Piece TCG rule)
  const getEffectivePower = (card: GameCardType, attachedDonCount: number): number => {
    const basePower = card.basePower ?? card.power ?? 0;
    const buffTotal = getBuffTotal(card);
    const donBonus = isOwnersTurn ? (attachedDonCount * 1000) : 0;
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
      {/* Leader color tint overlay */}
      {leaderColor && (
        <div style={{ ...PLAYMAT_TINT_BASE, background: getPlaymatTint(leaderColor) }} />
      )}

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
        <div className="zone zone--leader" {...(!isOpponent ? { 'data-zone': 'leader' } : {})}>
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
                    showDonBonus={isOwnersTurn}
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
        <div className="zone zone--deck" style={{ position: 'relative' }}>
          <span className="zone__label zone__label--bottom">Deck</span>
          <CardPile
            cards={player.deck}
            label="Deck"
            showCount={true}
            faceUp={false}
            onClick={onDeckClick}
          />
          <div style={{
            ...DECK_BADGE_BASE,
            backgroundColor: player.deck.length <= 5 ? 'rgba(231, 76, 60, 0.9)' : 'rgba(0, 0, 0, 0.8)',
            border: player.deck.length <= 5 ? '1px solid #e74c3c' : '1px solid rgba(255,255,255,0.2)',
          }}>
            {player.deck.length}
          </div>
        </div>
      </div>

      {/* Main center area: Characters, Cost Area, Trash */}
      <div className="player-area__center">
        {/* Character Area - clickable when pending card placement */}
        <div
          className={`zone zone--characters ${!isOpponent && pendingPlayCard ? 'zone--drop-target' : ''}`}
          {...(!isOpponent ? { 'data-zone': 'character-field' } : {})}
          style={{ position: 'relative' }}
          onClick={!isOpponent && pendingPlayCard && onCharacterZoneClick ? onCharacterZoneClick : undefined}
        >
          <span className="zone__label zone__label--inside">Characters</span>
          <span style={{
            ...COUNT_BADGE_BASE,
            color: characters.length >= 5 ? '#e74c3c' : 'rgba(255,255,255,0.5)',
            fontWeight: characters.length >= 5 ? 'bold' : 'normal',
          }}>
            {characters.length}/5
          </span>
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
                    showDonBonus={isOwnersTurn}
                    effectivePower={getEffectivePower(card, attachedDons.length)}
                    buffTotal={getBuffTotal(card)}
                    className={[
                      getAttackAnimationClass(card.id),
                      fieldSelectMode && fieldSelectValidTargets.has(card.id) && 'game-card--field-selectable',
                      fieldSelectMode && fieldSelectSelectedTargets.has(card.id) && 'game-card--field-selected'
                    ].filter(Boolean).join(' ')}
                    onHover={onCardHover}
                    onClick={fieldSelectMode && fieldSelectValidTargets.has(card.id) && onFieldSelectClick
                      ? () => onFieldSelectClick(card.id)
                      : () => onCardClick(card)}
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
          <div className="zone zone--cost-area" {...(!isOpponent ? { 'data-zone': 'don-field' } : {})} style={{ position: 'relative' }}>
            <span className="zone__label zone__label--inside">Cost Area</span>
            <span style={DON_COUNT_STYLE}>
              {activeDonCount}/{unattachedDon.length}
            </span>
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
  cardDefinitions: Map<string, ClientCardDefinition>;
  playableCards?: ReadonlySet<string>;
  selectedCard?: GameCardType | null;
  pinnedCard?: GameCardType | null;  // For combat phase card selection highlighting
  pendingPlayCard?: GameCardType | null;  // Character card selected for placement
  activateEffectSelectedTargets?: string[];  // Cards selected for activate effect
  handSelectMode?: boolean;                  // Whether hand select mode is active (discard, etc.)
  handSelectSelectedCards?: ReadonlySet<string>;     // Cards selected for hand select effect
  onCardHover: (card: GameCardType | null) => void;
  onCardClick: (card: GameCardType) => void;
  onHandSelectCardClick?: (card: GameCardType) => void;  // Handler for hand select clicks
}

export const HandZone: React.FC<HandZoneProps> = ({
  cards,
  isOpponent,
  cardDefinitions,
  playableCards = EMPTY_SET,
  selectedCard,
  pinnedCard,
  pendingPlayCard,
  activateEffectSelectedTargets = [],
  handSelectMode = false,
  handSelectSelectedCards = EMPTY_SET,
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
          const isPendingPlay = !isOpponent && pendingPlayCard?.id === card.id;

          // Determine click handler based on mode
          const handleClick = handSelectMode && onHandSelectCardClick
            ? () => onHandSelectCardClick(card)
            : onCardClick;

          const wrapperClasses = [
            'hand-zone__card-wrapper',
            isRested && 'hand-zone__card-wrapper--rested',
            isPendingPlay && 'hand-zone__card-wrapper--pending-play'
          ].filter(Boolean).join(' ');

          return (
            <div
              key={card.id}
              className={wrapperClasses}
            >
              <GameCard
                card={card}
                cardDef={isOpponent ? undefined : cardDefinitions.get(card.cardId)}
                faceUp={!isOpponent}
                isPlayable={!isOpponent && !handSelectMode && !isPendingPlay && playableCards.has(card.id)}
                isSelected={!isOpponent && (selectedCard?.id === card.id || pinnedCard?.id === card.id || activateEffectSelectedTargets.includes(card.id) || isPendingPlay)}
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
