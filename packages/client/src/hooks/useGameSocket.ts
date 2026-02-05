import { useEffect, useCallback, useRef } from 'react';
import { connectSocket } from '../services/socket';
import { GameState, GameAction, ActionType } from '@optcgsim/shared';

interface UseGameSocketOptions {
  gameId: string;
  playerId: string;
  isAIGame: boolean;
  onStateUpdate: (state: GameState) => void;
  onGameEnd: (winner: string, reason: string) => void;
  onError: (error: string) => void;
}

export interface UseGameSocketReturn {
  connected: boolean;
  sendAction: (action: GameAction) => void;
  preGameSelect: (cardId: string) => void;
  skipPreGame: () => void;
  keepHand: () => void;
  mulligan: () => void;
  playCard: (cardId: string, zone?: string) => void;
  declareAttack: (attackerId: string, targetId: string, targetType: 'leader' | 'character') => void;
  resolveAttackEffect: (effectId: string, selectedTargets: string[]) => void;
  skipAttackEffect: (effectId: string) => void;
  resolvePlayEffect: (effectId: string, selectedTargets: string[]) => void;
  skipPlayEffect: (effectId: string) => void;
  resolveActivateEffect: (effectId: string, selectedTargets: string[]) => void;
  skipActivateEffect: (effectId: string) => void;
  resolveEventEffect: (effectId: string, selectedTargets: string[]) => void;
  skipEventEffect: (effectId: string) => void;
  resolveCounterEffect: (effectId: string, selectedTargets: string[]) => void;
  skipCounterEffect: (effectId: string) => void;
  resolveDeckReveal: (selectedCardIds: string[]) => void;
  skipDeckReveal: () => void;
  resolveHandSelect: (selectedCardIds: string[]) => void;
  skipHandSelect: () => void;
  resolveFieldSelect: (selectedCardIds: string[]) => void;
  skipFieldSelect: () => void;
  resolveChoice: (optionId: string) => void;
  payAdditionalCost: (costId: string) => void;
  skipAdditionalCost: (costId: string) => void;
  endTurn: () => void;
  pass: () => void;
  useCounter: (cardIds: string[]) => void;
  passCounter: () => void;
  activateTrigger: (cardId: string) => void;
  passTrigger: () => void;
  attachDon: (donId: string, targetId: string) => void;
  selectBlocker: (blockerId: string) => void;
  passBlocker: () => void;
  activateAbility: (cardId: string, targets?: string[]) => void;
}

export function useGameSocket({
  gameId,
  playerId,
  isAIGame,
  onStateUpdate,
  onGameEnd,
  onError
}: UseGameSocketOptions): UseGameSocketReturn {
  const socketRef = useRef(connectSocket());
  const connectedRef = useRef(false);

  const generateActionId = useCallback(() => {
    return `${playerId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, [playerId]);

  const sendAction = useCallback((action: GameAction) => {
    if (!gameId) return;
    const actionEvent = isAIGame ? 'ai:action' : 'game:action';
    socketRef.current.emit(actionEvent, {
      gameId,
      action
    });
  }, [gameId, isAIGame]);

  const createAction = useCallback((type: ActionType, data: any = {}): GameAction => {
    return {
      id: generateActionId(),
      type,
      playerId,
      timestamp: Date.now(),
      data
    };
  }, [generateActionId, playerId]);

  // Socket setup
  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;
    connectedRef.current = socket.connected;

    const getStateEvent = isAIGame ? 'ai:getState' : 'game:getState';
    const requestState = () => {
      socket.emit(getStateEvent, { gameId });
    };

    // State update handler
    const handleState = (data: { gameState: GameState }) => {
      console.log('[useGameSocket] Received game:state - Phase:', data.gameState?.phase, 'Turn:', data.gameState?.turn);
      onStateUpdate(data.gameState);
    };

    // Action result handler
    const handleActionResult = (data: { success: boolean; error?: string }) => {
      if (!data.success && data.error) {
        console.error('Action failed:', data.error);
        onError(data.error);
      }
    };

    // Game end handler
    const handleGameEnd = (data: { winner: string; reason: string }) => {
      onGameEnd(data.winner, data.reason);
    };

    // Error handler
    const handleError = (data: { error: string }) => {
      console.error('Game error:', data.error);
      onError(data.error);
    };

    // Set up listeners
    socket.on('game:state', handleState);
    socket.on('game:action:result', handleActionResult);
    socket.on('game:ended', handleGameEnd);
    socket.on('game:error', handleError);
    socket.on('connect', requestState);

    // Request initial state
    requestState();

    // Cleanup
    return () => {
      socket.off('game:state', handleState);
      socket.off('game:action:result', handleActionResult);
      socket.off('game:ended', handleGameEnd);
      socket.off('game:error', handleError);
      socket.off('connect', requestState);
    };
  }, [gameId, isAIGame, onStateUpdate, onGameEnd, onError]);

  // Action methods
  const preGameSelect = useCallback((cardId: string) => {
    sendAction(createAction(ActionType.PRE_GAME_SELECT, { cardId }));
  }, [sendAction, createAction]);

  const skipPreGame = useCallback(() => {
    sendAction(createAction(ActionType.SKIP_PRE_GAME));
  }, [sendAction, createAction]);

  const keepHand = useCallback(() => {
    sendAction(createAction(ActionType.KEEP_HAND));
  }, [sendAction, createAction]);

  const mulligan = useCallback(() => {
    sendAction(createAction(ActionType.MULLIGAN));
  }, [sendAction, createAction]);

  const playCard = useCallback((cardId: string, zone?: string) => {
    sendAction(createAction(ActionType.PLAY_CARD, { cardId, zone }));
  }, [sendAction, createAction]);

  const declareAttack = useCallback((attackerId: string, targetId: string, targetType: 'leader' | 'character') => {
    const action = createAction(ActionType.DECLARE_ATTACK, { attackerId, targetId, targetType });
    console.log('[DEBUG ATTACK] Sending declareAttack action:', action);
    sendAction(action);
  }, [sendAction, createAction]);

  const resolveAttackEffect = useCallback((effectId: string, selectedTargets: string[]) => {
    sendAction(createAction(ActionType.RESOLVE_ATTACK_EFFECT, { effectId, selectedTargets }));
  }, [sendAction, createAction]);

  const skipAttackEffect = useCallback((effectId: string) => {
    sendAction(createAction(ActionType.SKIP_ATTACK_EFFECT, { effectId }));
  }, [sendAction, createAction]);

  const resolvePlayEffect = useCallback((effectId: string, selectedTargets: string[]) => {
    sendAction(createAction(ActionType.RESOLVE_PLAY_EFFECT, { effectId, selectedTargets }));
  }, [sendAction, createAction]);

  const skipPlayEffect = useCallback((effectId: string) => {
    sendAction(createAction(ActionType.SKIP_PLAY_EFFECT, { effectId }));
  }, [sendAction, createAction]);

  const resolveActivateEffect = useCallback((effectId: string, selectedTargets: string[]) => {
    sendAction(createAction(ActionType.RESOLVE_ACTIVATE_EFFECT, { effectId, selectedTargets }));
  }, [sendAction, createAction]);

  const skipActivateEffect = useCallback((effectId: string) => {
    sendAction(createAction(ActionType.SKIP_ACTIVATE_EFFECT, { effectId }));
  }, [sendAction, createAction]);

  const resolveEventEffect = useCallback((effectId: string, selectedTargets: string[]) => {
    sendAction(createAction(ActionType.RESOLVE_EVENT_EFFECT, { effectId, selectedTargets }));
  }, [sendAction, createAction]);

  const skipEventEffect = useCallback((effectId: string) => {
    sendAction(createAction(ActionType.SKIP_EVENT_EFFECT, { effectId }));
  }, [sendAction, createAction]);

  const resolveCounterEffect = useCallback((effectId: string, selectedTargets: string[]) => {
    sendAction(createAction(ActionType.RESOLVE_COUNTER_EFFECT, { effectId, selectedTargets }));
  }, [sendAction, createAction]);

  const skipCounterEffect = useCallback((effectId: string) => {
    sendAction(createAction(ActionType.SKIP_COUNTER_EFFECT, { effectId }));
  }, [sendAction, createAction]);

  const resolveDeckReveal = useCallback((selectedCardIds: string[]) => {
    sendAction(createAction(ActionType.RESOLVE_DECK_REVEAL, { selectedCardIds }));
  }, [sendAction, createAction]);

  const skipDeckReveal = useCallback(() => {
    sendAction(createAction(ActionType.SKIP_DECK_REVEAL, {}));
  }, [sendAction, createAction]);

  const resolveHandSelect = useCallback((selectedCardIds: string[]) => {
    sendAction(createAction(ActionType.RESOLVE_HAND_SELECT, { selectedCardIds }));
  }, [sendAction, createAction]);

  const skipHandSelect = useCallback(() => {
    sendAction(createAction(ActionType.SKIP_HAND_SELECT, {}));
  }, [sendAction, createAction]);

  const resolveFieldSelect = useCallback((selectedCardIds: string[]) => {
    sendAction(createAction(ActionType.RESOLVE_FIELD_SELECT, { selectedCardIds }));
  }, [sendAction, createAction]);

  const skipFieldSelect = useCallback(() => {
    sendAction(createAction(ActionType.SKIP_FIELD_SELECT, {}));
  }, [sendAction, createAction]);

  const resolveChoice = useCallback((optionId: string) => {
    sendAction(createAction(ActionType.RESOLVE_CHOICE, { optionId }));
  }, [sendAction, createAction]);

  const payAdditionalCost = useCallback((costId: string) => {
    sendAction(createAction(ActionType.PAY_ADDITIONAL_COST, { costId }));
  }, [sendAction, createAction]);

  const skipAdditionalCost = useCallback((costId: string) => {
    sendAction(createAction(ActionType.SKIP_ADDITIONAL_COST, { costId }));
  }, [sendAction, createAction]);

  const endTurn = useCallback(() => {
    sendAction(createAction(ActionType.END_TURN));
  }, [sendAction, createAction]);

  const pass = useCallback(() => {
    sendAction(createAction(ActionType.PASS_PRIORITY));
  }, [sendAction, createAction]);

  const useCounter = useCallback((cardIds: string[]) => {
    sendAction(createAction(ActionType.USE_COUNTER, { cardIds }));
  }, [sendAction, createAction]);

  const passCounter = useCallback(() => {
    sendAction(createAction(ActionType.PASS_COUNTER));
  }, [sendAction, createAction]);

  const activateTrigger = useCallback((cardId: string) => {
    sendAction(createAction(ActionType.TRIGGER_LIFE, { cardId, activate: true }));
  }, [sendAction, createAction]);

  const passTrigger = useCallback(() => {
    sendAction(createAction(ActionType.TRIGGER_LIFE, { activate: false }));
  }, [sendAction, createAction]);

  const attachDon = useCallback((donId: string, targetId: string) => {
    sendAction(createAction(ActionType.ATTACH_DON, { donId, targetId }));
  }, [sendAction, createAction]);

  const selectBlocker = useCallback((blockerId: string) => {
    sendAction(createAction(ActionType.SELECT_BLOCKER, { blockerId }));
  }, [sendAction, createAction]);

  const passBlocker = useCallback(() => {
    sendAction(createAction(ActionType.PASS_PRIORITY));
  }, [sendAction, createAction]);

  const activateAbility = useCallback((cardId: string, targets?: string[]) => {
    sendAction(createAction(ActionType.ACTIVATE_ABILITY, { cardId, targets }));
  }, [sendAction, createAction]);

  return {
    connected: connectedRef.current,
    sendAction,
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
    skipCounterEffect,
    resolveDeckReveal,
    skipDeckReveal,
    resolveHandSelect,
    skipHandSelect,
    resolveFieldSelect,
    skipFieldSelect,
    resolveChoice,
    payAdditionalCost,
    skipAdditionalCost,
    endTurn,
    pass,
    useCounter,
    passCounter,
    activateTrigger,
    passTrigger,
    attachDon,
    selectBlocker,
    passBlocker,
    activateAbility
  };
}
