import { useState } from 'react';
import { useDeckStore } from '../stores/deckStore';
import { useCardStore } from '../stores/cardStore';
import { CardDisplay } from './CardDisplay';
import { COLOR_HEX, type CardColor } from '../types/card';

export function DeckPanel() {
  const {
    currentDeck,
    decks,
    createDeck,
    deleteDeck,
    renameDeck,
    selectDeck,
    closeDeck,
    removeCard,
    setCardCount,
    clearDeck,
    getDeckCardCount,
    isValidDeck,
    exportDeck,
    importDeckWithCards,
  } = useDeckStore();

  const { cards } = useCardStore();

  const [newDeckName, setNewDeckName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const validation = isValidDeck();
  const cardCount = getDeckCardCount();

  const handleCreateDeck = () => {
    if (newDeckName.trim()) {
      createDeck(newDeckName.trim());
      setNewDeckName('');
      setIsCreating(false);
    }
  };

  const handleRename = () => {
    if (renameValue.trim() && currentDeck) {
      renameDeck(currentDeck.id, renameValue.trim());
      setIsRenaming(false);
    }
  };

  const handleExport = () => {
    const data = exportDeck();
    navigator.clipboard.writeText(data);
    alert('Deck copied to clipboard!');
  };

  const handleImport = () => {
    if (!importText.trim()) {
      setImportError('Please paste a deck list');
      return;
    }

    // Create a card lookup function
    const cardMap = new Map(cards.map(c => [c.id, c]));
    const cardLookup = (id: string) => cardMap.get(id);

    const result = importDeckWithCards(importText, cardLookup);

    if (result.success) {
      setShowImportModal(false);
      setImportText('');
      setImportError(null);
      if (result.error) {
        // Show warning (some cards not found)
        alert(`Deck imported${result.error}`);
      } else {
        alert('Deck imported successfully!');
      }
    } else {
      setImportError(result.error || 'Failed to import deck');
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setImportText(text);
      setImportError(null);
    } catch {
      setImportError('Failed to read from clipboard. Please paste manually.');
    }
  };

  // Deck selection view
  if (!currentDeck) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 h-full flex flex-col">
        <h2 className="text-xl font-bold text-white mb-4">My Decks</h2>

        {/* Deck list */}
        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {decks.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No decks yet. Create one to get started!</p>
          ) : (
            decks.map(deck => (
              <div
                key={deck.id}
                className="bg-gray-700 rounded p-3 hover:bg-gray-600 cursor-pointer transition-colors"
                onClick={() => selectDeck(deck.id)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-white">{deck.name}</h3>
                    <p className="text-sm text-gray-400">
                      {deck.leader ? deck.leader.name : 'No leader'} • {deck.cards.reduce((s, c) => s + c.count, 0)}/50 cards
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Delete this deck?')) {
                        deleteDeck(deck.id);
                      }
                    }}
                    className="text-gray-400 hover:text-red-500 p-1"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Create new deck */}
        {isCreating ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={newDeckName}
              onChange={(e) => setNewDeckName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateDeck()}
              placeholder="Deck name..."
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              autoFocus
            />
            <button
              onClick={handleCreateDeck}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
            >
              Create
            </button>
            <button
              onClick={() => setIsCreating(false)}
              className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => setIsCreating(true)}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded font-medium"
            >
              + Create New Deck
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded font-medium text-sm"
            >
              Import Deck
            </button>
          </div>
        )}

        {/* Import Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
              <h3 className="text-xl font-bold text-white mb-4">Import Deck</h3>
              <p className="text-gray-400 text-sm mb-4">
                Paste a deck list below. Supports both text format and JSON.
              </p>

              <button
                onClick={handlePasteFromClipboard}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded mb-4"
              >
                Paste from Clipboard
              </button>

              <textarea
                value={importText}
                onChange={(e) => {
                  setImportText(e.target.value);
                  setImportError(null);
                }}
                placeholder={`// Deck Name\n\n// Leader\n1 ST01-001 // Monkey D. Luffy\n\n// Main Deck\n4 ST01-004 // Usopp\n4 ST01-005 // Karoo\n...`}
                className="w-full h-48 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />

              {importError && (
                <p className="text-red-400 text-sm mt-2">{importError}</p>
              )}

              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleImport}
                  disabled={!importText.trim()}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded font-medium disabled:opacity-50"
                >
                  Import
                </button>
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setImportText('');
                    setImportError(null);
                  }}
                  className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-2 rounded font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Deck editor view
  return (
    <div className="bg-gray-800 rounded-lg p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={closeDeck}
          className="text-gray-400 hover:text-white"
        >
          ← Back
        </button>

        {isRenaming ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm"
              autoFocus
            />
            <button onClick={handleRename} className="text-green-500 hover:text-green-400">✓</button>
            <button onClick={() => setIsRenaming(false)} className="text-red-500 hover:text-red-400">✕</button>
          </div>
        ) : (
          <h2
            className="text-xl font-bold text-white cursor-pointer hover:text-gray-300"
            onClick={() => {
              setRenameValue(currentDeck.name);
              setIsRenaming(true);
            }}
          >
            {currentDeck.name}
          </h2>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="text-gray-400 hover:text-white text-sm"
            title="Export deck"
          >
            Export
          </button>
          <button
            onClick={() => confirm('Clear all cards?') && clearDeck()}
            className="text-gray-400 hover:text-red-500 text-sm"
            title="Clear deck"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Leader */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-gray-400 mb-2">Leader</h3>
        {currentDeck.leader ? (
          <div className="flex items-center gap-3 bg-gray-700 rounded p-2">
            <CardDisplay card={currentDeck.leader} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate">{currentDeck.leader.name}</p>
              <div className="flex gap-1 mt-1">
                {currentDeck.leader.colors.map(color => (
                  <span
                    key={color}
                    className="px-1.5 py-0.5 rounded text-xs font-medium text-white"
                    style={{ backgroundColor: COLOR_HEX[color as CardColor] || '#6B7280' }}
                  >
                    {color}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gray-700 rounded p-4 text-center text-gray-400">
            Click on a Leader card to set it
          </div>
        )}
      </div>

      {/* Card count */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-medium text-gray-400">
            Cards ({cardCount}/50)
          </h3>
          <div
            className={`h-2 flex-1 mx-4 rounded-full overflow-hidden bg-gray-700`}
          >
            <div
              className={`h-full transition-all ${
                cardCount === 50 ? 'bg-green-500' : cardCount > 50 ? 'bg-red-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min((cardCount / 50) * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {currentDeck.cards.length === 0 ? (
          <p className="text-gray-400 text-center py-4">
            Click cards to add them to your deck
          </p>
        ) : (
          currentDeck.cards
            .sort((a, b) => (a.card.cost ?? 0) - (b.card.cost ?? 0))
            .map(({ card, count }) => (
              <div
                key={card.id}
                className="flex items-center gap-2 bg-gray-700 rounded p-2 hover:bg-gray-600"
              >
                <CardDisplay card={card} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{card.name}</p>
                  <p className="text-gray-400 text-xs">{card.id}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => removeCard(card.id)}
                    className="w-6 h-6 bg-gray-600 hover:bg-gray-500 rounded flex items-center justify-center text-white"
                  >
                    -
                  </button>
                  <span className="w-6 text-center text-white font-medium">{count}</span>
                  <button
                    onClick={() => setCardCount(card.id, Math.min(count + 1, 4))}
                    disabled={count >= 4}
                    className="w-6 h-6 bg-gray-600 hover:bg-gray-500 rounded flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    +
                  </button>
                </div>
              </div>
            ))
        )}
      </div>

      {/* Validation */}
      {!validation.valid && (
        <div className="mt-4 p-3 bg-red-900/30 border border-red-700 rounded">
          <p className="text-red-400 text-sm font-medium mb-1">Deck Issues:</p>
          <ul className="text-red-300 text-xs space-y-1">
            {validation.errors.map((error, i) => (
              <li key={i}>• {error}</li>
            ))}
          </ul>
        </div>
      )}

      {validation.valid && (
        <div className="mt-4 p-3 bg-green-900/30 border border-green-700 rounded text-center">
          <p className="text-green-400 text-sm font-medium">✓ Deck is valid!</p>
        </div>
      )}
    </div>
  );
}
