import { useState, useCallback, useMemo, useEffect } from 'react';
import { GameState, GameCard, PlayerState, GamePhase } from '@optcgsim/shared';
import { useCardStore } from '../stores/cardStore';

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
  attribute?: string | null;
  effect?: string | null;
  trigger?: string | null;
  imageUrl?: string;
  images?: {
    small?: string;
    large?: string;
  };
  keywords?: string[];
  traits?: string[];
}

// Keyword detection patterns (same as server-side)
const KEYWORD_PATTERNS: { pattern: RegExp; keyword: string }[] = [
  { pattern: /\[Rush\]/i, keyword: 'Rush' },
  { pattern: /\[Blocker\]/i, keyword: 'Blocker' },
  { pattern: /\[Banish\]/i, keyword: 'Banish' },
  { pattern: /\[Double Attack\]/i, keyword: 'Double Attack' },
];

// Detect keywords from effect text
function detectKeywords(effectText: string | null | undefined): string[] {
  if (!effectText) return [];
  const keywords: string[] = [];
  for (const { pattern, keyword } of KEYWORD_PATTERNS) {
    if (pattern.test(effectText)) {
      keywords.push(keyword);
    }
  }
  return keywords;
}

export interface UseGameStateReturn {
  gameState: GameState | null;
  playerId: string | null;
  isMyTurn: boolean;
  myPlayer: PlayerState | null;
  opponent: PlayerState | null;
  phase: GamePhase | null;
  turn: number;
  selectedCard: GameCard | null;
  hoveredCard: GameCard | null;
  cardDefinitions: Map<string, CardDefinition>;
  setGameState: (state: GameState) => void;
  setSelectedCard: (card: GameCard | null) => void;
  setHoveredCard: (card: GameCard | null) => void;
  getCardDefinition: (cardId: string) => CardDefinition | undefined;
  getCardImageUrl: (cardId: string) => string;
  canPlayCard: (card: GameCard) => boolean;
  isValidAttackTarget: (card: GameCard) => boolean;
  getTargetZone: (cardId: string) => string;
}

export function useGameState(playerId: string | null): UseGameStateReturn {
  const [gameState, setGameStateInternal] = useState<GameState | null>(null);
  const [selectedCard, setSelectedCard] = useState<GameCard | null>(null);
  const [hoveredCard, setHoveredCard] = useState<GameCard | null>(null);

  // Use shared card store for caching
  const { cards: cardArray, loadCards } = useCardStore();

  // Load cards from shared store
  useEffect(() => {
    loadCards();
  }, [loadCards]);

  // Convert card array to map with keyword detection
  const cardDefinitions = useMemo(() => {
    const defMap = new Map<string, CardDefinition>();
    cardArray.forEach(card => {
      // Detect keywords from effect text (same as server-side CardLoaderService)
      const keywords = detectKeywords(card.effect);
      defMap.set(card.id, { ...card, keywords });
    });
    return defMap;
  }, [cardArray]);

  const setGameState = useCallback((state: GameState) => {
    setGameStateInternal(state);
  }, []);

  const myPlayer = useMemo(() => {
    if (!gameState || !playerId) return null;
    return gameState.players[playerId] || null;
  }, [gameState, playerId]);

  const opponent = useMemo(() => {
    if (!gameState || !playerId) return null;
    const opponentId = Object.keys(gameState.players).find(id => id !== playerId);
    return opponentId ? gameState.players[opponentId] : null;
  }, [gameState, playerId]);

  const isMyTurn = useMemo(() => {
    if (!gameState || !playerId) return false;
    return gameState.activePlayerId === playerId;
  }, [gameState, playerId]);

  const phase = useMemo(() => gameState?.phase || null, [gameState]);
  const turn = useMemo(() => gameState?.turn || 0, [gameState]);

  const getCardDefinition = useCallback((cardId: string) => {
    return cardDefinitions.get(cardId);
  }, [cardDefinitions]);

  const getCardImageUrl = useCallback((cardId: string) => {
    const def = cardDefinitions.get(cardId);
    // Use API URL from environment if set (for production where frontend and backend are separate)
    const apiBase = import.meta.env.VITE_API_URL || '';
    if (def?.imageUrl) {
      // Use proxy to avoid CORS - extract filename from URL
      const filename = def.imageUrl.split('/').pop();
      // Use different proxy based on the source domain
      if (def.imageUrl.includes('onepiece-cardgame.com')) {
        return `${apiBase}/api/images/official/${filename}`;
      }
      return `${apiBase}/api/images/cards/${filename}`;
    }
    return `${apiBase}/api/images/cards/${cardId}.png`;
  }, [cardDefinitions]);

  const canPlayCard = useCallback((card: GameCard): boolean => {
    if (!gameState || !myPlayer || !isMyTurn) return false;
    if (phase !== GamePhase.MAIN_PHASE) return false;

    const def = cardDefinitions.get(card.cardId);
    if (!def) return false;

    // Cards with null/undefined cost (like some leaders) can't be played from hand
    if (def.cost === null || def.cost === undefined) return false;

    // Check if player has enough active DON to pay the cost
    const activeDonCount = myPlayer.donField.filter(don => don.state === 'ACTIVE').length;
    return activeDonCount >= def.cost;
  }, [gameState, myPlayer, isMyTurn, phase, cardDefinitions]);

  // Determine the target zone based on card type
  const getTargetZone = useCallback((cardId: string): string => {
    const def = cardDefinitions.get(cardId);
    if (def?.type === 'STAGE') return 'STAGE';
    if (def?.type === 'EVENT') return 'EVENT'; // Events go to trash after effect resolution
    return 'FIELD';
  }, [cardDefinitions]);

  const isValidAttackTarget = useCallback((card: GameCard): boolean => {
    if (!gameState || !opponent || !isMyTurn) return false;
    if (phase !== GamePhase.MAIN_PHASE) return false;
    if (!gameState.currentCombat) return false;

    // Leader is always a valid target
    if (card.id === opponent.leaderCard?.id) return true;

    // Rested characters are valid targets
    const isRested = card.state === 'RESTED';
    const isOpponentCard = card.owner !== playerId;
    return isRested && isOpponentCard;
  }, [gameState, opponent, isMyTurn, phase, playerId]);

  return {
    gameState,
    playerId,
    isMyTurn,
    myPlayer,
    opponent,
    phase,
    turn,
    selectedCard,
    hoveredCard,
    cardDefinitions,
    setGameState,
    setSelectedCard,
    setHoveredCard,
    getCardDefinition,
    getCardImageUrl,
    canPlayCard,
    isValidAttackTarget,
    getTargetZone
  };
}
