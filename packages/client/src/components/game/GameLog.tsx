import React, { useEffect, useMemo, useRef, useState } from 'react';
import './GameLog.css';

export interface GameLogEntry {
  id: string;
  turn: number;
  player: 'you' | 'opponent' | 'system';
  action: string;
  type: 'draw' | 'play' | 'attack' | 'ko' | 'don' | 'counter' | 'block' | 'trigger' | 'effect' | 'phase' | 'damage' | 'system';
  timestamp: number;
}

interface GameLogProps {
  entries: GameLogEntry[];
  maxVisible?: number;
  onClear?: () => void;
}

const TYPE_ICONS: Record<GameLogEntry['type'], string> = {
  draw: '+',
  play: '\u25B6',
  attack: '\u2694',
  ko: '\u2715',
  don: '!',
  counter: '\u25C6',
  block: '\u25A0',
  trigger: '\u2605',
  effect: '\u2726',
  phase: '\u25CB',
  damage: '\u2661',
  system: '\u2022',
};

export const GameLog: React.FC<GameLogProps> = ({
  entries,
  maxVisible = 50,
  onClear,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const entriesContainerRef = useRef<HTMLDivElement>(null);

  const visibleEntries = useMemo(() => entries.slice(-maxVisible), [entries, maxVisible]);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (!collapsed && scrollAnchorRef.current) {
      scrollAnchorRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries.length, collapsed]);

  // Group entries by turn to insert separators
  const renderedEntries = useMemo(() => {
    if (visibleEntries.length === 0) {
      return <div className="game-log__empty">No actions yet</div>;
    }

    const elements: React.ReactNode[] = [];
    let lastTurn: number | null = null;

    for (const entry of visibleEntries) {
      // Insert turn separator when turn changes
      if (entry.turn !== lastTurn) {
        elements.push(
          <div key={`turn-sep-${entry.turn}`} className="game-log__turn-separator">
            <span className="game-log__turn-separator-line" />
            <span className="game-log__turn-separator-label">Turn {entry.turn}</span>
            <span className="game-log__turn-separator-line" />
          </div>
        );
        lastTurn = entry.turn;
      }

      elements.push(
        <div key={entry.id} className="game-log__entry">
          <span className="game-log__turn-badge">{entry.turn}</span>
          <span className={`game-log__type-icon game-log__type-icon--${entry.type}`}>
            {TYPE_ICONS[entry.type]}
          </span>
          <span className={`game-log__action-text game-log__action-text--${entry.player}`}>
            {entry.action}
          </span>
        </div>
      );
    }

    return elements;
  }, [visibleEntries]);

  const handleHeaderClick = () => {
    setCollapsed((prev) => !prev);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClear) {
      onClear();
    }
  };

  return (
    <div className="game-log">
      <div className="game-log__header" onClick={handleHeaderClick}>
        <span className="game-log__title">Game Log</span>
        <div className="game-log__header-actions">
          {onClear && !collapsed && entries.length > 0 && (
            <button className="game-log__clear-btn" onClick={handleClear}>
              Clear
            </button>
          )}
          <span
            className={`game-log__chevron${collapsed ? ' game-log__chevron--collapsed' : ''}`}
          >
            {'\u25BC'}
          </span>
        </div>
      </div>
      {!collapsed && (
        <div className="game-log__entries" ref={entriesContainerRef}>
          {renderedEntries}
          <div className="game-log__scroll-anchor" ref={scrollAnchorRef} />
        </div>
      )}
    </div>
  );
};
