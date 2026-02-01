import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { GameState, GameCard as GameCardType, GamePhase, CardZone, CardState, RPSChoice, RPSState, PendingActivateEffect, PendingDeckRevealEffect, PendingHandSelectEffect } from '@optcgsim/shared';
import { useGameSocket } from '../../hooks/useGameSocket';
import { useGameState } from '../../hooks/useGameState';
import { useSoundEffects } from '../../hooks/useSoundEffects';
import { PlayerArea, HandZone } from './PlayerArea';
import { CardPreview } from './CardPreview';
import { ActionButtons } from './ActionButtons';
import { GameCard } from './GameCard';
import { AnimatingCard } from './AnimatingCard';
import { CombatModal } from './CombatModal';
import { SettingsModal } from './SettingsModal';
import { RPSModal } from './RPSModal';
import { RPSResultModal } from './RPSResultModal';
import { FirstChoiceModal } from './FirstChoiceModal';
import { PreGameSetup } from './PreGameSetup';
import { DeckRevealModal } from './DeckRevealModal';
import { useLobbyStore } from '../../stores/lobbyStore';
import { getSocket } from '../../services/socket';
import { EffectToastContainer } from './EffectToast';
import { EffectAnimationLayer, EffectAnimationAPI } from './EffectAnimation';
import { useEffectToast } from '../../hooks/useEffectToast';
import './GameBoard.css';
import './RPSModal.css';
import './EffectToast.css';
import './EffectAnimation.css';

// Animation types
type DealingPhase = 'idle' | 'dealing-hand' | 'waiting-mulligan' | 'dealing-life' | 'complete';

interface AnimatingCardData {
  id: string;
  card: GameCardType;
  faceUp: boolean;
  startPos: { x: number; y: number };
  endPos: { x: number; y: number };
  delay: number;
  targetZone: 'hand' | 'life' | 'don' | 'trash';
  isOpponent: boolean;
  endRotation?: number;  // rotation at end (90 for life cards)
  flipDuringFlight?: boolean;  // for DON cards that flip from face-down to face-up
}

interface GameBoardProps {
  gameId: string;
  playerId: string;
  isAIGame: boolean;
  onLeave: () => void;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  gameId,
  playerId,
  isAIGame,
  onLeave
}) => {
  const [gameOver, setGameOver] = useState<{ winner: string; reason: string } | null>(null);
  const [mulliganDecisionMade, setMulliganDecisionMade] = useState(false);
  const [mulliganTimer, setMulliganTimer] = useState<number>(20);

  // RPS (Rock-Paper-Scissors) state
  const [rpsPhase, setRpsPhase] = useState<'choosing' | 'result' | 'first-choice' | 'none'>('none');
  const [rpsState, setRpsState] = useState<RPSState | null>(null);
  const [rpsWinnerId, setRpsWinnerId] = useState<string | null>(null);
  const [turnOrderBanner, setTurnOrderBanner] = useState<{ goesFirst: boolean; visible: boolean } | null>(null);

  // Animation state
  const [dealingPhase, setDealingPhase] = useState<DealingPhase>('idle');
  const [animatingCards, setAnimatingCards] = useState<AnimatingCardData[]>([]);
  const [visibleHandCount, setVisibleHandCount] = useState<{ player: number; opponent: number }>({ player: 5, opponent: 5 });
  // Initialize to -1 to indicate "not yet set" - will be set to actual values on first game state load
  const [visibleLifeCount, setVisibleLifeCount] = useState<{ player: number; opponent: number }>({ player: -1, opponent: -1 });
  const [isAnimationBlocked, setIsAnimationBlocked] = useState(false);
  const previousPhaseRef = useRef<GamePhase | null>(null);
  const animationTriggeredRef = useRef(false);

  // DON animation state
  const [animatingDon, setAnimatingDon] = useState<AnimatingCardData[]>([]);
  const previousDonCountRef = useRef<{ player: number; opponent: number }>({ player: 0, opponent: 0 });
  const [visibleDonCount, setVisibleDonCount] = useState<{ player: number; opponent: number }>({ player: 0, opponent: 0 });

  // DON refresh animation state (Refresh Phase - DON returning to cost area)
  const [animatingDonRefresh, setAnimatingDonRefresh] = useState<AnimatingCardData[]>([]);
  const [showRefreshBanner, setShowRefreshBanner] = useState(false);
  const refreshPhaseTriggeredRef = useRef<number>(0); // Track which turn triggered refresh

  // Life damage animation state
  const [animatingLifeDamage, setAnimatingLifeDamage] = useState<AnimatingCardData[]>([]);
  // Initialize to -1 to indicate "not yet set" - prevents false damage detection on first load
  const previousLifeCountRef = useRef<{ player: number; opponent: number }>({ player: -1, opponent: -1 });
  const [lifeDamageIndicator, setLifeDamageIndicator] = useState<{
    amount: number;
    isOpponent: boolean;
    key: number;
  } | null>(null);

  // Sound effects
  const { playSound, isMuted, toggleMute } = useSoundEffects();

  // Effect toast notifications
  const { toasts, removeToast } = useEffectToast();

  // Effect animations
  const effectAnimationRef = useRef<EffectAnimationAPI | null>(null);

  // Settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Track previous turn for turn start sound
  const previousTurnRef = useRef<number | null>(null);
  const previousIsMyTurnRef = useRef<boolean | null>(null);

  // Hand draw animation state
  const [animatingHandDraw, setAnimatingHandDraw] = useState<AnimatingCardData[]>([]);
  const previousHandCountRef = useRef<{ player: number; opponent: number }>({ player: 0, opponent: 0 });

  // Mill animation state (deck to trash)
  const [animatingMill, setAnimatingMill] = useState<AnimatingCardData[]>([]);
  const previousTrashCountRef = useRef<{ player: number; opponent: number }>({ player: 0, opponent: 0 });
  const previousDeckCountRef = useRef<{ player: number; opponent: number }>({ player: 0, opponent: 0 });

  // Random playmat selection (assigned once per game session)
  const [playerPlaymat, opponentPlaymat] = useMemo(() => {
    const playmats = ['/assets/playmats/playmat1.webp', '/assets/playmats/playmat2.webp'];
    return Math.random() > 0.5 ? playmats : [playmats[1], playmats[0]];
  }, []);

  // Error banner state
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const errorBannerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Info banner state (for ON_PLAY effects, etc.)
  const [infoBanner, setInfoBanner] = useState<string | null>(null);
  const infoBannerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Counter notification state (shows when opponent uses counter)
  const [counterNotification, setCounterNotification] = useState<{ amount: number } | null>(null);
  const counterNotificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevCounterPowerRef = useRef<number>(0);

  // Show error banner with auto-dismiss
  const showErrorBanner = useCallback((message: string) => {
    // Clear any existing timeout
    if (errorBannerTimeoutRef.current) {
      clearTimeout(errorBannerTimeoutRef.current);
    }
    setErrorBanner(message);
    // Auto-dismiss after 4 seconds
    errorBannerTimeoutRef.current = setTimeout(() => {
      setErrorBanner(null);
    }, 4000);
  }, []);

  // Show info banner with auto-dismiss (for ON_PLAY effects, etc.)
  const showInfoBanner = useCallback((message: string) => {
    // Clear any existing timeout
    if (infoBannerTimeoutRef.current) {
      clearTimeout(infoBannerTimeoutRef.current);
    }
    setInfoBanner(message);
    // Auto-dismiss after 4 seconds
    infoBannerTimeoutRef.current = setTimeout(() => {
      setInfoBanner(null);
    }, 4000);
  }, []);

  // Show counter notification with auto-dismiss
  const showCounterNotification = useCallback((amount: number) => {
    // Clear any existing timeout
    if (counterNotificationTimeoutRef.current) {
      clearTimeout(counterNotificationTimeoutRef.current);
    }
    setCounterNotification({ amount });
    // Auto-dismiss after 3 seconds
    counterNotificationTimeoutRef.current = setTimeout(() => {
      setCounterNotification(null);
    }, 3000);
  }, []);

  // Game state hook
  const {
    gameState,
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
    setHoveredCard,
    getTargetZone
  } = useGameState(playerId);

  // Calculate if current player is the defender in combat
  // Defender is the player who does NOT own the attacking card
  const isDefender = useMemo(() => {
    if (!gameState?.currentCombat || !playerId) return false;
    // Find the attacker card to determine who the defender is
    const attackerId = gameState.currentCombat.attackerId;
    // Check all players to find who owns the attacker
    for (const [pId, player] of Object.entries(gameState.players)) {
      const ownsAttacker =
        player.field.some(c => c.id === attackerId) ||
        player.leaderCard?.id === attackerId;
      if (ownsAttacker) {
        // If this player owns the attacker, the other player is the defender
        return pId !== playerId;
      }
    }
    return false;
  }, [gameState, playerId]);

  // Detect when opponent uses counter and show notification
  useEffect(() => {
    const currentCounterPower = gameState?.currentCombat?.counterPower || 0;
    const prevCounterPower = prevCounterPowerRef.current;

    // If counter power increased and player is the attacker (not defender), opponent used counter
    if (currentCounterPower > prevCounterPower && gameState?.currentCombat && !isDefender) {
      const counterAmount = currentCounterPower - prevCounterPower;
      showCounterNotification(counterAmount);
    }

    // Update ref for next comparison
    prevCounterPowerRef.current = currentCounterPower;

    // Reset when combat ends
    if (!gameState?.currentCombat) {
      prevCounterPowerRef.current = 0;
    }
  }, [gameState?.currentCombat?.counterPower, gameState?.currentCombat, isDefender, showCounterNotification]);

  // Play turn start sound when it becomes your turn
  useEffect(() => {
    if (turn === null || isMyTurn === undefined) return;

    // Check if turn changed or if it's now my turn when it wasn't before
    const turnChanged = previousTurnRef.current !== null && previousTurnRef.current !== turn;
    const becameMyTurn = previousIsMyTurnRef.current === false && isMyTurn === true;

    if ((turnChanged || becameMyTurn) && isMyTurn) {
      playSound('turnStart');
    }

    previousTurnRef.current = turn;
    previousIsMyTurnRef.current = isMyTurn;
  }, [turn, isMyTurn, playSound]);

  // Play victory/defeat sound on game over
  useEffect(() => {
    if (gameOver) {
      if (gameOver.winner === playerId) {
        playSound('victory');
      } else {
        playSound('defeat');
      }
    }
  }, [gameOver, playerId, playSound]);

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

  // Get descriptive message for game over reason
  const getReasonMessage = useCallback((isWinner: boolean, reason: string): string => {
    const messages: Record<string, { win: string; lose: string }> = {
      'normal': {
        win: "You depleted your opponent's life cards!",
        lose: "Your life cards were depleted."
      },
      'deck-out': {
        win: "Your opponent ran out of cards!",
        lose: "You ran out of cards in your deck."
      },
      'surrender': {
        win: "Your opponent surrendered.",
        lose: "You surrendered."
      },
      'disconnect': {
        win: "Your opponent disconnected.",
        lose: "You disconnected."
      }
    };

    const msg = messages[reason] || messages['normal'];
    return isWinner ? msg.win : msg.lose;
  }, []);

  // Position calculation helpers
  const getDeckPosition = useCallback((isOpponent: boolean): { x: number; y: number } => {
    const selector = isOpponent
      ? '.player-area--opponent .card-pile'
      : '.player-area--player .card-pile';
    const deck = document.querySelector(selector);
    if (!deck) return { x: window.innerWidth / 2, y: isOpponent ? 150 : window.innerHeight - 150 };
    const rect = deck.getBoundingClientRect();
    // For opponent area which is flipped, we need to account for scaleY(-1)
    if (isOpponent) {
      return { x: rect.left + rect.width / 2, y: rect.bottom - rect.height / 2 };
    }
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, []);

  const getTrashPosition = useCallback((isOpponent: boolean): { x: number; y: number } => {
    const selector = isOpponent
      ? '.player-area--opponent .zone--trash'
      : '.player-area--player .zone--trash';
    const trash = document.querySelector(selector);
    if (!trash) return { x: window.innerWidth - 200, y: isOpponent ? 150 : window.innerHeight - 150 };
    const rect = trash.getBoundingClientRect();
    // For opponent area which is flipped, we need to account for scaleY(-1)
    if (isOpponent) {
      return { x: rect.left + rect.width / 2, y: rect.bottom - rect.height / 2 };
    }
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, []);

  const getHandCardPosition = useCallback((index: number, total: number, isOpponent: boolean): { x: number; y: number } => {
    const handZone = document.querySelector(isOpponent ? '.hand-zone--opponent' : '.hand-zone:not(.hand-zone--opponent)');
    if (!handZone) {
      const centerX = window.innerWidth / 2 - 140; // Account for sidebar
      const cardWidth = 100;
      const overlap = 20;
      const totalWidth = cardWidth + (total - 1) * (cardWidth - overlap);
      const startX = centerX - totalWidth / 2;
      const x = startX + index * (cardWidth - overlap) + cardWidth / 2;
      const y = isOpponent ? 60 : window.innerHeight - 80;
      return { x, y };
    }
    const rect = handZone.getBoundingClientRect();
    const cardWidth = 100;
    const overlap = 20;
    const totalWidth = cardWidth + (total - 1) * (cardWidth - overlap);
    const startX = rect.left + (rect.width - totalWidth) / 2;
    const x = startX + index * (cardWidth - overlap) + cardWidth / 2;
    const y = rect.top + rect.height / 2;
    return { x, y };
  }, []);

  const getLifeCardPosition = useCallback((index: number, isOpponent: boolean): { x: number; y: number } => {
    const lifeZone = document.querySelector(
      isOpponent ? '.player-area--opponent .zone--life' : '.player-area--player .zone--life'
    );
    if (!lifeZone) {
      return { x: 150, y: isOpponent ? 200 : window.innerHeight - 200 };
    }
    const rect = lifeZone.getBoundingClientRect();
    // Life cards are stacked vertically with offset for each card
    // Cards stack from top to bottom, each offset by ~25px
    const stackOffset = index * 25;

    if (isOpponent) {
      // Opponent area is flipped with scaleY(-1), so we need to invert calculations
      // The life stack appears at the bottom of the flipped area
      const baseY = rect.top + 60;
      return { x: rect.left + rect.width / 2, y: baseY + stackOffset };
    }

    // Player life zone - cards stack from top
    const baseY = rect.top + 60;
    return { x: rect.left + rect.width / 2, y: baseY + stackOffset };
  }, []);

  // DON position helpers
  const getDonDeckPosition = useCallback((isOpponent: boolean): { x: number; y: number } => {
    const selector = isOpponent
      ? '.player-area--opponent .zone--don-deck'
      : '.player-area--player .zone--don-deck';
    const donDeck = document.querySelector(selector);
    if (!donDeck) {
      console.log('[DON Position] Deck element NOT FOUND for selector:', selector);
      return { x: 200, y: isOpponent ? 300 : window.innerHeight - 300 };
    }
    const rect = donDeck.getBoundingClientRect();
    const pos = isOpponent
      ? { x: rect.left + rect.width / 2, y: rect.bottom - rect.height / 2 }
      : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    console.log('[DON Position] Deck found:', selector, 'rect:', { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, 'pos:', pos);
    return pos;
  }, []);

  const getCostAreaPosition = useCallback((index: number, isOpponent: boolean, total: number = 1): { x: number; y: number } => {
    const selector = isOpponent
      ? '.player-area--opponent .zone--cost-area'
      : '.player-area--player .zone--cost-area';
    const costArea = document.querySelector(selector);
    if (!costArea) {
      console.log('[DON Position] Cost area NOT FOUND for selector:', selector);
      return { x: 300 + index * 55, y: isOpponent ? 300 : window.innerHeight - 300 };
    }
    const rect = costArea.getBoundingClientRect();
    const cardWidth = 100;
    const gap = 3;
    // Calculate centered position
    const totalWidth = total * cardWidth + (total - 1) * gap;
    const startX = rect.left + (rect.width - totalWidth) / 2;
    const x = startX + index * (cardWidth + gap) + cardWidth / 2;
    const pos = isOpponent
      ? { x, y: rect.bottom - rect.height / 2 }
      : { x, y: rect.top + rect.height / 2 };
    console.log('[DON Position] Cost area found:', selector, 'index:', index, 'total:', total, 'pos:', pos);
    return pos;
  }, []);

  // Life pile position (for damage animation start)
  const getLifePilePosition = useCallback((isOpponent: boolean): { x: number; y: number } => {
    const selector = isOpponent
      ? '.player-area--opponent .zone--life'
      : '.player-area--player .zone--life';
    const lifeZone = document.querySelector(selector);
    if (!lifeZone) {
      return { x: 100, y: isOpponent ? 200 : window.innerHeight - 200 };
    }
    const rect = lifeZone.getBoundingClientRect();
    // Center of the life zone
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, []);

  // Hand zone center position (for damage animation end)
  const getHandZonePosition = useCallback((cardIndex: number, totalCards: number, isOpponent: boolean): { x: number; y: number } => {
    const handZone = document.querySelector(isOpponent ? '.hand-zone--opponent' : '.hand-zone:not(.hand-zone--opponent)');
    if (!handZone) {
      const centerX = window.innerWidth / 2 - 140;
      return { x: centerX, y: isOpponent ? 60 : window.innerHeight - 80 };
    }
    const rect = handZone.getBoundingClientRect();
    const cardWidth = 70;
    const overlap = 10;
    const totalWidth = cardWidth + (totalCards - 1) * (cardWidth - overlap);
    const startX = rect.left + (rect.width - totalWidth) / 2;
    const x = startX + cardIndex * (cardWidth - overlap) + cardWidth / 2;
    return { x, y: rect.top + rect.height / 2 };
  }, []);

  // Get position of an attached DON card (for refresh animation)
  const getAttachedDonPosition = useCallback((attachedToId: string, donIndex: number, isOpponent: boolean): { x: number; y: number } => {
    // Try to find the card element by data attribute
    const cardSelector = `[data-card-id="${attachedToId}"]`;
    const cardElement = document.querySelector(cardSelector);
    if (cardElement) {
      const rect = cardElement.getBoundingClientRect();
      // DON cards stack diagonally behind the card
      const offsetX = 20 + donIndex * 20;
      const offsetY = 20 + donIndex * 20;
      return { x: rect.left + offsetX + 50, y: rect.top + offsetY + 70 };
    }
    // Fallback position
    return { x: window.innerWidth / 2, y: isOpponent ? 300 : window.innerHeight - 300 };
  }, []);

  // Start dealing hand animation
  const startDealingHand = useCallback(() => {
    if (!myPlayer || !opponent) return;

    console.log('[GameBoard] Starting hand dealing animation');
    setDealingPhase('dealing-hand');
    setIsAnimationBlocked(true);
    setVisibleHandCount({ player: 0, opponent: 0 });
    setVisibleLifeCount({ player: 0, opponent: 0 });

    const newAnimatingCards: AnimatingCardData[] = [];
    const cardDelay = 300; // 0.3s per card

    // Player hand cards
    myPlayer.hand.forEach((card, index) => {
      const deckPos = getDeckPosition(false);
      const handPos = getHandCardPosition(index, myPlayer.hand.length, false);
      newAnimatingCards.push({
        id: `player-hand-${card.id}`,
        card,
        faceUp: true,
        startPos: deckPos,
        endPos: handPos,
        delay: index * cardDelay,
        targetZone: 'hand',
        isOpponent: false
      });
    });

    // Opponent hand cards
    opponent.hand.forEach((card, index) => {
      const deckPos = getDeckPosition(true);
      const handPos = getHandCardPosition(index, opponent.hand.length, true);
      newAnimatingCards.push({
        id: `opponent-hand-${card.id}`,
        card,
        faceUp: false,
        startPos: deckPos,
        endPos: handPos,
        delay: index * cardDelay,
        targetZone: 'hand',
        isOpponent: true
      });
    });

    setAnimatingCards(newAnimatingCards);
  }, [myPlayer, opponent, getDeckPosition, getHandCardPosition]);

  // Start dealing life animation
  const startDealingLife = useCallback(() => {
    if (!myPlayer || !opponent) return;

    console.log('[GameBoard] Starting life dealing animation');
    setDealingPhase('dealing-life');
    setIsAnimationBlocked(true);

    // Reset visible life count to 0 before animation starts (will increment as cards land)
    setVisibleLifeCount({ player: 0, opponent: 0 });

    const newAnimatingCards: AnimatingCardData[] = [];
    const cardDelay = 300;

    // Player life cards - rotate 90 degrees when landing
    myPlayer.lifeCards.forEach((card, index) => {
      const deckPos = getDeckPosition(false);
      const lifePos = getLifeCardPosition(index, false);
      newAnimatingCards.push({
        id: `player-life-${card.id}`,
        card,
        faceUp: false,
        startPos: deckPos,
        endPos: lifePos,
        delay: index * cardDelay,
        targetZone: 'life',
        isOpponent: false,
        endRotation: 90  // Rotate to horizontal when landing
      });
    });

    // Opponent life cards - rotate 90 degrees when landing
    opponent.lifeCards.forEach((card, index) => {
      const deckPos = getDeckPosition(true);
      const lifePos = getLifeCardPosition(index, true);
      newAnimatingCards.push({
        id: `opponent-life-${card.id}`,
        card,
        faceUp: false,
        startPos: deckPos,
        endPos: lifePos,
        delay: index * cardDelay,
        targetZone: 'life',
        isOpponent: true,
        endRotation: 90  // Rotate to horizontal when landing
      });
    });

    setAnimatingCards(newAnimatingCards);
  }, [myPlayer, opponent, getDeckPosition, getLifeCardPosition]);

  // Handle animation card completion
  const handleAnimationComplete = useCallback((cardId: string, targetZone: 'hand' | 'life' | 'don' | 'trash', isOpponent: boolean) => {
    // Remove the completed card from animating cards
    if (targetZone === 'don') {
      setAnimatingDon(prev => prev.filter(c => c.id !== cardId));
      setVisibleDonCount(prev => ({
        ...prev,
        [isOpponent ? 'opponent' : 'player']: prev[isOpponent ? 'opponent' : 'player'] + 1
      }));
      // Play DON sound
      playSound('don');
    } else if (targetZone === 'trash') {
      // Mill animations are handled separately by handleMillAnimationComplete
      // This branch is for completeness in case targetZone is 'trash'
      setAnimatingCards(prev => prev.filter(c => c.id !== cardId));
      playSound('damage');
    } else {
      setAnimatingCards(prev => prev.filter(c => c.id !== cardId));
      // Increment visible count
      if (targetZone === 'hand') {
        setVisibleHandCount(prev => ({
          ...prev,
          [isOpponent ? 'opponent' : 'player']: prev[isOpponent ? 'opponent' : 'player'] + 1
        }));
        // Play draw sound
        playSound('draw');
      } else {
        setVisibleLifeCount(prev => ({
          ...prev,
          [isOpponent ? 'opponent' : 'player']: prev[isOpponent ? 'opponent' : 'player'] + 1
        }));
      }
    }
  }, [playSound]);

  // Check if all animations are complete
  useEffect(() => {
    if (animatingCards.length > 0) return;

    if (dealingPhase === 'dealing-hand') {
      // Hand dealing complete, show mulligan
      console.log('[GameBoard] Hand dealing complete, waiting for mulligan');
      setDealingPhase('waiting-mulligan');
      setIsAnimationBlocked(false);
      // Initialize hand count ref after initial dealing
      if (myPlayer && opponent) {
        previousHandCountRef.current = { player: myPlayer.hand.length, opponent: opponent.hand.length };
        previousTrashCountRef.current = { player: myPlayer.trash.length, opponent: opponent.trash.length };
        previousDeckCountRef.current = { player: myPlayer.deck.length, opponent: opponent.deck.length };
      }
    } else if (dealingPhase === 'dealing-life') {
      // Life dealing complete, game can proceed
      console.log('[GameBoard] Life dealing complete');
      setDealingPhase('complete');
      setIsAnimationBlocked(false);
      // Initialize count refs to prevent false animation triggers
      if (myPlayer && opponent) {
        previousHandCountRef.current = { player: myPlayer.hand.length, opponent: opponent.hand.length };
        // Initialize life count refs to actual values to prevent false damage detection
        previousLifeCountRef.current = { player: myPlayer.lifeCards.length, opponent: opponent.lifeCards.length };
        // Initialize trash and deck count refs to prevent false mill animation triggers
        previousTrashCountRef.current = { player: myPlayer.trash.length, opponent: opponent.trash.length };
        previousDeckCountRef.current = { player: myPlayer.deck.length, opponent: opponent.deck.length };
        // DON counts: set to 0 so the animation useEffect will detect the initial DON and animate it
        // visibleDonCount stays at 0 so cards are hidden until animation completes
        previousDonCountRef.current = { player: 0, opponent: 0 };
        setVisibleDonCount({ player: 0, opponent: 0 });

        // Debug: Log life and deck counts to help diagnose 4-life leader issues
        console.log('[GameBoard] DEBUG - After life dealing:');
        console.log('  Player: maxLife=' + myPlayer.maxLife + ', lifeCards=' + myPlayer.lifeCards.length + ', deck=' + myPlayer.deck.length + ', hand=' + myPlayer.hand.length);
        console.log('  Opponent: maxLife=' + opponent.maxLife + ', lifeCards=' + opponent.lifeCards.length + ', deck=' + opponent.deck.length + ', hand=' + opponent.hand.length);
        console.log('  visibleLifeCount (current):', visibleLifeCount);
      }
      // Log the current game state for debugging
      console.log('[GameBoard] Current phase after life dealing:', phase, 'Player DON:', myPlayer?.donField?.length, 'Opponent DON:', opponent?.donField?.length);
    }
  }, [animatingCards.length, dealingPhase, myPlayer, opponent]);

  // Trigger hand dealing when entering mulligan phase
  useEffect(() => {
    if (phase === GamePhase.START_MULLIGAN &&
        previousPhaseRef.current !== GamePhase.START_MULLIGAN &&
        !animationTriggeredRef.current &&
        myPlayer && opponent) {

      // Check if cards are already dealt (component remounted mid-game)
      if (myPlayer.hand.length > 0) {
        console.log('[GameBoard] Cards already dealt, skipping to waiting-mulligan');
        animationTriggeredRef.current = true;
        setDealingPhase('waiting-mulligan');
        setVisibleHandCount({ player: myPlayer.hand.length, opponent: opponent.hand.length });
        setVisibleLifeCount({ player: 0, opponent: 0 }); // Life not dealt yet during mulligan
        // Initialize hand count ref to prevent false draw animations
        previousHandCountRef.current = { player: myPlayer.hand.length, opponent: opponent.hand.length };
        previousTrashCountRef.current = { player: myPlayer.trash.length, opponent: opponent.trash.length };
        previousDeckCountRef.current = { player: myPlayer.deck.length, opponent: opponent.deck.length };
      } else {
        // Small delay to let DOM render first
        animationTriggeredRef.current = true;
        setTimeout(() => {
          startDealingHand();
        }, 100);
      }
    }
    previousPhaseRef.current = phase;
  }, [phase, myPlayer, opponent, startDealingHand]);

  // If we're past mulligan phase and dealing phase is not complete, skip to complete
  // This handles cases where the game was resumed mid-progress or component remounted
  // NOTE: Only triggers from 'idle' state - 'waiting-mulligan' goes through normal life dealing flow
  useEffect(() => {
    // Exclude pre-game phases (RPS, first choice, pre-game setup) and mulligan/waiting phases
    const isPreGamePhase = phase === GamePhase.RPS_PHASE || phase === GamePhase.FIRST_CHOICE || phase === GamePhase.PRE_GAME_SETUP;
    if (phase && !isPreGamePhase && phase !== GamePhase.START_MULLIGAN && phase !== GamePhase.START_WAITING) {
      // Only skip from 'idle' state - if we're in 'waiting-mulligan', let normal life dealing flow handle it
      if (dealingPhase === 'idle') {
        console.log('[GameBoard] Skipping dealing animations - game already in progress, phase:', phase);
        setDealingPhase('complete');
        animationTriggeredRef.current = true; // Prevent animation from re-triggering
        // Initialize count refs with current values
        if (myPlayer && opponent) {
          const playerDonCount = myPlayer.donField.filter(d => !d.attachedTo).length;
          const opponentDonCount = opponent.donField.filter(d => !d.attachedTo).length;
          previousDonCountRef.current = { player: playerDonCount, opponent: opponentDonCount };
          // Also set visible DON count to prevent flash before animation
          setVisibleDonCount({ player: playerDonCount, opponent: opponentDonCount });
          // Initialize hand count refs to prevent false draw animations
          previousHandCountRef.current = { player: myPlayer.hand.length, opponent: opponent.hand.length };
          // Initialize trash and deck count refs to prevent false mill animations
          previousTrashCountRef.current = { player: myPlayer.trash.length, opponent: opponent.trash.length };
          previousDeckCountRef.current = { player: myPlayer.deck.length, opponent: opponent.deck.length };
        }
      }
    }
  }, [phase, dealingPhase, myPlayer, opponent]);

  // Detect and animate DON draws
  useEffect(() => {
    if (!myPlayer || !opponent) return;

    const playerDonCount = myPlayer.donField.filter(d => !d.attachedTo).length;
    const opponentDonCount = opponent.donField.filter(d => !d.attachedTo).length;

    console.log('[GameBoard] DON check - dealingPhase:', dealingPhase, 'playerDon:', playerDonCount, 'opponentDon:', opponentDonCount, 'prevPlayer:', previousDonCountRef.current.player, 'prevOpponent:', previousDonCountRef.current.opponent);

    if (dealingPhase !== 'complete') return;

    const prevPlayerCount = previousDonCountRef.current.player;
    const prevOpponentCount = previousDonCountRef.current.opponent;

    // Check if new DON was drawn
    const playerNewDon = playerDonCount - prevPlayerCount;
    const opponentNewDon = opponentDonCount - prevOpponentCount;

    if (playerNewDon > 0 || opponentNewDon > 0) {
      console.log('[GameBoard] Triggering DON animation - new player DON:', playerNewDon, 'new opponent DON:', opponentNewDon);
      const newAnimations: AnimatingCardData[] = [];
      const cardDelay = 200;

      // Player DON animations
      if (playerNewDon > 0) {
        const unattachedDon = myPlayer.donField.filter(d => !d.attachedTo);
        const totalDon = unattachedDon.length;
        for (let i = 0; i < playerNewDon; i++) {
          const donIndex = prevPlayerCount + i;
          const don = unattachedDon[donIndex];
          if (don) {
            newAnimations.push({
              id: `player-don-${don.id}-${Date.now()}`,
              card: don,
              faceUp: false,  // Start face-down
              startPos: getDonDeckPosition(false),
              endPos: getCostAreaPosition(donIndex, false, totalDon),
              delay: i * cardDelay,
              targetZone: 'don',
              isOpponent: false,
              flipDuringFlight: true
            });
          }
        }
        // Set visible count to previous (hide the new ones during animation)
        setVisibleDonCount(prev => ({ ...prev, player: prevPlayerCount }));
      }

      // Opponent DON animations
      if (opponentNewDon > 0) {
        const unattachedDon = opponent.donField.filter(d => !d.attachedTo);
        const totalDon = unattachedDon.length;
        for (let i = 0; i < opponentNewDon; i++) {
          const donIndex = prevOpponentCount + i;
          const don = unattachedDon[donIndex];
          if (don) {
            newAnimations.push({
              id: `opponent-don-${don.id}-${Date.now()}`,
              card: don,
              faceUp: false,  // Start face-down
              startPos: getDonDeckPosition(true),
              endPos: getCostAreaPosition(donIndex, true, totalDon),
              delay: i * cardDelay,
              targetZone: 'don',
              isOpponent: true,
              flipDuringFlight: true
            });
          }
        }
        // Set visible count to previous (hide the new ones during animation)
        setVisibleDonCount(prev => ({ ...prev, opponent: prevOpponentCount }));
      }

      if (newAnimations.length > 0) {
        console.log('[GameBoard] Spawning DON animations:', newAnimations.map(a => ({ id: a.id, startPos: a.startPos, endPos: a.endPos })));
        setAnimatingDon(prev => [...prev, ...newAnimations]);
      }
    }

    // Update refs
    previousDonCountRef.current = { player: playerDonCount, opponent: opponentDonCount };
  }, [myPlayer, opponent, dealingPhase, getDonDeckPosition, getCostAreaPosition]);

  // Detect Refresh Phase and animate DON returning to cost area
  useEffect(() => {
    if (!myPlayer || !opponent || !gameState) return;
    if (dealingPhase !== 'complete') return;

    // Only trigger on REFRESH_PHASE when it's my turn
    if (gameState.phase === GamePhase.REFRESH_PHASE && isMyTurn && gameState.turn > 1) {
      // Prevent duplicate triggers for the same turn
      if (refreshPhaseTriggeredRef.current === gameState.turn) return;
      refreshPhaseTriggeredRef.current = gameState.turn;

      // Find all attached DON cards that need to return
      const attachedDon = myPlayer.donField.filter(d => d.attachedTo);

      if (attachedDon.length > 0) {
        console.log('[GameBoard] Refresh Phase - returning', attachedDon.length, 'attached DON to cost area');

        // Show the Refresh Phase banner
        setShowRefreshBanner(true);
        setTimeout(() => setShowRefreshBanner(false), 1500);

        // Create animations for all attached DON flying back simultaneously
        const totalDonAfterRefresh = myPlayer.donField.length;
        const newAnimations: AnimatingCardData[] = attachedDon.map((don, i) => {
          const attachedToId = don.attachedTo!;
          // Calculate which index this DON will be at in the cost area
          const costAreaIndex = myPlayer.donField.filter(d => !d.attachedTo).length + i;

          return {
            id: `refresh-don-${don.id}-${Date.now()}`,
            card: don,
            faceUp: true,  // DON cards are face-up when attached
            startPos: getAttachedDonPosition(attachedToId, i, false),
            endPos: getCostAreaPosition(costAreaIndex, false, totalDonAfterRefresh),
            delay: 0,  // All fly back simultaneously
            targetZone: 'don' as const,
            isOpponent: false,
            flipDuringFlight: false
          };
        });

        setAnimatingDonRefresh(newAnimations);
        playSound('don');

        // Clear animation after it completes
        setTimeout(() => {
          setAnimatingDonRefresh([]);
        }, 400);
      }
    }
  }, [gameState?.phase, gameState?.turn, isMyTurn, myPlayer, opponent, dealingPhase, getAttachedDonPosition, getCostAreaPosition, playSound]);

  // Detect and animate life damage
  useEffect(() => {
    if (!myPlayer || !opponent) return;
    if (dealingPhase !== 'complete') return;

    const playerLifeCount = myPlayer.lifeCards.length;
    const opponentLifeCount = opponent.lifeCards.length;

    const prevPlayerLife = previousLifeCountRef.current.player;
    const prevOpponentLife = previousLifeCountRef.current.opponent;

    // First load: initialize refs to actual values and skip damage detection
    // This prevents false damage animation when leader has non-5 life
    if (prevPlayerLife === -1 || prevOpponentLife === -1) {
      previousLifeCountRef.current = { player: playerLifeCount, opponent: opponentLifeCount };
      setVisibleLifeCount({ player: playerLifeCount, opponent: opponentLifeCount });
      return;
    }

    // Check if player took damage (life decreased)
    const playerDamage = prevPlayerLife - playerLifeCount;
    const opponentDamage = prevOpponentLife - opponentLifeCount;

    if (playerDamage > 0 || opponentDamage > 0) {
      console.log('[GameBoard] Life damage detected - player:', playerDamage, 'opponent:', opponentDamage);
      const newAnimations: AnimatingCardData[] = [];

      // Player took damage - cards go from life pile to hand
      if (playerDamage > 0) {
        // Show damage indicator
        setLifeDamageIndicator({
          amount: playerDamage,
          isOpponent: false,
          key: Date.now()
        });

        // Get the cards that moved to hand (last N cards added)
        const newHandCards = myPlayer.hand.slice(-playerDamage);
        const startPos = getLifePilePosition(false);

        newHandCards.forEach((card, i) => {
          const endIndex = myPlayer.hand.length - playerDamage + i;
          const endPos = getHandZonePosition(endIndex, myPlayer.hand.length, false);
          newAnimations.push({
            id: `player-life-damage-${card.id}-${Date.now()}`,
            card,
            faceUp: false, // Stay face-down during flight
            startPos,
            endPos: { x: endPos.x + (i * 15), y: endPos.y }, // Slight offset for multiple cards
            delay: i * 50, // Small delay between cards
            targetZone: 'hand',
            isOpponent: false
          });
        });

        // Hide the cards in hand during animation
        setVisibleHandCount(prev => ({
          ...prev,
          player: myPlayer.hand.length - playerDamage
        }));

        // Update hand count ref to prevent false deck draw animation
        previousHandCountRef.current.player = myPlayer.hand.length;

        // Clear indicator after animation
        setTimeout(() => {
          setLifeDamageIndicator(null);
        }, 1500);
      }

      // Opponent took damage - cards go from life pile to their hand
      if (opponentDamage > 0) {
        // Show damage indicator for opponent
        setLifeDamageIndicator({
          amount: opponentDamage,
          isOpponent: true,
          key: Date.now()
        });

        // Get the cards that moved to hand (last N cards added)
        const newHandCards = opponent.hand.slice(-opponentDamage);
        const startPos = getLifePilePosition(true);

        newHandCards.forEach((card, i) => {
          const endIndex = opponent.hand.length - opponentDamage + i;
          const endPos = getHandZonePosition(endIndex, opponent.hand.length, true);
          newAnimations.push({
            id: `opponent-life-damage-${card.id}-${Date.now()}`,
            card,
            faceUp: false, // Face-down for opponent's cards
            startPos,
            endPos: { x: endPos.x + (i * 15), y: endPos.y },
            delay: i * 50,
            targetZone: 'hand',
            isOpponent: true
          });
        });

        // Hide the cards in opponent's hand during animation
        setVisibleHandCount(prev => ({
          ...prev,
          opponent: opponent.hand.length - opponentDamage
        }));

        // Update hand count ref to prevent false deck draw animation
        previousHandCountRef.current.opponent = opponent.hand.length;

        // Clear indicator after animation
        setTimeout(() => {
          setLifeDamageIndicator(null);
        }, 1500);
      }

      if (newAnimations.length > 0) {
        console.log('[GameBoard] Spawning life damage animations:', newAnimations.length);
        setAnimatingLifeDamage(prev => [...prev, ...newAnimations]);
      }
    }

    // Update refs
    previousLifeCountRef.current = { player: playerLifeCount, opponent: opponentLifeCount };
  }, [myPlayer, opponent, dealingPhase, getLifePilePosition, getHandZonePosition]);

  // Handle life damage animation completion
  const handleLifeDamageAnimationComplete = useCallback((cardId: string, isOpponent: boolean) => {
    setAnimatingLifeDamage(prev => prev.filter(c => c.id !== cardId));
    setVisibleHandCount(prev => ({
      ...prev,
      [isOpponent ? 'opponent' : 'player']: prev[isOpponent ? 'opponent' : 'player'] + 1
    }));
    // Play damage sound
    playSound('damage');
  }, [playSound]);

  // Detect and animate hand draws (during draw phase, card effects, mulligan)
  useEffect(() => {
    if (!myPlayer || !opponent) return;
    if (dealingPhase !== 'complete') return;

    const playerHandCount = myPlayer.hand.length;
    const opponentHandCount = opponent.hand.length;

    const prevPlayerCount = previousHandCountRef.current.player;
    const prevOpponentCount = previousHandCountRef.current.opponent;

    // Check if cards were drawn (hand size increased)
    const playerDrawn = playerHandCount - prevPlayerCount;
    const opponentDrawn = opponentHandCount - prevOpponentCount;

    if (playerDrawn > 0 || opponentDrawn > 0) {
      console.log('[GameBoard] Hand draw detected - player:', playerDrawn, 'opponent:', opponentDrawn);
      const newAnimations: AnimatingCardData[] = [];
      const cardDelay = 200;

      // Player hand draw animations
      if (playerDrawn > 0) {
        for (let i = 0; i < playerDrawn; i++) {
          const cardIndex = prevPlayerCount + i;
          const card = myPlayer.hand[cardIndex];
          if (card) {
            newAnimations.push({
              id: `player-draw-${card.id}-${Date.now()}`,
              card,
              faceUp: false,  // Start face-down
              startPos: getDeckPosition(false),
              endPos: getHandCardPosition(cardIndex, playerHandCount, false),
              delay: i * cardDelay,
              targetZone: 'hand',
              isOpponent: false,
              flipDuringFlight: true  // Flip to face-up during flight
            });
          }
        }
        // Hide the new cards in hand during animation
        setVisibleHandCount(prev => ({ ...prev, player: prevPlayerCount }));
      }

      // Opponent hand draw animations
      if (opponentDrawn > 0) {
        for (let i = 0; i < opponentDrawn; i++) {
          const cardIndex = prevOpponentCount + i;
          const card = opponent.hand[cardIndex];
          if (card) {
            newAnimations.push({
              id: `opponent-draw-${card.id}-${Date.now()}`,
              card,
              faceUp: false,  // Start face-down, stay face-down
              startPos: getDeckPosition(true),
              endPos: getHandCardPosition(cardIndex, opponentHandCount, true),
              delay: i * cardDelay,
              targetZone: 'hand',
              isOpponent: true,
              flipDuringFlight: false  // Opponent cards stay face-down
            });
          }
        }
        // Hide the new cards in hand during animation
        setVisibleHandCount(prev => ({ ...prev, opponent: prevOpponentCount }));
      }

      if (newAnimations.length > 0) {
        console.log('[GameBoard] Spawning hand draw animations:', newAnimations.length);
        setAnimatingHandDraw(prev => [...prev, ...newAnimations]);
      }
    }

    // Update refs
    previousHandCountRef.current = { player: playerHandCount, opponent: opponentHandCount };
  }, [myPlayer, opponent, dealingPhase, getDeckPosition, getHandCardPosition]);

  // Handle hand draw animation completion
  const handleHandDrawAnimationComplete = useCallback((cardId: string, isOpponent: boolean) => {
    setAnimatingHandDraw(prev => prev.filter(c => c.id !== cardId));
    setVisibleHandCount(prev => ({
      ...prev,
      [isOpponent ? 'opponent' : 'player']: prev[isOpponent ? 'opponent' : 'player'] + 1
    }));
    // Play draw sound
    playSound('draw');
  }, [playSound]);

  // Detect and animate mill (deck to trash) effects
  useEffect(() => {
    if (!myPlayer || !opponent) return;
    if (dealingPhase !== 'complete') return;

    const playerTrashCount = myPlayer.trash.length;
    const opponentTrashCount = opponent.trash.length;
    const playerDeckCount = myPlayer.deck.length;
    const opponentDeckCount = opponent.deck.length;

    const prevPlayerTrashCount = previousTrashCountRef.current.player;
    const prevOpponentTrashCount = previousTrashCountRef.current.opponent;
    const prevPlayerDeckCount = previousDeckCountRef.current.player;
    const prevOpponentDeckCount = previousDeckCountRef.current.opponent;

    // Check if cards were milled (trash increased AND deck decreased = deck-to-trash transfer)
    const playerTrashIncrease = playerTrashCount - prevPlayerTrashCount;
    const opponentTrashIncrease = opponentTrashCount - prevOpponentTrashCount;
    const playerDeckDecrease = prevPlayerDeckCount - playerDeckCount;
    const opponentDeckDecrease = prevOpponentDeckCount - opponentDeckCount;

    // Only animate if trash increased AND deck decreased by the same amount (indicates mill from deck)
    // This prevents animations when discarding from hand or KO'ing characters
    const playerMilled = (playerTrashIncrease > 0 && playerDeckDecrease > 0) ? Math.min(playerTrashIncrease, playerDeckDecrease) : 0;
    const opponentMilled = (opponentTrashIncrease > 0 && opponentDeckDecrease > 0) ? Math.min(opponentTrashIncrease, opponentDeckDecrease) : 0;

    if (playerMilled > 0 || opponentMilled > 0) {
      console.log('[GameBoard] Mill from deck detected - player:', playerMilled, 'opponent:', opponentMilled);
      const newAnimations: AnimatingCardData[] = [];
      const cardDelay = 150;

      // Player mill animations
      if (playerMilled > 0) {
        for (let i = 0; i < playerMilled; i++) {
          const cardIndex = prevPlayerTrashCount + i;
          const card = myPlayer.trash[cardIndex];
          if (card) {
            newAnimations.push({
              id: `player-mill-${card.id}-${Date.now()}-${i}`,
              card,
              faceUp: false,  // Start face-down (from deck)
              startPos: getDeckPosition(false),
              endPos: getTrashPosition(false),
              delay: i * cardDelay,
              targetZone: 'trash',
              isOpponent: false,
              flipDuringFlight: true  // Flip to face-up during flight
            });
          }
        }
      }

      // Opponent mill animations
      if (opponentMilled > 0) {
        for (let i = 0; i < opponentMilled; i++) {
          const cardIndex = prevOpponentTrashCount + i;
          const card = opponent.trash[cardIndex];
          if (card) {
            newAnimations.push({
              id: `opponent-mill-${card.id}-${Date.now()}-${i}`,
              card,
              faceUp: false,  // Start face-down (from deck)
              startPos: getDeckPosition(true),
              endPos: getTrashPosition(true),
              delay: i * cardDelay,
              targetZone: 'trash',
              isOpponent: true,
              flipDuringFlight: true  // Flip to face-up during flight
            });
          }
        }
      }

      if (newAnimations.length > 0) {
        console.log('[GameBoard] Spawning mill animations:', newAnimations.length);
        setAnimatingMill(prev => [...prev, ...newAnimations]);
      }
    }

    // Update refs
    previousTrashCountRef.current = { player: playerTrashCount, opponent: opponentTrashCount };
    previousDeckCountRef.current = { player: playerDeckCount, opponent: opponentDeckCount };
  }, [myPlayer, opponent, dealingPhase, getDeckPosition, getTrashPosition]);

  // Handle mill animation completion
  const handleMillAnimationComplete = useCallback((cardId: string) => {
    setAnimatingMill(prev => prev.filter(c => c.id !== cardId));
    // Play a sound for milling (reuse damage sound or add a new one)
    playSound('damage');
  }, [playSound]);

  // Socket hook
  const {
    preGameSelect,
    skipPreGame,
    keepHand,
    mulligan,
    playCard,
    declareAttack,
    resolveAttackEffect,
    skipAttackEffect,
    resolvePlayEffect,
    skipPlayEffect,
    resolveActivateEffect,
    skipActivateEffect,
    resolveEventEffect,
    skipEventEffect,
    resolveCounterEffect,
    resolveDeckReveal,
    skipDeckReveal,
    resolveHandSelect,
    skipHandSelect,
    payAdditionalCost,
    skipAdditionalCost,
    endTurn,
    pass,
    useCounter,
    passCounter,
    activateTrigger,
    passTrigger,
    selectBlocker,
    passBlocker,
    attachDon,
    activateAbility
  } = useGameSocket({
    gameId,
    playerId,
    isAIGame,
    onStateUpdate: handleStateUpdate,
    onGameEnd: handleGameEnd,
    onError: handleError
  });

  // Track selected DON for attaching
  const [selectedDon, setSelectedDon] = useState<GameCardType | null>(null);

  // Track character card selected from hand pending placement on field
  const [pendingPlayCard, setPendingPlayCard] = useState<GameCardType | null>(null);

  // Track pinned card for combat phases and main phase (click to pin, stays until phase ends)
  const [pinnedCard, setPinnedCard] = useState<GameCardType | null>(null);

  // Track activation mode for abilities that require target selection
  const [activationMode, setActivationMode] = useState<{
    cardId: string;
    step: 'select-don' | 'select-target';
    selectedDonId?: string;
  } | null>(null);

  // Track attack mode for cards with abilities (requires explicit Attack button click)
  const [isAttackMode, setIsAttackMode] = useState(false);

  // Clear pinned card when phase changes away from combat/main, or when turn changes
  useEffect(() => {
    const isValidPinPhase = phase === GamePhase.BLOCKER_STEP ||
                            phase === GamePhase.COUNTER_STEP ||
                            phase === GamePhase.MAIN_PHASE;
    if (!isValidPinPhase) {
      setPinnedCard(null);
    }
  }, [phase]);

  // Also clear pinned card, activation mode, and pending play when turn changes (new turn = fresh state)
  useEffect(() => {
    setPinnedCard(null);
    setActivationMode(null);
    setIsAttackMode(false);
    setPendingPlayCard(null);
  }, [turn]);

  // Clear activation mode, attack mode, and pending play when phase changes away from main phase
  useEffect(() => {
    if (phase !== GamePhase.MAIN_PHASE) {
      setActivationMode(null);
      setIsAttackMode(false);
      setPendingPlayCard(null);
    }
  }, [phase]);

  // Escape key handler - cancel pending actions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingPlayCard) {
          setPendingPlayCard(null);
        }
        if (selectedDon) {
          setSelectedDon(null);
        }
        if (activationMode) {
          setActivationMode(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [pendingPlayCard, selectedDon, activationMode]);

  // RPS Socket event handlers
  useEffect(() => {
    const socket = getSocket();

    // Handle RPS result
    const handleRPSResult = (data: { gameId: string; rpsState: RPSState }) => {
      if (data.gameId !== gameId) return;
      console.log('[GameBoard] RPS result received:', data.rpsState);
      setRpsState(data.rpsState);
      setRpsPhase('result');

      // If there's a winner (not a tie), prepare for first choice phase
      if (data.rpsState.winnerId && !data.rpsState.isTie) {
        setRpsWinnerId(data.rpsState.winnerId);
      }
    };

    // Handle new RPS round (after tie)
    const handleRPSChoose = (data: { gameId: string; rpsState: RPSState; message?: string }) => {
      if (data.gameId !== gameId) return;
      console.log('[GameBoard] New RPS round:', data.rpsState);
      setRpsState(data.rpsState);
      setRpsPhase('choosing');
    };

    // Handle first choice phase
    const handleFirstChoice = (data: { gameId: string; winnerId: string; phase: GamePhase }) => {
      if (data.gameId !== gameId) return;
      console.log('[GameBoard] First choice phase, winner:', data.winnerId);
      setRpsWinnerId(data.winnerId);
      setRpsPhase('first-choice');
    };

    // Handle first decided (game starting)
    const handleFirstDecided = (data: { gameId: string; firstPlayerId: string; loserId?: string; loserGoesFirst?: boolean; isAIGame?: boolean }) => {
      if (data.gameId !== gameId) return;
      console.log('[GameBoard] First decided, first player:', data.firstPlayerId);

      // Show banner to the loser (if not AI game)
      if (data.loserId === playerId && !data.isAIGame) {
        setTurnOrderBanner({
          goesFirst: data.loserGoesFirst || false,
          visible: true,
        });

        // Hide banner after animation
        setTimeout(() => {
          setTurnOrderBanner(null);
        }, 4000);
      }

      // Clear RPS phase - game is starting
      setRpsPhase('none');
      setRpsState(null);
      setRpsWinnerId(null);
    };

    socket.on('rps:result', handleRPSResult);
    socket.on('rps:choose', handleRPSChoose);
    socket.on('first:choice', handleFirstChoice);
    socket.on('first:decided', handleFirstDecided);

    return () => {
      socket.off('rps:result', handleRPSResult);
      socket.off('rps:choose', handleRPSChoose);
      socket.off('first:choice', handleFirstChoice);
      socket.off('first:decided', handleFirstDecided);
    };
  }, [gameId, playerId]);

  // Handle RPS choice
  const handleRPSChoice = useCallback((choice: RPSChoice) => {
    const socket = getSocket();
    console.log('[GameBoard] Sending RPS choice:', choice);
    socket.emit('rps:choose', { gameId, choice });
  }, [gameId]);

  // Handle first/second choice
  const handleFirstChoiceSelection = useCallback((goFirst: boolean) => {
    const socket = getSocket();
    console.log('[GameBoard] Sending first choice:', goFirst);
    if (isAIGame) {
      socket.emit('ai:first-choice', { gameId, goFirst });
    } else {
      socket.emit('first:choice', { gameId, goFirst });
    }
  }, [gameId, isAIGame]);

  // Initialize RPS phase from lobby start
  useEffect(() => {
    const socket = getSocket();

    const handleLobbyStart = (data: { gameId: string; phase?: GamePhase; rpsState?: RPSState; isAIGame?: boolean; winnerId?: string }) => {
      if (data.gameId !== gameId) return;

      // Check if this is an RPS phase start
      if (data.phase === GamePhase.RPS_PHASE && data.rpsState) {
        console.log('[GameBoard] Starting RPS phase');
        setRpsState(data.rpsState);
        setRpsPhase('choosing');
      }
      // Check if this is a first choice phase (AI game)
      else if (data.phase === GamePhase.FIRST_CHOICE) {
        console.log('[GameBoard] Starting first choice phase (AI game)');
        setRpsWinnerId(data.winnerId || playerId);
        setRpsPhase('first-choice');
      }
    };

    socket.on('lobby:start', handleLobbyStart);

    return () => {
      socket.off('lobby:start', handleLobbyStart);
    };
  }, [gameId, playerId]);

  // Handle reconnection during first choice phase (e.g., page refresh)
  // Also close modal when phase changes from FIRST_CHOICE to something else (fallback)
  useEffect(() => {
    if (gameState?.phase === GamePhase.FIRST_CHOICE && rpsPhase === 'none') {
      console.log('[GameBoard] Detected FIRST_CHOICE phase on reconnection');
      // In AI games, the player is always the "winner" who chooses
      setRpsWinnerId(playerId);
      setRpsPhase('first-choice');
    }
    // Fallback: Close modal if phase changed from FIRST_CHOICE to something else
    // This handles cases where first:decided event wasn't received
    else if (gameState?.phase && gameState.phase !== GamePhase.FIRST_CHOICE && rpsPhase === 'first-choice') {
      console.log('[GameBoard] Phase changed from FIRST_CHOICE, closing modal (fallback)');
      setRpsPhase('none');
      setRpsState(null);
      setRpsWinnerId(null);
    }
  }, [gameState?.phase, rpsPhase, playerId]);

  // Attack animation state
  const [attackAnimation, setAttackAnimation] = useState<{
    attackerId: string;
    targetId: string;
    phase: 'jumping' | 'returning' | 'done';
  } | null>(null);

  // Trash preview modal state: 'player' | 'opponent' | null
  const [trashModalOpen, setTrashModalOpen] = useState<'player' | 'opponent' | null>(null);
  // Trash modal - pinned card ID for preview (uses main hoveredCard for display)
  const [trashPinnedCardId, setTrashPinnedCardId] = useState<string | null>(null);

  // Attack effect step state - selected targets for the current effect
  const [attackEffectSelectedTargets, setAttackEffectSelectedTargets] = useState<string[]>([]);

  // Get current pending attack effect (first one in list)
  const currentAttackEffect = useMemo(() => {
    if (phase !== GamePhase.ATTACK_EFFECT_STEP || !gameState?.pendingAttackEffects) return null;
    return gameState.pendingAttackEffects[0] || null;
  }, [phase, gameState?.pendingAttackEffects]);

  // Get the source card for the current attack effect
  const attackEffectSourceCard = useMemo(() => {
    if (!currentAttackEffect || !gameState) return null;
    for (const player of Object.values(gameState.players)) {
      if (player.leaderCard?.id === currentAttackEffect.sourceCardId) {
        return player.leaderCard;
      }
      const fieldCard = player.field.find(c => c.id === currentAttackEffect.sourceCardId);
      if (fieldCard) return fieldCard;
    }
    return null;
  }, [currentAttackEffect, gameState]);

  // Get valid targets for the current attack effect
  const attackEffectValidTargets = useMemo(() => {
    const targets = new Set<string>();
    if (!currentAttackEffect || !gameState) return targets;

    // If validTargets is specified, use those; otherwise, default to player's own cards
    if (currentAttackEffect.validTargets && currentAttackEffect.validTargets.length > 0) {
      currentAttackEffect.validTargets.forEach(id => targets.add(id));
    } else {
      // Default: own leader and field characters
      const activePlayer = gameState.players[currentAttackEffect.playerId];
      if (activePlayer?.leaderCard) {
        targets.add(activePlayer.leaderCard.id);
      }
      activePlayer?.field.forEach(card => targets.add(card.id));
    }
    return targets;
  }, [currentAttackEffect, gameState]);

  // Clear attack effect selection when phase changes
  useEffect(() => {
    if (phase !== GamePhase.ATTACK_EFFECT_STEP) {
      setAttackEffectSelectedTargets([]);
    }
  }, [phase]);

  // Play effect step state - selected targets for the current ON_PLAY effect
  const [playEffectSelectedTargets, setPlayEffectSelectedTargets] = useState<string[]>([]);

  // Get current pending play effect (first one in list)
  const currentPlayEffect = useMemo(() => {
    if (phase !== GamePhase.PLAY_EFFECT_STEP || !gameState?.pendingPlayEffects) return null;
    return gameState.pendingPlayEffects[0] || null;
  }, [phase, gameState?.pendingPlayEffects]);

  // Get the source card for the current play effect
  const playEffectSourceCard = useMemo(() => {
    if (!currentPlayEffect || !gameState) return null;
    for (const player of Object.values(gameState.players)) {
      const fieldCard = player.field.find(c => c.id === currentPlayEffect.sourceCardId);
      if (fieldCard) return fieldCard;
    }
    return null;
  }, [currentPlayEffect, gameState]);

  // Get valid targets for the current play effect
  const playEffectValidTargets = useMemo(() => {
    const targets = new Set<string>();
    if (!currentPlayEffect || !gameState) return targets;

    // Use validTargets from the effect
    if (currentPlayEffect.validTargets && currentPlayEffect.validTargets.length > 0) {
      currentPlayEffect.validTargets.forEach(id => targets.add(id));
    } else {
      // Default: own rested DON cards (for "give DON to leader/character" effects)
      const activePlayer = gameState.players[currentPlayEffect.playerId];
      activePlayer?.donField.forEach(don => {
        if (don.state === CardState.RESTED && !don.attachedTo) {
          targets.add(don.id);
        }
      });
    }
    return targets;
  }, [currentPlayEffect, gameState]);

  // Play effect info for CardPreview (used for ATTACH_DON effects)
  const playEffectInfo = useMemo(() => {
    if (!currentPlayEffect || currentPlayEffect.playerId !== playerId) return null;
    if (currentPlayEffect.effectType !== 'ATTACH_DON') return null;

    return {
      description: currentPlayEffect.description,
      instruction: 'Tap Leader (2 DON) or Character (1 DON)'
    };
  }, [currentPlayEffect, playerId]);

  // Clear play effect selection when phase changes
  useEffect(() => {
    if (phase !== GamePhase.PLAY_EFFECT_STEP) {
      setPlayEffectSelectedTargets([]);
    }
  }, [phase]);

  // Show info banner when entering PLAY_EFFECT_STEP (not for ATTACH_DON, which uses CardPreview)
  useEffect(() => {
    if (phase === GamePhase.PLAY_EFFECT_STEP && currentPlayEffect && currentPlayEffect.effectType !== 'ATTACH_DON') {
      showInfoBanner(`On Play: ${currentPlayEffect.description}`);
    }
  }, [phase, currentPlayEffect, showInfoBanner]);

  // =====================================================
  // EVENT EFFECT STEP - Event card [Main] effect resolution
  // =====================================================
  const [eventEffectSelectedTargets, setEventEffectSelectedTargets] = useState<string[]>([]);

  // Get current pending event effect
  const currentEventEffect = useMemo(() => {
    if (phase !== GamePhase.EVENT_EFFECT_STEP || !gameState?.pendingEventEffects) return null;
    return gameState.pendingEventEffects[0] || null;
  }, [phase, gameState?.pendingEventEffects]);

  // Get valid targets for event effect
  const eventEffectValidTargets = useMemo(() => {
    const targets = new Set<string>();
    if (!currentEventEffect) return targets;
    currentEventEffect.validTargets?.forEach(id => targets.add(id));
    return targets;
  }, [currentEventEffect]);

  // Clear event effect selection when phase changes
  useEffect(() => {
    if (phase !== GamePhase.EVENT_EFFECT_STEP) {
      setEventEffectSelectedTargets([]);
    }
  }, [phase]);

  // Show info banner when entering EVENT_EFFECT_STEP and handle fizzle cases
  useEffect(() => {
    if (phase === GamePhase.EVENT_EFFECT_STEP && currentEventEffect && currentEventEffect.playerId === playerId) {
      // Check if effect will fizzle
      if (!currentEventEffect.conditionsMet) {
        showInfoBanner('Leader condition not met - effect fizzles');
        // Auto-skip after a delay so player can see the message
        const timer = setTimeout(() => {
          skipEventEffect(currentEventEffect.id);
        }, 2000);
        return () => clearTimeout(timer);
      } else if (currentEventEffect.validTargets.length === 0 && currentEventEffect.minTargets > 0) {
        showInfoBanner('No valid targets - effect fizzles');
        // Auto-skip after a delay so player can see the message
        const timer = setTimeout(() => {
          skipEventEffect(currentEventEffect.id);
        }, 2000);
        return () => clearTimeout(timer);
      } else {
        showInfoBanner(`Event: ${currentEventEffect.description}`);
      }
    }
  }, [phase, currentEventEffect, playerId, showInfoBanner, skipEventEffect]);

  // =====================================================
  // COUNTER EFFECT STEP - Event counter effect target selection
  // =====================================================
  const [counterEffectSelectedTargets, setCounterEffectSelectedTargets] = useState<string[]>([]);

  // Get current pending counter effect
  const currentCounterEffect = useMemo(() => {
    if (phase !== GamePhase.COUNTER_EFFECT_STEP || !gameState?.pendingCounterEffects) return null;
    return gameState.pendingCounterEffects[0] || null;
  }, [phase, gameState?.pendingCounterEffects]);

  // Get valid targets for counter effect
  const counterEffectValidTargets = useMemo(() => {
    const targets = new Set<string>();
    if (!currentCounterEffect) return targets;
    currentCounterEffect.validTargets?.forEach(id => targets.add(id));
    return targets;
  }, [currentCounterEffect]);

  // Clear counter effect selection when phase changes
  useEffect(() => {
    if (phase !== GamePhase.COUNTER_EFFECT_STEP) {
      setCounterEffectSelectedTargets([]);
    }
  }, [phase]);

  // Show info banner when entering COUNTER_EFFECT_STEP
  useEffect(() => {
    if (phase === GamePhase.COUNTER_EFFECT_STEP && currentCounterEffect) {
      showInfoBanner(`Counter: ${currentCounterEffect.description}`);
    }
  }, [phase, currentCounterEffect, showInfoBanner]);

  // =====================================================
  // ADDITIONAL COST STEP - Optional cost prompt
  // =====================================================
  const currentAdditionalCost = useMemo(() => {
    if (phase !== GamePhase.ADDITIONAL_COST_STEP || !gameState?.pendingAdditionalCost) return null;
    return gameState.pendingAdditionalCost;
  }, [phase, gameState?.pendingAdditionalCost]);

  // Show info banner when entering ADDITIONAL_COST_STEP
  useEffect(() => {
    if (phase === GamePhase.ADDITIONAL_COST_STEP && currentAdditionalCost) {
      showInfoBanner(`Optional Cost: ${currentAdditionalCost.description}`);
    }
  }, [phase, currentAdditionalCost, showInfoBanner]);

  // =====================================================
  // DECK REVEAL STEP - Look at X cards, select matching
  // =====================================================
  const currentDeckRevealEffect = useMemo((): PendingDeckRevealEffect | null => {
    if (phase !== GamePhase.DECK_REVEAL_STEP || !gameState?.pendingDeckRevealEffect) return null;
    return gameState.pendingDeckRevealEffect;
  }, [phase, gameState?.pendingDeckRevealEffect]);

  // Get the revealed cards from the player's deck
  const revealedCards = useMemo(() => {
    if (!currentDeckRevealEffect || !gameState) return [];
    const player = gameState.players[currentDeckRevealEffect.playerId];
    if (!player) return [];
    return currentDeckRevealEffect.revealedCardIds
      .map(id => player.deck.find((c: GameCardType) => c.id === id))
      .filter((c): c is GameCardType => c !== undefined);
  }, [currentDeckRevealEffect, gameState]);

  // Show info banner when entering DECK_REVEAL_STEP
  useEffect(() => {
    if (phase === GamePhase.DECK_REVEAL_STEP && currentDeckRevealEffect && currentDeckRevealEffect.playerId === playerId) {
      const matchCount = currentDeckRevealEffect.selectableCardIds.length;
      if (matchCount === 0) {
        showInfoBanner('No matching cards found');
      } else {
        showInfoBanner(`Found ${matchCount} matching card${matchCount > 1 ? 's' : ''}`);
      }
    }
  }, [phase, currentDeckRevealEffect, playerId, showInfoBanner]);

  // Deck reveal handlers
  const handleDeckRevealSelect = useCallback((selectedCardIds: string[]) => {
    resolveDeckReveal(selectedCardIds);
    playSound('draw');
  }, [resolveDeckReveal, playSound]);

  const handleDeckRevealSkip = useCallback(() => {
    skipDeckReveal();
  }, [skipDeckReveal]);

  // Hand select state - for effects that require selecting cards from hand (discard, return, etc.)
  const [handSelectSelectedCards, setHandSelectSelectedCards] = useState<Set<string>>(new Set());

  // Get current pending hand select effect
  const currentHandSelectEffect = useMemo((): PendingHandSelectEffect | null => {
    if (phase !== GamePhase.HAND_SELECT_STEP || !gameState?.pendingHandSelectEffect) return null;
    return gameState.pendingHandSelectEffect;
  }, [phase, gameState?.pendingHandSelectEffect]);

  // Reset selection when entering HAND_SELECT_STEP
  useEffect(() => {
    if (phase === GamePhase.HAND_SELECT_STEP && currentHandSelectEffect && currentHandSelectEffect.playerId === playerId) {
      setHandSelectSelectedCards(new Set()); // Reset selection
    }
  }, [phase, currentHandSelectEffect, playerId]);

  // Hand select handlers
  const handleHandSelectCardClick = useCallback((card: GameCardType) => {
    if (!currentHandSelectEffect || currentHandSelectEffect.playerId !== playerId) return;

    setHandSelectSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(card.id)) {
        next.delete(card.id);
      } else if (next.size < currentHandSelectEffect.maxSelections) {
        next.add(card.id);
      }
      return next;
    });
  }, [currentHandSelectEffect, playerId]);

  const handleHandSelectConfirm = useCallback(() => {
    if (!currentHandSelectEffect) return;
    resolveHandSelect(Array.from(handSelectSelectedCards));
    setHandSelectSelectedCards(new Set());
    playSound('play');
  }, [currentHandSelectEffect, handSelectSelectedCards, resolveHandSelect, playSound]);

  const handleHandSelectSkip = useCallback(() => {
    if (!currentHandSelectEffect || !currentHandSelectEffect.canSkip) return;
    skipHandSelect();
    setHandSelectSelectedCards(new Set());
  }, [currentHandSelectEffect, skipHandSelect]);

  // Check if we can confirm hand select (have selected enough cards)
  const canConfirmHandSelect = useMemo(() => {
    if (!currentHandSelectEffect) return false;
    return handSelectSelectedCards.size >= currentHandSelectEffect.minSelections;
  }, [currentHandSelectEffect, handSelectSelectedCards]);

  // Debug logging for play effect modal display
  useEffect(() => {
    if (currentPlayEffect) {
      console.log('[GameBoard] Play effect modal check:', {
        effectPlayerId: currentPlayEffect.playerId,
        localPlayerId: playerId,
        shouldShowModal: currentPlayEffect.playerId === playerId,
        effectType: currentPlayEffect.effectType,
        validTargets: currentPlayEffect.validTargets?.length || 0
      });
    }
  }, [currentPlayEffect, playerId]);

  // Activate effect state - for ACTIVATE_MAIN abilities that require hand selection (e.g., Empty Throne)
  const [activateEffectSelectedTargets, setActivateEffectSelectedTargets] = useState<string[]>([]);

  // Get current pending activate effect (first one in list)
  const currentActivateEffect = useMemo((): PendingActivateEffect | null => {
    if (!gameState?.pendingActivateEffects || gameState.pendingActivateEffects.length === 0) return null;
    return gameState.pendingActivateEffects[0];
  }, [gameState?.pendingActivateEffects]);

  // Valid hand cards for the current activate effect
  const activateEffectValidTargets = useMemo(() => {
    const targets = new Set<string>();
    if (!currentActivateEffect) return targets;
    currentActivateEffect.validHandCardIds.forEach(id => targets.add(id));
    return targets;
  }, [currentActivateEffect]);

  // Clear selection when activate effect is resolved
  useEffect(() => {
    if (!currentActivateEffect) {
      setActivateEffectSelectedTargets([]);
    }
  }, [currentActivateEffect]);

  // Show info banner when there's a pending activate effect
  // Don't show if we're in HAND_SELECT_STEP (cost payment shows its own banner)
  useEffect(() => {
    if (currentActivateEffect && currentActivateEffect.playerId === playerId && phase !== GamePhase.HAND_SELECT_STEP) {
      showInfoBanner(`Activate: ${currentActivateEffect.description}`);
    }
  }, [currentActivateEffect, playerId, showInfoBanner, phase]);

  // Show combat modal during combat phases
  const showCombatModal = phase === GamePhase.BLOCKER_STEP || phase === GamePhase.COUNTER_STEP;

  // Check if attacker is unblockable (permanent or temporary keyword)
  const isAttackerUnblockable = useMemo(() => {
    if (!gameState?.currentCombat) return false;
    const attackerId = gameState.currentCombat.attackerId;
    // Find attacker card in game state
    for (const player of Object.values(gameState.players)) {
      // Check leader
      if (player.leaderCard?.id === attackerId) {
        const card = player.leaderCard;
        return card.keywords?.includes('Unblockable') || card.temporaryKeywords?.includes('Unblockable') || false;
      }
      // Check field
      const fieldCard = player.field.find(c => c.id === attackerId);
      if (fieldCard) {
        return fieldCard.keywords?.includes('Unblockable') || fieldCard.temporaryKeywords?.includes('Unblockable') || false;
      }
    }
    return false;
  }, [gameState?.currentCombat, gameState?.players]);

  // Calculate ACTIVE DON count
  const activeDonCount = useMemo(() => {
    if (!myPlayer) return 0;
    return myPlayer.donField.filter(don => don.state === 'ACTIVE').length;
  }, [myPlayer]);

  // Calculate playable cards (must have enough ACTIVE DON to pay cost)
  // Also includes activate effect valid targets when there's a pending activate effect
  const playableCards = useMemo(() => {
    const playable = new Set<string>();

    // When there's a pending activate effect that requires hand selection, highlight valid targets
    if (currentActivateEffect && currentActivateEffect.playerId === playerId) {
      currentActivateEffect.validHandCardIds.forEach(id => playable.add(id));
      // Also add selected targets to show they're selected
      activateEffectSelectedTargets.forEach(id => playable.add(id));
      return playable;
    }

    if (!myPlayer || !isMyTurn || phase !== GamePhase.MAIN_PHASE) return playable;

    myPlayer.hand.forEach(card => {
      const def = cardDefinitions.get(card.cardId);
      if (def?.cost != null && activeDonCount >= def.cost) {
        playable.add(card.id);
      }
    });

    return playable;
  }, [myPlayer, isMyTurn, phase, cardDefinitions, activeDonCount, currentActivateEffect, playerId, activateEffectSelectedTargets]);

  // Check if selected card can attack
  const selectedCardCanAttack = useMemo(() => {
    if (!selectedCard || !isMyTurn || phase !== GamePhase.MAIN_PHASE) return false;
    // First player cannot attack on turn 1 (One Piece TCG rule)
    if (turn === 1 && playerId === gameState?.firstPlayerId) return false;
    // Card must be active (not rested) and hasn't attacked yet
    if (selectedCard.state === CardState.RESTED || selectedCard.hasAttacked) return false;
    // Characters played this turn need Rush to attack (summoning sickness)
    // Leaders (zone === LEADER) are exempt from this rule
    if (selectedCard.zone === CardZone.FIELD && selectedCard.turnPlayed === turn) {
      if (!selectedCard.keywords?.includes('Rush')) return false;
    }
    return true;
  }, [selectedCard, isMyTurn, phase, turn, playerId, gameState?.firstPlayerId]);

  // Check if selected card has abilities (for attack button flow)
  const selectedCardHasAbilities = useMemo(() => {
    if (!selectedCard) return false;
    const def = cardDefinitions.get(selectedCard.cardId);
    return !!(def?.effect && def.effect.trim().length > 0);
  }, [selectedCard, cardDefinitions]);

  // Calculate valid attack targets
  const targetableCards = useMemo(() => {
    const targets = new Set<string>();
    if (!opponent || !selectedCardCanAttack) return targets;

    // Cards with abilities require attack mode to be active (Attack button clicked)
    // Cards without abilities can attack immediately (current behavior)
    if (selectedCardHasAbilities && !isAttackMode) return targets;

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
  }, [opponent, selectedCardCanAttack, selectedCardHasAbilities, isAttackMode]);

  // Calculate valid blockers during BLOCKER_STEP
  const validBlockers = useMemo(() => {
    const blockers = new Set<string>();
    if (!myPlayer || !isDefender || phase !== GamePhase.BLOCKER_STEP) return blockers;

    // Characters with Blocker keyword that are not rested can block
    myPlayer.field.forEach(card => {
      if (card.state !== 'RESTED' && card.keywords?.includes('Blocker')) {
        blockers.add(card.id);
      }
    });

    return blockers;
  }, [myPlayer, isDefender, phase]);

  // Calculate DON attachment targets - when a DON is selected, show valid targets
  const donAttachTargets = useMemo(() => {
    const targets = new Set<string>();
    if (!myPlayer || !selectedDon || phase !== GamePhase.MAIN_PHASE) return targets;

    // Leader is a valid target
    if (myPlayer.leaderCard) {
      targets.add(myPlayer.leaderCard.id);
    }

    // All characters on field are valid targets
    myPlayer.field.forEach(card => {
      targets.add(card.id);
    });

    return targets;
  }, [myPlayer, selectedDon, phase]);

  // Calculate valid DON cards for activation mode (step: select-don)
  const activationDonTargets = useMemo(() => {
    const targets = new Set<string>();
    if (!myPlayer || !activationMode || activationMode.step !== 'select-don') return targets;

    // Find rested DON cards (unattached)
    myPlayer.donField.forEach(don => {
      if (don.state === 'RESTED' && !don.attachedTo) {
        targets.add(don.id);
      }
    });

    return targets;
  }, [myPlayer, activationMode]);

  // Calculate valid targets for activation mode (step: select-target)
  const activationTargets = useMemo(() => {
    const targets = new Set<string>();
    if (!myPlayer || !activationMode || activationMode.step !== 'select-target') return targets;

    // Leader is a valid target
    if (myPlayer.leaderCard) {
      targets.add(myPlayer.leaderCard.id);
    }

    // All characters on field are valid targets
    myPlayer.field.forEach(card => {
      targets.add(card.id);
    });

    return targets;
  }, [myPlayer, activationMode]);

  // Calculate activate ability info for the previewed card
  // IMPORTANT: We derive previewedCard from gameState to get the latest card data
  // (including activatedThisTurn flag). Using pinnedCard/hoveredCard directly would
  // give us stale data since those are stored references that don't update.
  const previewedCard = useMemo(() => {
    const cardRef = pinnedCard || hoveredCard;
    if (!cardRef || !gameState) return null;

    // Look up the current card data from gameState by ID
    for (const player of Object.values(gameState.players)) {
      // Check leader
      if (player.leaderCard?.id === cardRef.id) {
        return player.leaderCard;
      }
      // Check field
      const fieldCard = player.field.find(c => c.id === cardRef.id);
      if (fieldCard) return fieldCard;
      // Check hand
      const handCard = player.hand.find(c => c.id === cardRef.id);
      if (handCard) return handCard;
      // Check DON field
      const donCard = player.donField.find(c => c.id === cardRef.id);
      if (donCard) return donCard;
    }
    // Card not found in game state (might have been removed), fall back to reference
    return cardRef;
  }, [pinnedCard, hoveredCard, gameState]);

  // Calculate attached DON count for the previewed card
  const previewedCardDonCount = useMemo(() => {
    if (!previewedCard || !gameState) return 0;
    // Check both players' donField to find DON attached to this card
    for (const player of Object.values(gameState.players)) {
      const attachedCount = player.donField.filter(don => don.attachedTo === previewedCard.id).length;
      if (attachedCount > 0) return attachedCount;
    }
    return 0;
  }, [previewedCard, gameState]);

  // Calculate combat buff power for the previewed card (only during combat for defender)
  const previewedCardCombatBuff = useMemo(() => {
    if (!previewedCard || !gameState?.currentCombat) return 0;
    // Only show effect buff if this card is the combat target (defender)
    if (gameState.currentCombat.targetId === previewedCard.id) {
      return gameState.currentCombat.effectBuffPower || 0;
    }
    return 0;
  }, [previewedCard, gameState?.currentCombat]);

  const activateInfo = useMemo(() => {
    if (!previewedCard || !myPlayer) return undefined;

    // Card must belong to the player
    if (previewedCard.owner !== playerId) return undefined;

    // Card must be on field, leader, or stage
    if (previewedCard.zone !== CardZone.FIELD && previewedCard.zone !== CardZone.LEADER && previewedCard.zone !== CardZone.STAGE) return undefined;

    // Get card definition
    const cardDef = cardDefinitions.get(previewedCard.cardId);
    if (!cardDef) return undefined;

    // Check if card has an [Activate: Main] effect
    const hasActivateMain = cardDef.effect?.includes('[Activate: Main]') ||
                           cardDef.effect?.includes('[Activate:Main]');
    if (!hasActivateMain) return undefined;

    // Parse the effect description to show
    const effectMatch = cardDef.effect?.match(/\[Activate:\s*Main\]([^[]*)/i);
    const effectDescription = effectMatch ? effectMatch[0].trim() : 'Activate ability';

    // Check conditions
    if (!isMyTurn) {
      return { canActivate: false, reason: 'Not your turn', effectDescription };
    }

    if (phase !== GamePhase.MAIN_PHASE) {
      return { canActivate: false, reason: 'Only during Main Phase', effectDescription };
    }

    // Check once-per-turn
    if (previewedCard.activatedThisTurn && cardDef.effect?.toLowerCase().includes('once per turn')) {
      return { canActivate: false, reason: 'Already used this turn', effectDescription };
    }

    // Check if ability requires resting this card (REST_SELF cost)
    const restSelfMatch = cardDef.effect?.match(/rest this card/i);
    if (restSelfMatch && previewedCard.state === 'RESTED') {
      return { canActivate: false, reason: 'Card is already rested', effectDescription };
    }

    // Check DON cost requirements (parse from effect text)
    // Matches patterns like "rest 3 DON", "3 DON!!", "(3)" at start of ability
    const donCostMatch = cardDef.effect?.match(/(?:rest\s+)?(\d+)\s*(?:of your\s+)?DON!*/i) ||
                         cardDef.effect?.match(/\[Activate:\s*Main\]\s*\(?(\d+)\)?/i);
    if (donCostMatch) {
      const donCost = parseInt(donCostMatch[1], 10);
      const activeDonCount = myPlayer.donField.filter(d => d.state === 'ACTIVE' && !d.attachedTo).length;
      if (activeDonCount < donCost) {
        return { canActivate: false, reason: `Need ${donCost} active DON`, effectDescription };
      }
    }

    return { canActivate: true, effectDescription };
  }, [previewedCard, myPlayer, playerId, cardDefinitions, isMyTurn, phase]);

  // Handler for activating ability - enters activation mode for target selection
  const handleActivateAbility = useCallback(() => {
    if (!previewedCard || !activateInfo?.canActivate || !myPlayer) return;

    // Check if ability involves giving/selecting DON (parse from effect)
    const cardDef = cardDefinitions.get(previewedCard.cardId);
    const needsDonSelection = cardDef?.effect?.toLowerCase().includes('rested don');

    if (needsDonSelection) {
      // Check if there are any rested DON cards available
      const restedDon = myPlayer.donField.filter(d => d.state === 'RESTED' && !d.attachedTo);
      if (restedDon.length === 0) {
        showErrorBanner('No rested DON cards available');
        return;
      }
      // Enter activation mode - step 1: select DON
      setActivationMode({
        cardId: previewedCard.id,
        step: 'select-don'
      });
    } else {
      // Ability doesn't need DON selection, execute immediately
      activateAbility(previewedCard.id);
    }
  }, [previewedCard, activateInfo, activateAbility, myPlayer, cardDefinitions, showErrorBanner]);

  // Handler for canceling activation mode
  const handleCancelActivation = useCallback(() => {
    setActivationMode(null);
  }, []);

  // Handler for skipping DON selection in "up to" abilities
  const handleSkipActivation = useCallback(() => {
    if (!activationMode) return;
    // Execute the ability without selecting a DON (for "up to 1" abilities)
    activateAbility(activationMode.cardId, []);
    setActivationMode(null);
  }, [activationMode, activateAbility]);

  // Card click handler
  const handleCardClick = useCallback((card: GameCardType) => {
    // Handle activation mode clicks first (highest priority)
    if (activationMode && phase === GamePhase.MAIN_PHASE) {
      console.log('[ActivationMode] Click detected:', {
        step: activationMode.step,
        clickedCardId: card.id,
        clickedCardZone: card.zone,
        selectedDonId: activationMode.selectedDonId,
      });

      if (activationMode.step === 'select-don') {
        // Step 1: Selecting a rested DON
        console.log('[ActivationMode] DON targets:', Array.from(activationDonTargets));
        if (activationDonTargets.has(card.id)) {
          console.log('[ActivationMode] Valid DON selected, transitioning to select-target');
          // Valid rested DON selected - move to target selection
          setActivationMode({
            ...activationMode,
            step: 'select-target',
            selectedDonId: card.id
          });
          return;
        }
        console.log('[ActivationMode] Card not in DON targets');
      } else if (activationMode.step === 'select-target') {
        // Step 2: Selecting a target for the DON
        console.log('[ActivationMode] Target candidates:', Array.from(activationTargets));
        if (activationTargets.has(card.id)) {
          console.log('[ActivationMode] Valid target selected, executing ability');
          // Valid target selected - execute the ability
          activateAbility(activationMode.cardId, [activationMode.selectedDonId!, card.id]);
          setActivationMode(null);
          return;
        }
        console.log('[ActivationMode] Card not in targets - clicked card id:', card.id);
      }
      // Clicked on something that's not a valid target - ignore or could cancel
      console.log('[ActivationMode] Click ignored - not a valid target');
      return;
    }

    // Handle attack effect step target selection
    if (phase === GamePhase.ATTACK_EFFECT_STEP && currentAttackEffect && currentAttackEffect.playerId === playerId) {
      if (attackEffectValidTargets.has(card.id)) {
        // Toggle target selection
        if (attackEffectSelectedTargets.includes(card.id)) {
          setAttackEffectSelectedTargets(prev => prev.filter(id => id !== card.id));
        } else {
          // For now, support single target selection (can be extended for multi-target)
          setAttackEffectSelectedTargets([card.id]);
        }
        return;
      }
      // Clicked on non-valid target - ignore
      return;
    }

    // Handle play effect step target selection
    if (phase === GamePhase.PLAY_EFFECT_STEP && currentPlayEffect && currentPlayEffect.playerId === playerId) {
      if (playEffectValidTargets.has(card.id)) {
        // For ATTACH_DON, resolve immediately on click (DON is auto-selected)
        if (currentPlayEffect.effectType === 'ATTACH_DON') {
          resolvePlayEffect(currentPlayEffect.id, [card.id]);
          setPlayEffectSelectedTargets([]);
          playSound('play');
          return;
        }

        // For other effects, toggle target selection
        if (playEffectSelectedTargets.includes(card.id)) {
          setPlayEffectSelectedTargets(prev => prev.filter(id => id !== card.id));
        } else {
          // Support multi-target selection up to maxTargets
          const maxTargets = currentPlayEffect.maxTargets || 1;
          if (playEffectSelectedTargets.length < maxTargets) {
            setPlayEffectSelectedTargets(prev => [...prev, card.id]);
          } else {
            // Replace the last selection if at max
            setPlayEffectSelectedTargets([card.id]);
          }
        }
        return;
      }
      // Clicked on non-valid target - ignore
      return;
    }

    // Handle activate effect hand selection (e.g., Empty Throne - select card to play from hand)
    if (currentActivateEffect && currentActivateEffect.playerId === playerId && card.zone === CardZone.HAND) {
      if (activateEffectValidTargets.has(card.id)) {
        // Toggle target selection
        if (activateEffectSelectedTargets.includes(card.id)) {
          setActivateEffectSelectedTargets(prev => prev.filter(id => id !== card.id));
        } else {
          // Support single target selection for now
          const maxTargets = currentActivateEffect.maxTargets || 1;
          if (activateEffectSelectedTargets.length < maxTargets) {
            setActivateEffectSelectedTargets(prev => [...prev, card.id]);
          } else {
            setActivateEffectSelectedTargets([card.id]);
          }
        }
        return;
      }
      // Clicked on non-valid hand card - ignore
      return;
    }

    // Handle event effect target selection
    if (phase === GamePhase.EVENT_EFFECT_STEP && currentEventEffect && currentEventEffect.playerId === playerId) {
      if (eventEffectValidTargets.has(card.id)) {
        // Toggle target selection
        if (eventEffectSelectedTargets.includes(card.id)) {
          setEventEffectSelectedTargets(prev => prev.filter(id => id !== card.id));
        } else {
          const maxTargets = currentEventEffect.maxTargets || 1;
          if (eventEffectSelectedTargets.length < maxTargets) {
            setEventEffectSelectedTargets(prev => [...prev, card.id]);
          } else {
            setEventEffectSelectedTargets([card.id]);
          }
        }
        return;
      }
      return;
    }

    // Handle counter effect target selection
    if (phase === GamePhase.COUNTER_EFFECT_STEP && currentCounterEffect && currentCounterEffect.playerId === playerId) {
      if (counterEffectValidTargets.has(card.id)) {
        // Toggle target selection
        if (counterEffectSelectedTargets.includes(card.id)) {
          setCounterEffectSelectedTargets(prev => prev.filter(id => id !== card.id));
        } else {
          const maxTargets = currentCounterEffect.maxTargets || 1;
          if (counterEffectSelectedTargets.length < maxTargets) {
            setCounterEffectSelectedTargets(prev => [...prev, card.id]);
          } else {
            setCounterEffectSelectedTargets([card.id]);
          }
        }
        return;
      }
      return;
    }

    // During combat phases (BLOCKER_STEP or COUNTER_STEP), clicking any card toggles pin to preview
    if (phase === GamePhase.BLOCKER_STEP || phase === GamePhase.COUNTER_STEP) {
      if (pinnedCard?.id === card.id) {
        // Click same card again - unpin it
        setPinnedCard(null);
      } else {
        // Pin the card to preview so user can read it (persists until combat ends or unpinned)
        setPinnedCard(card);
      }
      return;
    }

    // If card is in hand and playable
    if (card.zone === CardZone.HAND && playableCards.has(card.id)) {
      const targetZone = getTargetZone(card.cardId);

      // Character cards use two-step flow: select first, then click zone to play
      if (targetZone === 'FIELD') {
        // If clicking the same pending card, deselect it
        if (pendingPlayCard?.id === card.id) {
          setPendingPlayCard(null);
        } else {
          // Select this character card for placement
          setPendingPlayCard(card);
          setSelectedDon(null); // Clear DON selection
          setSelectedCard(null); // Clear attack selection
        }
        return;
      }

      // Events and Stages use single-click auto-play
      playCard(card.id, targetZone);
      playSound('play');
      return;
    }

    // Handle DON card clicks during main phase
    if (isMyTurn && phase === GamePhase.MAIN_PHASE) {
      // If clicking on own ACTIVE DON card, select it for attaching
      if (card.zone === CardZone.DON_FIELD && card.owner === playerId && card.state === 'ACTIVE') {
        if (selectedDon?.id === card.id) {
          setSelectedDon(null); // Deselect
        } else {
          setSelectedDon(card);
          setSelectedCard(null); // Clear any selected character
          setPendingPlayCard(null); // Clear pending play
        }
        return;
      }

      // If we have a selected DON and clicking on our own character or leader, attach it
      if (selectedDon && card.owner === playerId) {
        if (card.zone === CardZone.FIELD || card.zone === CardZone.LEADER) {
          attachDon(selectedDon.id, card.id);
          setSelectedDon(null);
          return;
        }
      }
    }

    // If we have a selected card and clicking a target, attempt to attack
    if (selectedCard && targetableCards.has(card.id)) {
      // Check if the selected card can actually attack - show error if not
      if (selectedCard.state === CardState.RESTED) {
        showErrorBanner('This character is rested and cannot attack');
        return;
      } else if (selectedCard.hasAttacked) {
        showErrorBanner('This character has already attacked this turn');
        return;
      } else if (selectedCard.zone === CardZone.FIELD && selectedCard.turnPlayed === turn && !selectedCard.keywords?.includes('Rush')) {
        showErrorBanner('Cannot attack - played this turn (needs Rush)');
        return;
      }

      // Card can attack - proceed with attack
      const targetType: 'leader' | 'character' =
        (opponent?.leaderCard?.id === card.id) ? 'leader' : 'character';

      // Start attack animation
      setAttackAnimation({
        attackerId: selectedCard.id,
        targetId: card.id,
        phase: 'jumping'
      });
      // Play attack sound
      playSound('attack');

      // After animation, send the attack
      setTimeout(() => {
        setAttackAnimation(prev => prev ? { ...prev, phase: 'returning' } : null);
        // Play rest sound as card settles into rested position
        playSound('rest');
      }, 300);

      setTimeout(() => {
        setAttackAnimation(null);
        console.log('[DEBUG ATTACK] Declaring attack:', {
          attackerId: selectedCard.id,
          targetId: card.id,
          targetType,
          selectedCardZone: selectedCard.zone,
          targetCardZone: card.zone
        });
        declareAttack(selectedCard.id, card.id, targetType);
        setIsAttackMode(false);
        setSelectedCard(null);
        setPinnedCard(null);
      }, 500);

      return;
    }

    // Select/deselect card for attacking (and pin/unpin during main phase)
    if (selectedCard?.id === card.id) {
      // Clicking same card - deselect and unpin
      setSelectedCard(null);
      setIsAttackMode(false);
      if (phase === GamePhase.MAIN_PHASE) {
        setPinnedCard(null);
      }
    } else if (card.owner === playerId && (card.zone === CardZone.FIELD || card.zone === CardZone.LEADER || card.zone === CardZone.STAGE)) {
      // Allow selecting field characters, leader, or stage for abilities
      setSelectedDon(null); // Clear any selected DON
      setIsAttackMode(false); // Clear attack mode when selecting a different card

      // Stage cards can be pinned but not selected for attacking
      if (card.zone === CardZone.STAGE) {
        if (phase === GamePhase.MAIN_PHASE) {
          setPinnedCard(card);
        }
      } else {
        setSelectedCard(card);
        // During main phase, also pin the card to preview so Activate button is clickable
        if (phase === GamePhase.MAIN_PHASE) {
          setPinnedCard(card);
        }
      }
    }
  }, [phase, isDefender, validBlockers, selectBlocker, playableCards, selectedCard, targetableCards, playCard, declareAttack, setSelectedCard, playerId, opponent, isMyTurn, selectedDon, attachDon, showErrorBanner, turn, pinnedCard, activationMode, activationDonTargets, activationTargets, activateAbility, pendingPlayCard, getTargetZone]);

  // Card hover handler
  const handleCardHover = useCallback((card: GameCardType | null) => {
    setHoveredCard(card);
  }, [setHoveredCard]);

  // Background click handler - clear selections when clicking on empty space
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // Check if we clicked on a card or interactive element
    const isCardClick = target.closest('.game-card') !== null;
    const isButtonClick = target.closest('button') !== null;
    const isModalClick = target.closest('.combat-modal') !== null;
    const isSidebarClick = target.closest('.game-board__sidebar') !== null;
    const isZoneClick = target.closest('.zone--characters') !== null;

    // If not clicking on a card, button, modal, sidebar, or character zone, it's a background click
    const isBackgroundClick = !isCardClick && !isButtonClick && !isModalClick && !isSidebarClick && !isZoneClick;

    if (isBackgroundClick) {
      if (selectedDon) {
        setSelectedDon(null);
      }
      if (selectedCard) {
        setSelectedCard(null);
      }
      if (pinnedCard && phase === GamePhase.MAIN_PHASE) {
        setPinnedCard(null);
      }
      if (activationMode) {
        setActivationMode(null);
      }
      if (pendingPlayCard) {
        setPendingPlayCard(null);
      }
    }
  }, [selectedDon, selectedCard, setSelectedCard, pinnedCard, phase, activationMode, pendingPlayCard]);

  // Trash click handlers
  const handlePlayerTrashClick = useCallback(() => {
    if (myPlayer && myPlayer.trash.length > 0) {
      setTrashModalOpen('player');
    }
  }, [myPlayer]);

  const handleOpponentTrashClick = useCallback(() => {
    if (opponent && opponent.trash.length > 0) {
      setTrashModalOpen('opponent');
    }
  }, [opponent]);

  // Character zone click handler - plays the pending character card
  const handleCharacterZoneClick = useCallback(() => {
    if (pendingPlayCard && phase === GamePhase.MAIN_PHASE) {
      playCard(pendingPlayCard.id, 'FIELD');
      playSound('play');
      setPendingPlayCard(null);
    }
  }, [pendingPlayCard, phase, playCard, playSound]);

  const handleCloseTrashModal = useCallback(() => {
    setTrashModalOpen(null);
    setTrashPinnedCardId(null);
    setHoveredCard(null);
  }, []);

  // Trash card hover handler - set preview unless a card is pinned
  const handleTrashCardHover = useCallback((card: GameCardType | null) => {
    // Only update preview on hover if no card is pinned
    if (!trashPinnedCardId) {
      setHoveredCard(card);
    }
  }, [trashPinnedCardId]);

  // Trash card click handler - pin/unpin cards
  const handleTrashCardClick = useCallback((card: GameCardType) => {
    if (trashPinnedCardId === card.id) {
      // Unpin the card
      setTrashPinnedCardId(null);
    } else {
      // Pin the card
      setTrashPinnedCardId(card.id);
      setHoveredCard(card);
    }
  }, [trashPinnedCardId]);

  // Counter wrapper with sound
  const handleUseCounter = useCallback((cardIds: string[]) => {
    useCounter(cardIds);
    playSound('counter');
  }, [useCounter, playSound]);

  // Attack effect step handlers
  const handleUseAttackEffect = useCallback(() => {
    if (!currentAttackEffect) return;
    // Resolve the effect with selected targets
    resolveAttackEffect(currentAttackEffect.id, attackEffectSelectedTargets);
    setAttackEffectSelectedTargets([]);
    playSound('play');
  }, [currentAttackEffect, attackEffectSelectedTargets, resolveAttackEffect, playSound]);

  const handleSkipAttackEffect = useCallback(() => {
    if (!currentAttackEffect) return;
    // Skip this effect
    skipAttackEffect(currentAttackEffect.id);
    setAttackEffectSelectedTargets([]);
  }, [currentAttackEffect, skipAttackEffect]);

  // Play effect step handlers
  const handleUsePlayEffect = useCallback(() => {
    if (!currentPlayEffect) return;
    // Resolve the effect with selected targets
    resolvePlayEffect(currentPlayEffect.id, playEffectSelectedTargets);
    setPlayEffectSelectedTargets([]);
    playSound('play');
  }, [currentPlayEffect, playEffectSelectedTargets, resolvePlayEffect, playSound]);

  const handleSkipPlayEffect = useCallback(() => {
    if (!currentPlayEffect) return;
    // Skip this effect
    skipPlayEffect(currentPlayEffect.id);
    setPlayEffectSelectedTargets([]);
  }, [currentPlayEffect, skipPlayEffect]);

  // Activate effect handlers (for hand card selection like Empty Throne)
  const handleUseActivateEffect = useCallback(() => {
    if (!currentActivateEffect) return;
    // Resolve the effect with selected hand cards
    resolveActivateEffect(currentActivateEffect.id, activateEffectSelectedTargets);
    setActivateEffectSelectedTargets([]);
    playSound('play');
  }, [currentActivateEffect, activateEffectSelectedTargets, resolveActivateEffect, playSound]);

  const handleSkipActivateEffect = useCallback(() => {
    if (!currentActivateEffect) return;
    // Skip this effect (only if optional)
    skipActivateEffect(currentActivateEffect.id);
    setActivateEffectSelectedTargets([]);
  }, [currentActivateEffect, skipActivateEffect]);

  // Event effect step handlers
  const handleUseEventEffect = useCallback(() => {
    if (!currentEventEffect) return;
    resolveEventEffect(currentEventEffect.id, eventEffectSelectedTargets);
    setEventEffectSelectedTargets([]);
    playSound('play');
  }, [currentEventEffect, eventEffectSelectedTargets, resolveEventEffect, playSound]);

  const handleSkipEventEffect = useCallback(() => {
    if (!currentEventEffect) return;
    skipEventEffect(currentEventEffect.id);
    setEventEffectSelectedTargets([]);
  }, [currentEventEffect, skipEventEffect]);

  // Counter effect step handlers
  const handleUseCounterEffect = useCallback(() => {
    if (!currentCounterEffect) return;
    resolveCounterEffect(currentCounterEffect.id, counterEffectSelectedTargets);
    setCounterEffectSelectedTargets([]);
    playSound('play');
  }, [currentCounterEffect, counterEffectSelectedTargets, resolveCounterEffect, playSound]);

  // Additional cost handlers
  const handlePayAdditionalCost = useCallback(() => {
    if (!currentAdditionalCost) return;
    payAdditionalCost(currentAdditionalCost.id);
  }, [currentAdditionalCost, payAdditionalCost]);

  const handleSkipAdditionalCost = useCallback(() => {
    if (!currentAdditionalCost) return;
    skipAdditionalCost(currentAdditionalCost.id);
  }, [currentAdditionalCost, skipAdditionalCost]);

  // Mulligan handlers
  const handleKeepHand = useCallback(() => {
    console.log('[GameBoard] Keep Hand clicked');
    setMulliganDecisionMade(true);
    keepHand();
    // Life dealing animation will be triggered when we receive state update showing phase changed
  }, [keepHand]);

  const handleMulligan = useCallback(() => {
    console.log('[GameBoard] Mulligan clicked');
    setMulliganDecisionMade(true);
    mulligan();
    // Life dealing animation will be triggered when we receive state update showing phase changed
  }, [mulligan]);

  // Mulligan timer - 20 seconds to make decision, auto-keep if timer expires
  useEffect(() => {
    // Only run timer when mulligan overlay is showing
    const showingMulligan = phase === GamePhase.START_MULLIGAN &&
      !mulliganDecisionMade &&
      myPlayer &&
      dealingPhase === 'waiting-mulligan';

    if (!showingMulligan) {
      // Reset timer when not in mulligan phase
      setMulliganTimer(20);
      return;
    }

    // Start countdown
    const interval = setInterval(() => {
      setMulliganTimer(prev => {
        if (prev <= 1) {
          // Timer expired, auto-keep hand
          console.log('[GameBoard] Mulligan timer expired, auto-keeping hand');
          handleKeepHand();
          return 20;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase, mulliganDecisionMade, myPlayer, dealingPhase, handleKeepHand]);

  // Trigger life dealing when game transitions from START_MULLIGAN to next phase
  useEffect(() => {
    if (dealingPhase === 'waiting-mulligan' &&
        phase &&
        phase !== GamePhase.START_MULLIGAN &&
        phase !== GamePhase.START_WAITING) {
      console.log('[GameBoard] Phase changed from mulligan, starting life dealing. New phase:', phase);
      startDealingLife();
    }
  }, [phase, dealingPhase, startDealingLife]);

  // Get phase display name
  const getPhaseDisplay = (p: GamePhase | null): string => {
    if (!p) return '';
    const phaseNames: Record<GamePhase, string> = {
      [GamePhase.START_WAITING]: 'Waiting',
      [GamePhase.RPS_PHASE]: 'Rock Paper Scissors',
      [GamePhase.FIRST_CHOICE]: 'Choose Turn Order',
      [GamePhase.PRE_GAME_SETUP]: 'Pre-Game Setup',
      [GamePhase.START_MULLIGAN]: 'Mulligan',
      [GamePhase.START_SETUP]: 'Setup',
      [GamePhase.REFRESH_PHASE]: 'Refresh',
      [GamePhase.DRAW_PHASE]: 'Draw',
      [GamePhase.DON_PHASE]: 'DON',
      [GamePhase.MAIN_PHASE]: 'Main',
      [GamePhase.COMBAT_PHASE]: 'Combat',
      [GamePhase.END_PHASE]: 'End',
      [GamePhase.ATTACK_EFFECT_STEP]: 'Attack Effect',
      [GamePhase.PLAY_EFFECT_STEP]: 'On Play Effect',
      [GamePhase.EVENT_EFFECT_STEP]: 'Event Effect',
      [GamePhase.COUNTER_EFFECT_STEP]: 'Counter Effect',
      [GamePhase.ADDITIONAL_COST_STEP]: 'Pay Cost',
      [GamePhase.DECK_REVEAL_STEP]: 'Deck Reveal',
      [GamePhase.HAND_SELECT_STEP]: 'Select from Hand',
      [GamePhase.COUNTER_STEP]: 'Counter',
      [GamePhase.BLOCKER_STEP]: 'Blocker',
      [GamePhase.TRIGGER_STEP]: 'Trigger',
      [GamePhase.GAME_OVER]: 'Game Over'
    };
    return phaseNames[p] || p;
  };

  // Check if hovered card should be hidden
  const isHoveredCardHidden = useMemo(() => {
    if (!hoveredCard) return false;

    // LIFE cards are always hidden (game rule - no one knows life cards until damaged)
    if (hoveredCard.zone === CardZone.LIFE) return true;

    // Opponent's hand is hidden
    if (hoveredCard.owner !== playerId && hoveredCard.zone === CardZone.HAND) return true;

    return false;
  }, [hoveredCard, playerId]);

  // Show mulligan overlay - only after hand dealing animation completes
  const showMulligan = phase === GamePhase.START_MULLIGAN &&
    !mulliganDecisionMade &&
    myPlayer &&
    dealingPhase === 'waiting-mulligan';

  // Hide life zone during hand dealing
  const hideLifeZone = dealingPhase === 'dealing-hand' || dealingPhase === 'waiting-mulligan';

  return (
    <div
      className={`game-board ${isAnimationBlocked ? 'game-board--blocked' : ''}`}
      onClick={handleBackgroundClick}
    >
      {/* Blocking overlay during animations */}
      {isAnimationBlocked && <div className="game-board__blocking-overlay" />}

      {/* Effect toast notifications */}
      <EffectToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Effect animations layer (particles, trails, etc.) */}
      <EffectAnimationLayer apiRef={effectAnimationRef} />

      {/* Animating cards */}
      {animatingCards.map(animCard => (
        <AnimatingCard
          key={animCard.id}
          card={animCard.card}
          faceUp={animCard.faceUp}
          startPos={animCard.startPos}
          endPos={animCard.endPos}
          delay={animCard.delay}
          endRotation={animCard.endRotation}
          onComplete={() => handleAnimationComplete(animCard.id, animCard.targetZone, animCard.isOpponent)}
        />
      ))}

      {/* Animating DON cards */}
      {animatingDon.map(animCard => (
        <AnimatingCard
          key={animCard.id}
          card={animCard.card}
          faceUp={animCard.faceUp}
          startPos={animCard.startPos}
          endPos={animCard.endPos}
          delay={animCard.delay}
          flipDuringFlight={animCard.flipDuringFlight}
          isDon={true}
          onComplete={() => handleAnimationComplete(animCard.id, animCard.targetZone, animCard.isOpponent)}
        />
      ))}

      {/* Animating DON refresh (returning to cost area) */}
      {animatingDonRefresh.map(animCard => (
        <AnimatingCard
          key={animCard.id}
          card={animCard.card}
          faceUp={animCard.faceUp}
          startPos={animCard.startPos}
          endPos={animCard.endPos}
          delay={animCard.delay}
          isDon={true}
          duration={300}
        />
      ))}

      {/* Refresh Phase banner */}
      {showRefreshBanner && (
        <div className="refresh-phase-banner">
          Refresh Phase
        </div>
      )}

      {/* Animating life damage cards */}
      {animatingLifeDamage.map(animCard => (
        <AnimatingCard
          key={animCard.id}
          card={animCard.card}
          faceUp={animCard.faceUp}
          startPos={animCard.startPos}
          endPos={animCard.endPos}
          delay={animCard.delay}
          onComplete={() => handleLifeDamageAnimationComplete(animCard.id, animCard.isOpponent)}
        />
      ))}

      {/* Animating hand draw cards */}
      {animatingHandDraw.map(animCard => (
        <AnimatingCard
          key={animCard.id}
          card={animCard.card}
          faceUp={animCard.faceUp}
          startPos={animCard.startPos}
          endPos={animCard.endPos}
          delay={animCard.delay}
          flipDuringFlight={animCard.flipDuringFlight}
          onComplete={() => handleHandDrawAnimationComplete(animCard.id, animCard.isOpponent)}
        />
      ))}

      {/* Animating mill cards (deck to trash) */}
      {animatingMill.map(animCard => (
        <AnimatingCard
          key={animCard.id}
          card={animCard.card}
          faceUp={animCard.faceUp}
          startPos={animCard.startPos}
          endPos={animCard.endPos}
          delay={animCard.delay}
          flipDuringFlight={animCard.flipDuringFlight}
          onComplete={() => handleMillAnimationComplete(animCard.id)}
        />
      ))}

      {/* Life damage indicator */}
      {lifeDamageIndicator && (
        <div
          key={lifeDamageIndicator.key}
          className={`life-damage-indicator ${lifeDamageIndicator.isOpponent ? 'life-damage-indicator--opponent' : 'life-damage-indicator--player'}`}
        >
          <span className="life-damage-indicator__text">-{lifeDamageIndicator.amount}</span>
        </div>
      )}

      {/* Header */}
      <div className="game-board__header">
        {/* Left: Game Info */}
        <div className="game-board__header-left">
          <span className="game-board__game-id">ID: {gameId?.slice(0, 8)}</span>
          {isAIGame && (
            <span className="game-board__ai-badge">VS AI</span>
          )}
        </div>

        {/* Center: Turn Info */}
        <div className="game-board__header-center">
          <span className="game-board__turn">Turn {turn || 1}</span>
          <span className="game-board__phase">{getPhaseDisplay(phase)}</span>
          <span className={`game-board__turn-indicator ${isMyTurn ? 'game-board__turn-indicator--your-turn' : 'game-board__turn-indicator--waiting'}`}>
            {isMyTurn ? 'Your Turn' : "Opponent's Turn"}
          </span>
        </div>

        {/* Right: Controls */}
        <div className="game-board__header-right">
          <button
            className="settings-button"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            ⚙
          </button>
          <button
            className="game-board__surrender-btn"
            onClick={onLeave}
            title={isAIGame ? 'Surrender' : 'Leave Game'}
          >
            {isAIGame ? 'Surrender' : 'Leave'}
          </button>
        </div>
      </div>

      {/* Main game area */}
      <div className="game-board__main">
        {/* Opponent hand indicator */}
        {opponent && (
          <HandZone
            cards={dealingPhase === 'dealing-hand'
              ? opponent.hand.slice(0, visibleHandCount.opponent)
              : (animatingLifeDamage.some(a => a.isOpponent) || animatingHandDraw.some(a => a.isOpponent))
                ? opponent.hand.slice(0, visibleHandCount.opponent)
                : opponent.hand}
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
            attackAnimation={attackAnimation}
            eventEffectTargets={eventEffectValidTargets}
            eventEffectSelected={new Set(eventEffectSelectedTargets)}
            onCardHover={handleCardHover}
            onCardClick={handleCardClick}
            onTrashClick={handleOpponentTrashClick}
            visibleLifeCount={hideLifeZone ? 0 : visibleLifeCount.opponent}
            visibleDonCount={visibleDonCount.opponent}
            hideLifeZone={hideLifeZone}
            gameOverResult={gameOver ? (gameOver.winner === playerId ? 'loser' : 'winner') : null}
            playmatImage={opponentPlaymat}
            isMyTurn={isMyTurn}
          />
        )}

        {/* Player area */}
        {myPlayer && (
          <PlayerArea
            player={myPlayer}
            isOpponent={false}
            cardDefinitions={cardDefinitions}
            playableCards={playableCards}
            blockerCards={validBlockers}
            selectedCard={selectedCard}
            selectedDon={selectedDon}
            pendingPlayCard={pendingPlayCard}
            donAttachTargets={donAttachTargets}
            activationDonTargets={activationDonTargets}
            activationTargets={activationTargets}
            attackEffectTargets={attackEffectValidTargets}
            attackEffectSelected={new Set(attackEffectSelectedTargets)}
            playEffectTargets={playEffectValidTargets}
            playEffectSelected={new Set(playEffectSelectedTargets)}
            eventEffectTargets={eventEffectValidTargets}
            eventEffectSelected={new Set(eventEffectSelectedTargets)}
            counterEffectTargets={counterEffectValidTargets}
            counterEffectSelected={new Set(counterEffectSelectedTargets)}
            attackAnimation={attackAnimation}
            onCardHover={handleCardHover}
            onCardClick={handleCardClick}
            onTrashClick={handlePlayerTrashClick}
            onCharacterZoneClick={handleCharacterZoneClick}
            visibleLifeCount={hideLifeZone ? 0 : visibleLifeCount.player}
            visibleDonCount={visibleDonCount.player}
            hideLifeZone={hideLifeZone}
            gameOverResult={gameOver ? (gameOver.winner === playerId ? 'winner' : 'loser') : null}
            playmatImage={playerPlaymat}
            isMyTurn={isMyTurn}
          />
        )}

        {/* Player hand - hide during mulligan overlay and hand dealing */}
        {/* During BLOCKER_STEP, show field cards instead of hand cards */}
        {myPlayer && !showMulligan && dealingPhase !== 'dealing-hand' && (
          <HandZone
            cards={
              phase === GamePhase.BLOCKER_STEP && isDefender
                // Show field cards during blocker step, excluding the card being attacked
                ? myPlayer.field.filter(c => c.id !== gameState?.currentCombat?.targetId)
                : (animatingLifeDamage.some(a => !a.isOpponent) || animatingHandDraw.some(a => !a.isOpponent))
                  ? myPlayer.hand.slice(0, visibleHandCount.player)
                  : myPlayer.hand
            }
            isOpponent={false}
            cardDefinitions={cardDefinitions}
            playableCards={playableCards}
            selectedCard={selectedCard}
            pinnedCard={pinnedCard}
            pendingPlayCard={pendingPlayCard}
            activateEffectSelectedTargets={activateEffectSelectedTargets}
            handSelectMode={phase === GamePhase.HAND_SELECT_STEP && currentHandSelectEffect?.playerId === playerId}
            handSelectSelectedCards={handSelectSelectedCards}
            onCardHover={handleCardHover}
            onCardClick={handleCardClick}
            onHandSelectCardClick={handleHandSelectCardClick}
          />
        )}
      </div>

      {/* Sidebar: Card Preview + Actions */}
      <div className="game-board__sidebar">
        <CardPreview
          card={pinnedCard || hoveredCard}
          cardDef={(pinnedCard || hoveredCard) ? cardDefinitions.get((pinnedCard || hoveredCard)!.cardId) : undefined}
          isHidden={!pinnedCard && isHoveredCardHidden}
          attachedDonCount={previewedCardDonCount}
          combatBuffPower={previewedCardCombatBuff}
          activateInfo={activateInfo}
          onActivateAbility={handleActivateAbility}
          activationMode={activationMode}
          onCancelActivation={handleCancelActivation}
          onSkipActivation={handleSkipActivation}
          playEffectInfo={playEffectInfo}
        />
        {/* Hide action buttons during pre-game setup */}
        {phase !== GamePhase.PRE_GAME_SETUP && (
          <ActionButtons
            phase={phase}
            isMyTurn={isMyTurn}
            isDefender={isDefender}
            onEndTurn={endTurn}
            onPass={pass}
            onKeepHand={handleKeepHand}
            onMulligan={handleMulligan}
            onUseCounter={() => handleUseCounter([])}
            onPassCounter={passCounter}
            onSelectBlocker={() => {/* TODO: Open blocker selection UI */}}
            onPassBlocker={passBlocker}
            onActivateTrigger={() => activateTrigger('')}
            onPassTrigger={passTrigger}
            showAttackButton={selectedCardHasAbilities}
            canAttack={selectedCardCanAttack}
            isAttackMode={isAttackMode}
            onAttack={() => setIsAttackMode(true)}
            onCancelAttack={() => setIsAttackMode(false)}
          />
        )}
      </div>

      {/* RPS Modal - choosing phase */}
      <RPSModal
        isOpen={rpsPhase === 'choosing'}
        playerId={playerId}
        rpsState={rpsState || undefined}
        onChoose={handleRPSChoice}
        timeoutSeconds={10}
      />

      {/* RPS Result Modal */}
      {rpsState && (
        <RPSResultModal
          isOpen={rpsPhase === 'result'}
          playerId={playerId}
          rpsState={rpsState}
        />
      )}

      {/* First Choice Modal - for winner to choose first/second */}
      <FirstChoiceModal
        isOpen={rpsPhase === 'first-choice'}
        isWinner={rpsWinnerId === playerId}
        isAIGame={isAIGame}
        onChoose={handleFirstChoiceSelection}
        timeoutSeconds={10}
      />

      {/* Pre-Game Setup Modal - for start-of-game abilities like Imu */}
      {phase === GamePhase.PRE_GAME_SETUP && gameState?.pendingPreGameEffects && myPlayer && (
        (() => {
          const myEffect = gameState.pendingPreGameEffects.find(e => e.playerId === playerId);
          if (!myEffect) return null;
          return (
            <PreGameSetup
              effect={myEffect}
              deckCards={myPlayer.deck}
              cardDefinitions={cardDefinitions}
              onSelect={preGameSelect}
              onSkip={skipPreGame}
              onHover={handleCardHover}
            />
          );
        })()
      )}

      {/* Turn Order Banner - shown to loser after first decided */}
      {turnOrderBanner?.visible && (
        <div className={`turn-order-banner ${turnOrderBanner.goesFirst ? 'turn-order-banner--first' : 'turn-order-banner--second'}`}>
          <span className="turn-order-banner__text">
            {turnOrderBanner.goesFirst ? 'You will go first!' : 'You will go second!'}
          </span>
        </div>
      )}

      {/* Mulligan overlay */}
      {showMulligan && myPlayer && (
        <div className="mulligan-overlay">
          <div className="mulligan-panel">
            <h2 className="mulligan-panel__title">Starting Hand</h2>
            <p className="mulligan-panel__subtitle">
              Review your starting hand. You may mulligan once for a new hand.
            </p>
            {/* Timer bar */}
            <div className="mulligan-panel__timer">
              <span className="mulligan-panel__timer-text">{mulliganTimer}s</span>
              <div
                className={`mulligan-panel__timer-bar ${mulliganTimer <= 5 ? 'mulligan-panel__timer-bar--urgent' : ''}`}
                style={{ width: `${(mulliganTimer / 20) * 100}%` }}
              />
            </div>
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

      {/* Attack prompt - shown when targets should be highlighted
          For cards with abilities: only after Attack button is clicked (isAttackMode)
          For cards without abilities: immediately when card is selected */}
      {selectedCardCanAttack && selectedCard && (!selectedCardHasAbilities || isAttackMode) && (
        <div className="attack-prompt">
          <div className="attack-prompt__content">
            <span className="attack-prompt__icon">⚔️</span>
            <span className="attack-prompt__text">Select a target to attack</span>
          </div>
        </div>
      )}

      {/* Attack Effect Step prompt - shown when ON_ATTACK effect needs target selection */}
      {currentAttackEffect && currentAttackEffect.playerId === playerId && (
        <div className="attack-effect-prompt">
          <div className="attack-effect-prompt__content">
            <div className="attack-effect-prompt__header">
              <span className="attack-effect-prompt__icon">✨</span>
              <span className="attack-effect-prompt__title">Attack Ability</span>
            </div>
            <div className="attack-effect-prompt__card-name">
              {attackEffectSourceCard && cardDefinitions.get(attackEffectSourceCard.cardId)?.name}
            </div>
            <p className="attack-effect-prompt__description">{currentAttackEffect.description}</p>
            {currentAttackEffect.requiresChoice && (
              <p className="attack-effect-prompt__instruction">
                {attackEffectSelectedTargets.length === 0
                  ? 'Select a target (highlighted cards)'
                  : `Target: ${attackEffectSelectedTargets.length} selected`}
              </p>
            )}
            <div className="attack-effect-prompt__buttons">
              <button
                className="action-btn action-btn--use-effect"
                onClick={handleUseAttackEffect}
                disabled={currentAttackEffect.requiresChoice && attackEffectSelectedTargets.length === 0}
              >
                Use
              </button>
              <button
                className="action-btn action-btn--skip-effect"
                onClick={handleSkipAttackEffect}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Play Effect Step prompt - shown when ON_PLAY effect needs target selection */}
      {/* ATTACH_DON effects show instructions in CardPreview instead */}
      {currentPlayEffect && currentPlayEffect.playerId === playerId &&
       currentPlayEffect.effectType !== 'ATTACH_DON' && (
        <div className="play-effect-prompt">
          <div className="play-effect-prompt__content">
            <div className="play-effect-prompt__header">
              <span className="play-effect-prompt__icon">⭐</span>
              <span className="play-effect-prompt__title">On Play Ability</span>
            </div>
            <div className="play-effect-prompt__card-name">
              {playEffectSourceCard && cardDefinitions.get(playEffectSourceCard.cardId)?.name}
            </div>
            <p className="play-effect-prompt__description">{currentPlayEffect.description}</p>
            {currentPlayEffect.requiresChoice && (
              <p className="play-effect-prompt__instruction">
                {currentPlayEffect.effectType === 'ATTACH_DON'
                  ? (playEffectSelectedTargets.length === 0
                      ? 'Select a rested DON card, then a target (Leader or Character)'
                      : playEffectSelectedTargets.length === 1
                        ? 'Now select target (Leader or Character)'
                        : `Selected: DON + Target`)
                  : (playEffectSelectedTargets.length === 0
                      ? `Select target(s) (up to ${currentPlayEffect.maxTargets || 1})`
                      : `Selected: ${playEffectSelectedTargets.length}/${currentPlayEffect.maxTargets || 1}`)}
              </p>
            )}
            <div className="play-effect-prompt__buttons">
              <button
                className="action-btn action-btn--use-effect"
                onClick={handleUsePlayEffect}
                disabled={currentPlayEffect.requiresChoice && (
                  currentPlayEffect.effectType === 'ATTACH_DON'
                    ? playEffectSelectedTargets.length < 2  // ATTACH_DON requires exactly 2 (DON + target)
                    : playEffectSelectedTargets.length === 0
                )}
              >
                Use
              </button>
              {(currentPlayEffect.minTargets === 0 || !currentPlayEffect.minTargets) && (
                <button
                  className="action-btn action-btn--skip-effect"
                  onClick={handleSkipPlayEffect}
                >
                  Skip
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Activate Effect prompt - shown when ACTIVATE_MAIN ability needs hand card selection */}
      {currentActivateEffect && currentActivateEffect.playerId === playerId && (
        <div className="play-effect-prompt activate-effect-prompt">
          <div className="play-effect-prompt__content">
            <div className="play-effect-prompt__header">
              <span className="play-effect-prompt__icon">🎯</span>
              <span className="play-effect-prompt__title">Activate Ability</span>
            </div>
            <p className="play-effect-prompt__description">{currentActivateEffect.description}</p>
            <p className="play-effect-prompt__instruction">
              {activateEffectSelectedTargets.length === 0
                ? `Select a card from your hand (${currentActivateEffect.validHandCardIds.length} valid)`
                : `Selected: ${activateEffectSelectedTargets.length}/${currentActivateEffect.maxTargets || 1}`}
            </p>
            <div className="play-effect-prompt__buttons">
              <button
                className="action-btn action-btn--use-effect"
                onClick={handleUseActivateEffect}
                disabled={activateEffectSelectedTargets.length === 0}
              >
                Play
              </button>
              {currentActivateEffect.optional && (
                <button
                  className="action-btn action-btn--skip-effect"
                  onClick={handleSkipActivateEffect}
                >
                  Skip
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Event Effect prompt - shown when event [Main] effect needs target selection */}
      {currentEventEffect && currentEventEffect.playerId === playerId && (
        <div className="play-effect-prompt event-effect-prompt">
          <div className="play-effect-prompt__content">
            <div className="play-effect-prompt__header">
              <span className="play-effect-prompt__icon">📜</span>
              <span className="play-effect-prompt__title">Event Effect</span>
            </div>
            <p className="play-effect-prompt__description">{currentEventEffect.description}</p>
            {!currentEventEffect.conditionsMet && (
              <p className="play-effect-prompt__warning">Leader condition not met - effect will fizzle</p>
            )}
            <p className="play-effect-prompt__instruction">
              {eventEffectSelectedTargets.length === 0
                ? `Select a target (${currentEventEffect.validTargets?.length || 0} valid)`
                : `Selected: ${eventEffectSelectedTargets.length}/${currentEventEffect.maxTargets || 1}`}
            </p>
            <div className="play-effect-prompt__buttons">
              <button
                className="action-btn action-btn--use-effect"
                onClick={handleUseEventEffect}
                disabled={eventEffectSelectedTargets.length === 0 && currentEventEffect.minTargets > 0}
              >
                Confirm
              </button>
              {currentEventEffect.minTargets === 0 && (
                <button
                  className="action-btn action-btn--skip-effect"
                  onClick={handleSkipEventEffect}
                >
                  Skip
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Counter Effect prompt - shown when counter effect needs target selection */}
      {currentCounterEffect && currentCounterEffect.playerId === playerId && (
        <div className="play-effect-prompt counter-effect-prompt">
          <div className="play-effect-prompt__content">
            <div className="play-effect-prompt__header">
              <span className="play-effect-prompt__icon">🛡️</span>
              <span className="play-effect-prompt__title">Counter Effect</span>
            </div>
            <p className="play-effect-prompt__description">{currentCounterEffect.description}</p>
            {!currentCounterEffect.conditionsMet && (
              <p className="play-effect-prompt__warning">Leader condition not met - effect will fizzle</p>
            )}
            <p className="play-effect-prompt__instruction">
              Select target for +{currentCounterEffect.powerBoost} power
            </p>
            <div className="play-effect-prompt__buttons">
              <button
                className="action-btn action-btn--use-effect"
                onClick={handleUseCounterEffect}
                disabled={counterEffectSelectedTargets.length === 0}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Additional Cost prompt - shown when optional cost can be paid */}
      {currentAdditionalCost && currentAdditionalCost.playerId === playerId && (
        <div className="play-effect-prompt additional-cost-prompt">
          <div className="play-effect-prompt__content">
            <div className="play-effect-prompt__header">
              <span className="play-effect-prompt__icon">💰</span>
              <span className="play-effect-prompt__title">Optional Cost</span>
            </div>
            <p className="play-effect-prompt__description">{currentAdditionalCost.description}</p>
            <p className="play-effect-prompt__instruction">
              Do you want to pay this cost to activate the effect?
            </p>
            <div className="play-effect-prompt__buttons">
              <button
                className="action-btn action-btn--use-effect"
                onClick={handlePayAdditionalCost}
              >
                Pay
              </button>
              <button
                className="action-btn action-btn--skip-effect"
                onClick={handleSkipAdditionalCost}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deck Reveal Modal - shown when player needs to select from revealed deck cards */}
      {currentDeckRevealEffect && currentDeckRevealEffect.playerId === playerId && (
        <DeckRevealModal
          effect={currentDeckRevealEffect}
          revealedCards={revealedCards}
          cardDefinitions={cardDefinitions}
          onSelect={handleDeckRevealSelect}
          onSkip={handleDeckRevealSkip}
          onCardHover={handleCardHover}
        />
      )}

      {/* Hand Select UI - shown when player needs to select cards from hand or field */}
      {currentHandSelectEffect && currentHandSelectEffect.playerId === playerId && (
        <div className="hand-select-panel">
          <div className="hand-select-panel__content">
            <p className="hand-select-panel__text">
              {currentHandSelectEffect.description}
              {handSelectSelectedCards.size > 0 && ` (${handSelectSelectedCards.size} selected)`}
            </p>
            <div className="hand-select-panel__buttons">
              <button
                className="action-btn action-btn--use-effect"
                onClick={handleHandSelectConfirm}
                disabled={!canConfirmHandSelect}
              >
                Confirm
              </button>
              {currentHandSelectEffect.canSkip && (
                <button
                  className="action-btn action-btn--skip-effect"
                  onClick={handleHandSelectSkip}
                >
                  Skip
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Counter notification - shown when opponent uses a counter */}
      {counterNotification && (
        <div className="counter-notification">
          <div className="counter-notification__content">
            <span className="counter-notification__icon">🛡️</span>
            <span className="counter-notification__text">
              Opponent used Counter! +{counterNotification.amount}
            </span>
          </div>
        </div>
      )}

      {/* Error banner - shown when an action is not allowed */}
      {errorBanner && (
        <div className="error-banner" onClick={() => setErrorBanner(null)}>
          <div className="error-banner__content">
            <span className="error-banner__icon">⚠️</span>
            <span className="error-banner__text">{errorBanner}</span>
          </div>
        </div>
      )}

      {/* Info banner - shown for ON_PLAY effects and other info messages */}
      {infoBanner && (
        <div className="info-banner" onClick={() => setInfoBanner(null)}>
          <div className="info-banner__content">
            <span className="info-banner__icon">⭐</span>
            <span className="info-banner__text">{infoBanner}</span>
          </div>
        </div>
      )}

      {/* Combat modal - shown during Blocker/Counter steps */}
      {showCombatModal && gameState && (
        <CombatModal
          gameState={gameState}
          playerId={playerId}
          cardDefinitions={cardDefinitions}
          isDefender={isDefender}
          pinnedCard={pinnedCard}
          isAttackerUnblockable={isAttackerUnblockable}
          onUseCounter={handleUseCounter}
          onPassCounter={passCounter}
          onSelectBlocker={selectBlocker}
          onPassBlocker={passBlocker}
          onCardHover={handleCardHover}
        />
      )}

      {/* Settings modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isMuted={isMuted}
        onToggleMute={toggleMute}
      />

      {/* Trash preview modal */}
      {trashModalOpen && (
        <div className="trash-modal-overlay" onClick={handleCloseTrashModal}>
          <div className="trash-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trash-modal__header">
              <h2 className="trash-modal__title">
                {trashModalOpen === 'player' ? 'Your Trash' : "Opponent's Trash"}
                {' '}
                ({(trashModalOpen === 'player' ? myPlayer?.trash : opponent?.trash)?.length || 0} cards)
              </h2>
              <span className="trash-modal__hint">Click a card to pin it</span>
              <button className="trash-modal__close" onClick={handleCloseTrashModal}>
                ✕
              </button>
            </div>
            <div className="trash-modal__content">
              {(trashModalOpen === 'player' ? myPlayer?.trash : opponent?.trash)?.map((card) => {
                const cardDef = cardDefinitions.get(card.cardId);
                const isPinned = trashPinnedCardId === card.id;
                return (
                  <div
                    key={card.id}
                    className={`trash-modal__card ${isPinned ? 'trash-modal__card--pinned' : ''}`}
                    onClick={() => handleTrashCardClick(card)}
                    onMouseEnter={() => handleTrashCardHover(card)}
                    onMouseLeave={() => handleTrashCardHover(null)}
                  >
                    <GameCard
                      card={{ ...card, state: CardState.ACTIVE }}
                      cardDef={cardDef}
                      faceUp={true}
                    />
                    {isPinned && <div className="trash-modal__pin-indicator">📌</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {gameOver && (
        <div className="game-over-overlay">
          <div className="game-over__content">
            <h1 className={`game-over__title ${gameOver.winner === playerId ? 'game-over__title--victory' : 'game-over__title--defeat'}`}>
              {gameOver.winner === playerId ? 'Victory!' : 'Defeat'}
            </h1>

            {/* Player Results */}
            <div className="game-over__players">
              <div className={`game-over__player ${gameOver.winner === playerId ? 'game-over__player--winner' : 'game-over__player--loser'}`}>
                <span className="game-over__player-icon">{gameOver.winner === playerId ? '👑' : '💀'}</span>
                <span className="game-over__player-name">{myPlayer?.username || 'You'}</span>
              </div>
              <span className="game-over__vs">vs</span>
              <div className={`game-over__player ${gameOver.winner !== playerId ? 'game-over__player--winner' : 'game-over__player--loser'}`}>
                <span className="game-over__player-icon">{gameOver.winner !== playerId ? '👑' : '💀'}</span>
                <span className="game-over__player-name">{opponent?.username || 'Opponent'}</span>
              </div>
            </div>

            <p className="game-over__reason">{getReasonMessage(gameOver.winner === playerId, gameOver.reason)}</p>

            <button
              className="action-btn action-btn--end"
              onClick={onLeave}
            >
              Return to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameBoard;
