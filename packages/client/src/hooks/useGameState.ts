import { useState, useCallback, useMemo, useEffect } from 'react';
import { GameState, GameCard, PlayerState, GamePhase } from '@optcgsim/shared';

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
}

export function useGameState(playerId: string | null): UseGameStateReturn {
  const [gameState, setGameStateInternal] = useState<GameState | null>(null);
  const [selectedCard, setSelectedCard] = useState<GameCard | null>(null);
  const [hoveredCard, setHoveredCard] = useState<GameCard | null>(null);
  const [cardDefinitions, setCardDefinitions] = useState<Map<string, CardDefinition>>(new Map());

  // Load card definitions on mount
  useEffect(() => {
    fetch('/data/cards.json')
      .then(res => res.json())
      .then((cards: CardDefinition[]) => {
        const defMap = new Map<string, CardDefinition>();
        cards.forEach(card => defMap.set(card.id, card));
        setCardDefinitions(defMap);
      })
      .catch(err => console.error('Failed to load card definitions:', err));
  }, []);

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
    if (def?.imageUrl) {
      // Use proxy to avoid CORS - extract filename from URL
      const filename = def.imageUrl.split('/').pop();
      // Use different proxy based on the source domain
      if (def.imageUrl.includes('onepiece-cardgame.com')) {
        return `/api/images/official/${filename}`;
      }
      return `/api/images/cards/${filename}`;
    }
    return `/api/images/cards/${cardId}.png`;
  }, [cardDefinitions]);

  const canPlayCard = useCallback((card: GameCard): boolean => {
    if (!gameState || !myPlayer || !isMyTurn) return false;
    if (phase !== GamePhase.MAIN_PHASE) return false;

    const def = cardDefinitions.get(card.cardId);
    if (!def || !def.cost) return false;

    // Check if player has enough DON
    return myPlayer.donField.length >= def.cost;
  }, [gameState, myPlayer, isMyTurn, phase, cardDefinitions]);

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
    isValidAttackTarget
  };
}
