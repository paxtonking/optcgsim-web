import { useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../services/socket';
import { GameState, GameAction, ActionType } from '@optcgsim/shared';

interface UseGameSocketOptions {
  gameId: string;
  playerId: string;
  isAIGame: boolean;
  isSpectator: boolean;
  onStateUpdate: (state: GameState) => void;
  onGameEnd: (winner: string, reason: string) => void;
  onError: (error: string) => void;
}

export interface UseGameSocketReturn {
  connected: boolean;
  sendAction: (action: GameAction) => void;
  keepHand: () => void;
  mulligan: () => void;
  playCard: (cardId: string, zone?: string) => void;
  declareAttack: (attackerId: string, targetId: string) => void;
  endTurn: () => void;
  pass: () => void;
  useCounter: (cardIds: string[]) => void;
  passCounter: () => void;
  activateTrigger: (cardId: string) => void;
  passTrigger: () => void;
  attachDon: (donId: string, targetId: string) => void;
}

export function useGameSocket({
  gameId,
  playerId,
  isAIGame,
  isSpectator,
  onStateUpdate,
  onGameEnd,
  onError
}: UseGameSocketOptions): UseGameSocketReturn {
  const socketRef = useRef(getSocket());
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
    const socket = socketRef.current;
    connectedRef.current = socket.connected;

    // State update handler
    const handleState = (data: { gameState: GameState }) => {
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

    // Request initial state
    if (isSpectator) {
      socket.emit('spectate:join', gameId, (response: { success: boolean; state?: GameState; error?: string }) => {
        if (response.success && response.state) {
          onStateUpdate(response.state);
        } else if (response.error) {
          onError(response.error);
        }
      });
    } else {
      const getStateEvent = isAIGame ? 'ai:getState' : 'game:getState';
      socket.emit(getStateEvent, { gameId });
    }

    // Cleanup
    return () => {
      socket.off('game:state', handleState);
      socket.off('game:action:result', handleActionResult);
      socket.off('game:ended', handleGameEnd);
      socket.off('game:error', handleError);

      if (isSpectator) {
        socket.emit('spectate:leave', gameId);
      }
    };
  }, [gameId, isAIGame, isSpectator, onStateUpdate, onGameEnd, onError]);

  // Action methods
  const keepHand = useCallback(() => {
    sendAction(createAction(ActionType.KEEP_HAND));
  }, [sendAction, createAction]);

  const mulligan = useCallback(() => {
    sendAction(createAction(ActionType.MULLIGAN));
  }, [sendAction, createAction]);

  const playCard = useCallback((cardId: string, zone?: string) => {
    sendAction(createAction(ActionType.PLAY_CARD, { cardId, zone }));
  }, [sendAction, createAction]);

  const declareAttack = useCallback((attackerId: string, targetId: string) => {
    sendAction(createAction(ActionType.DECLARE_ATTACK, { attackerId, targetId }));
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

  return {
    connected: connectedRef.current,
    sendAction,
    keepHand,
    mulligan,
    playCard,
    declareAttack,
    endTurn,
    pass,
    useCounter,
    passCounter,
    activateTrigger,
    passTrigger,
    attachDon
  };
}
