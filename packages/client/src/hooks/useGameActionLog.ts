import { useState, useCallback, useRef, useEffect } from 'react';
import { GameState, PlayerState, GamePhase } from '@optcgsim/shared';
import { GameLogEntry } from '../components/game/GameLog';

export const PHASE_LOG_LABELS: Partial<Record<GamePhase, string>> = {
  [GamePhase.REFRESH_PHASE]: 'Refresh Phase',
  [GamePhase.DRAW_PHASE]: 'Draw Phase',
  [GamePhase.DON_PHASE]: 'DON Phase',
  [GamePhase.MAIN_PHASE]: 'Main Phase',
  [GamePhase.BLOCKER_STEP]: 'Blocker Step',
  [GamePhase.COUNTER_STEP]: 'Counter Step',
  [GamePhase.TRIGGER_STEP]: 'Trigger Step',
  [GamePhase.END_PHASE]: 'End Phase',
};

interface PrevState {
  myHandCount: number;
  oppHandCount: number;
  myFieldCount: number;
  oppFieldCount: number;
  myTrashCount: number;
  oppTrashCount: number;
  myLifeCount: number;
  oppLifeCount: number;
  myDonCount: number;
  oppDonCount: number;
  phase: GamePhase | null;
  turn: number;
}

interface UseGameActionLogParams {
  gameState: GameState | null;
  myPlayer: PlayerState | null;
  opponent: PlayerState | null;
  phase: GamePhase | null;
}

export function useGameActionLog({ gameState, myPlayer, opponent, phase }: UseGameActionLogParams): GameLogEntry[] {
  const [gameLogEntries, setGameLogEntries] = useState<GameLogEntry[]>([]);
  const gameLogIdRef = useRef(0);

  // Track current turn in a ref so addLogEntry stays stable
  const currentTurnRef = useRef(0);
  currentTurnRef.current = gameState?.turn || 0;

  // Helper to push game log entries
  const addLogEntry = useCallback((action: string, type: GameLogEntry['type'], player: 'you' | 'opponent' | 'system' = 'system') => {
    setGameLogEntries(prev => {
      const entry: GameLogEntry = {
        id: `log-${++gameLogIdRef.current}`,
        turn: currentTurnRef.current,
        player,
        action,
        type,
        timestamp: Date.now(),
      };
      const updated = [...prev, entry];
      // Keep last 100 entries
      return updated.length > 100 ? updated.slice(-100) : updated;
    });
  }, []);

  // Game action logging from state changes
  const prevStateRef = useRef<PrevState | null>(null);

  useEffect(() => {
    if (!gameState || !myPlayer || !opponent) return;

    const current: PrevState = {
      myHandCount: myPlayer.hand.length,
      oppHandCount: opponent.hand.length,
      myFieldCount: myPlayer.field.length,
      oppFieldCount: opponent.field.length,
      myTrashCount: myPlayer.trash.length,
      oppTrashCount: opponent.trash.length,
      myLifeCount: myPlayer.lifeCards.length,
      oppLifeCount: opponent.lifeCards.length,
      myDonCount: myPlayer.donField.length,
      oppDonCount: opponent.donField.length,
      phase: phase || null,
      turn: gameState.turn || 0,
    };

    const prev = prevStateRef.current;
    if (prev) {
      // Detect draws
      const myDrawn = current.myHandCount - prev.myHandCount;
      if (myDrawn > 0 && current.myFieldCount <= prev.myFieldCount) {
        addLogEntry(`Drew ${myDrawn} card${myDrawn > 1 ? 's' : ''}`, 'draw', 'you');
      }
      const oppDrawn = current.oppHandCount - prev.oppHandCount;
      if (oppDrawn > 0 && current.oppFieldCount <= prev.oppFieldCount) {
        addLogEntry(`Drew ${oppDrawn} card${oppDrawn > 1 ? 's' : ''}`, 'draw', 'opponent');
      }

      // Detect card plays (hand decreases, field increases)
      if (current.myFieldCount > prev.myFieldCount && current.myHandCount < prev.myHandCount) {
        addLogEntry(`Played a character`, 'play', 'you');
      }
      if (current.oppFieldCount > prev.oppFieldCount && current.oppHandCount < prev.oppHandCount) {
        addLogEntry(`Played a character`, 'play', 'opponent');
      }

      // Detect KOs (field decreases, trash increases)
      if (current.myFieldCount < prev.myFieldCount && current.myTrashCount > prev.myTrashCount) {
        addLogEntry(`Character KO'd`, 'ko', 'you');
      }
      if (current.oppFieldCount < prev.oppFieldCount && current.oppTrashCount > prev.oppTrashCount) {
        addLogEntry(`Character KO'd`, 'ko', 'opponent');
      }

      // Detect life damage
      if (current.myLifeCount < prev.myLifeCount) {
        const dmg = prev.myLifeCount - current.myLifeCount;
        addLogEntry(`Lost ${dmg} life`, 'damage', 'you');
      }
      if (current.oppLifeCount < prev.oppLifeCount) {
        const dmg = prev.oppLifeCount - current.oppLifeCount;
        addLogEntry(`Lost ${dmg} life`, 'damage', 'opponent');
      }

      // Detect DON gain
      if (current.myDonCount > prev.myDonCount) {
        addLogEntry(`Gained ${current.myDonCount - prev.myDonCount} DON`, 'don', 'you');
      }
      if (current.oppDonCount > prev.oppDonCount) {
        addLogEntry(`Gained ${current.oppDonCount - prev.oppDonCount} DON`, 'don', 'opponent');
      }

      // Log phase changes
      if (current.phase !== prev.phase) {
        const label = current.phase ? PHASE_LOG_LABELS[current.phase] : null;
        if (label) {
          addLogEntry(label, 'phase', 'system');
        }
      }

      // Turn change
      if (current.turn > prev.turn) {
        addLogEntry(`Turn ${current.turn}`, 'phase', 'system');
      }
    }

    prevStateRef.current = current;
  }, [gameState, myPlayer, opponent, phase, addLogEntry]);

  return gameLogEntries;
}
