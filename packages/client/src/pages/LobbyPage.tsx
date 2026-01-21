import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useDeckStore } from '../stores/deckStore';
import { useLobbyStore, type AIDifficulty } from '../stores/lobbyStore';
import { CardDisplay } from '../components/CardDisplay';

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function DeckSelector() {
  const { decks } = useDeckStore();
  const { selectedDeckId, setSelectedDeck } = useLobbyStore();

  const validDecks = decks.filter(deck => {
    const cardCount = deck.cards.reduce((s, c) => s + c.count, 0);
    return deck.leader && cardCount === 50;
  });

  if (validDecks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {validDecks.map(deck => (
        <button
          key={deck.id}
          onClick={() => setSelectedDeck(deck.id)}
          className={`
            w-full flex items-center gap-3 p-3 rounded-lg transition-all
            ${selectedDeckId === deck.id
              ? 'bg-red-600/30 border-2 border-red-500'
              : 'bg-gray-700 hover:bg-gray-600 border-2 border-transparent'}
          `}
        >
          {deck.leader && (
            <CardDisplay card={deck.leader} size="sm" />
          )}
          <div className="flex-1 text-left">
            <p className="font-medium text-white">{deck.name}</p>
            <p className="text-sm text-gray-400">
              {deck.leader?.name || 'No leader'}
            </p>
          </div>
          {selectedDeckId === deck.id && (
            <span className="text-green-400">&#10003;</span>
          )}
        </button>
      ))}
    </div>
  );
}

function LobbyRoom() {
  const { user } = useAuthStore();
  const {
    lobby,
    lobbyStatus,
    leaveLobby,
    setReady,
    startGame,
  } = useLobbyStore();

  if (!lobby) return null;

  const isHost = lobby.hostId === user?.id;
  const currentPlayer = lobby.players.find(p => p.id === user?.id);
  const otherPlayer = lobby.players.find(p => p.id !== user?.id);
  const allReady = lobby.players.every(p => p.isReady);
  const canStart = isHost && allReady && lobby.players.length === 2;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Lobby</h2>
          <div className="flex items-center gap-4">
            <div className="bg-gray-700 px-4 py-2 rounded-lg">
              <span className="text-gray-400 text-sm">Room Code:</span>
              <span className="text-white font-mono text-lg ml-2">{lobby.code}</span>
            </div>
            <button
              onClick={leaveLobby}
              className="text-gray-400 hover:text-red-500"
            >
              Leave
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Player 1 */}
          <div className={`
            bg-gray-700 rounded-lg p-4 border-2
            ${currentPlayer?.isReady ? 'border-green-500' : 'border-gray-600'}
          `}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-medium">{currentPlayer?.username}</span>
              {currentPlayer?.isReady && (
                <span className="text-green-400 text-sm">Ready</span>
              )}
            </div>
            {currentPlayer?.deck && (
              <p className="text-gray-400 text-sm">{currentPlayer.deck.name}</p>
            )}
            {isHost && (
              <span className="text-yellow-400 text-xs">Host</span>
            )}
          </div>

          {/* Player 2 */}
          <div className={`
            bg-gray-700 rounded-lg p-4 border-2
            ${otherPlayer?.isReady ? 'border-green-500' : 'border-gray-600'}
          `}>
            {otherPlayer ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white font-medium">{otherPlayer.username}</span>
                  {otherPlayer.isReady && (
                    <span className="text-green-400 text-sm">Ready</span>
                  )}
                </div>
                {otherPlayer.deck && (
                  <p className="text-gray-400 text-sm">{otherPlayer.deck.name}</p>
                )}
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-400">Waiting for opponent...</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => setReady(!currentPlayer?.isReady)}
            className={`
              flex-1 py-3 rounded-lg font-medium transition-colors
              ${currentPlayer?.isReady
                ? 'bg-gray-600 hover:bg-gray-500 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'}
            `}
          >
            {currentPlayer?.isReady ? 'Not Ready' : 'Ready'}
          </button>

          {isHost && (
            <button
              onClick={startGame}
              disabled={!canStart}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {lobbyStatus === 'starting' ? 'Starting...' : 'Start Game'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AIPanel() {
  const navigate = useNavigate();
  const {
    aiGameStatus,
    aiGameId,
    aiDifficulty,
    aiError,
    selectedDeckId,
    startAIGame,
  } = useLobbyStore();

  // Compute disabled state before any narrowing
  const isStarting = aiGameStatus === 'starting';
  const isDisabled = !selectedDeckId || isStarting;

  // Navigate to game when AI game starts
  useEffect(() => {
    if (aiGameStatus === 'playing' && aiGameId) {
      navigate(`/game/${aiGameId}?ai=true`);
    }
  }, [aiGameStatus, aiGameId, navigate]);

  const handleStartAI = (difficulty: AIDifficulty) => {
    startAIGame(difficulty);
  };

  const getDifficultyLabel = (diff: AIDifficulty) => {
    switch (diff) {
      case 'basic': return 'Easy';
      case 'medium': return 'Medium';
      case 'hard': return 'Hard';
    }
  };

  if (isStarting) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 text-center">
        <div className="animate-pulse mb-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-blue-600/30 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-blue-600/50 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-blue-600"></div>
            </div>
          </div>
        </div>
        <h3 className="text-xl font-medium text-white mb-2">
          Starting {aiDifficulty ? getDifficultyLabel(aiDifficulty) : ''} AI Game...
        </h3>
        <p className="text-gray-400">Preparing your opponent</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Practice vs AI</h2>
      <p className="text-gray-400 mb-6">
        Practice your deck against an AI opponent. No ranking impact.
      </p>
      {aiError && (
        <p className="text-red-400 text-sm mb-4">{aiError}</p>
      )}
      <div className="flex gap-4">
        <button
          onClick={() => handleStartAI('basic')}
          disabled={isDisabled}
          className="flex-1 bg-green-700 hover:bg-green-600 text-white py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Easy AI
        </button>
        <button
          onClick={() => handleStartAI('medium')}
          disabled={isDisabled}
          className="flex-1 bg-yellow-700 hover:bg-yellow-600 text-white py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Medium AI
        </button>
        <button
          onClick={() => handleStartAI('hard')}
          disabled={isDisabled}
          className="flex-1 bg-red-700 hover:bg-red-600 text-white py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Hard AI
        </button>
      </div>
    </div>
  );
}

function QueuePanel() {
  const {
    queueStatus,
    queueTime,
    queueError,
    joinQueue,
    leaveQueue,
    selectedDeckId,
  } = useLobbyStore();

  if (queueStatus === 'searching') {
    return (
      <div className="bg-gray-800 rounded-lg p-6 text-center">
        <div className="animate-pulse mb-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-600/30 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-red-600/50 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-red-600"></div>
            </div>
          </div>
        </div>
        <h3 className="text-xl font-medium text-white mb-2">Searching for opponent...</h3>
        <p className="text-gray-400 mb-4">Time: {formatTime(queueTime)}</p>
        <button
          onClick={leaveQueue}
          className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (queueStatus === 'matched') {
    return (
      <div className="bg-gray-800 rounded-lg p-6 text-center">
        <div className="text-green-400 text-4xl mb-4">&#10003;</div>
        <h3 className="text-xl font-medium text-white mb-2">Match Found!</h3>
        <p className="text-gray-400">Starting game...</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Quick Match</h2>
      <p className="text-gray-400 mb-6">
        Find a ranked match against a player of similar skill level.
      </p>
      {queueError && (
        <p className="text-red-400 text-sm mb-4">{queueError}</p>
      )}
      <button
        onClick={joinQueue}
        disabled={!selectedDeckId}
        className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Find Match
      </button>
    </div>
  );
}

export default function LobbyPage() {
  const { isAuthenticated } = useAuthStore();
  const { decks } = useDeckStore();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const {
    lobby,
    lobbyStatus,
    lobbyError,
    selectedDeckId,
    createLobby,
    joinLobby,
  } = useLobbyStore();

  // Count valid decks
  const validDecks = decks.filter(deck => {
    const cardCount = deck.cards.reduce((s, c) => s + c.count, 0);
    return deck.leader && cardCount === 50;
  });

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-bold mb-4">Login Required</h1>
        <p className="text-gray-400 mb-8">
          You need to be logged in to play matches.
        </p>
        <button
          onClick={() => navigate('/login')}
          className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium"
        >
          Login
        </button>
      </div>
    );
  }

  // Show lobby room if in a lobby
  if (lobby && lobbyStatus !== 'idle') {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <LobbyRoom />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Play</h1>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left column - Deck selection */}
        <div className="lg:col-span-1">
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Select Deck</h2>

            {validDecks.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 mb-4">
                  {decks.length === 0
                    ? "You don't have any decks yet."
                    : "You don't have any valid decks. Decks must have a leader and 50 cards."}
                </p>
                <button
                  onClick={() => navigate('/decks')}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
                >
                  {decks.length === 0 ? 'Create a Deck' : 'Edit Decks'}
                </button>
              </div>
            ) : (
              <>
                <DeckSelector />
                <p className="text-gray-500 text-xs mt-4">
                  {validDecks.length} valid deck{validDecks.length !== 1 ? 's' : ''}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Right column - Play options */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Match */}
          <QueuePanel />

          {/* Create & Join Lobby */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Create Lobby */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Create Lobby</h2>
              <p className="text-gray-400 mb-6">
                Create a private room and invite a friend to play.
              </p>
              {lobbyError && lobbyStatus === 'creating' && (
                <p className="text-red-400 text-sm mb-4">{lobbyError}</p>
              )}
              <button
                onClick={() => createLobby(false)}
                disabled={!selectedDeckId || lobbyStatus === 'creating'}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {lobbyStatus === 'creating' ? 'Creating...' : 'Create Lobby'}
              </button>
            </div>

            {/* Join Lobby */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Join Lobby</h2>
              <p className="text-gray-400 mb-4">
                Enter a lobby code to join a friend's game.
              </p>
              {lobbyError && lobbyStatus === 'joining' && (
                <p className="text-red-400 text-sm mb-4">{lobbyError}</p>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Enter code"
                  className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-lg tracking-wider"
                  maxLength={6}
                />
                <button
                  onClick={() => joinLobby(joinCode)}
                  disabled={joinCode.length !== 6 || !selectedDeckId || lobbyStatus === 'joining'}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {lobbyStatus === 'joining' ? '...' : 'Join'}
                </button>
              </div>
            </div>
          </div>

          {/* Practice vs AI */}
          <AIPanel />

          {/* Selected deck info */}
          {!selectedDeckId && validDecks.length > 0 && (
            <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-4">
              <p className="text-yellow-400">
                Please select a deck from the left panel to start playing.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
