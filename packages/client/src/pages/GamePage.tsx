import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { GameController } from '../game/GameController';
import { useAuthStore } from '../stores/authStore';
import { useLobbyStore } from '../stores/lobbyStore';
import { socketService } from '../services/socket';
import { ChatPanel } from '../components/ChatPanel';

export default function GamePage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameControllerRef = useRef<GameController | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAIGame = searchParams.get('ai') === 'true';
  const isSpectator = searchParams.get('spectate') === 'true';

  useEffect(() => {
    if (!id || !user) {
      navigate('/lobby');
      return;
    }

    // Initialize game controller
    if (gameContainerRef.current && !gameControllerRef.current) {
      gameControllerRef.current = new GameController(isAIGame, isSpectator);
      gameControllerRef.current.initialize(gameContainerRef.current, id, user.id);
      setIsLoading(false);
    }

    // Cleanup on unmount
    return () => {
      if (gameControllerRef.current) {
        gameControllerRef.current.destroy();
        gameControllerRef.current = null;
      }
    };
  }, [id, user, navigate, isAIGame, isSpectator]);

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Game header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold">Game Room</h1>
          {isSpectator && (
            <span className="px-2 py-1 bg-blue-600 text-xs rounded">Spectating</span>
          )}
          {isAIGame && (
            <span className="px-2 py-1 bg-purple-600 text-xs rounded">VS AI</span>
          )}
          <span className="text-sm text-gray-400">ID: {id?.slice(0, 8)}...</span>
        </div>
        <button
          onClick={() => {
            if (isAIGame && !isSpectator) {
              socketService.emit('ai:surrender', {});
            }
            // Reset lobby state to prevent navigation loop
            useLobbyStore.getState().reset();
            navigate('/lobby');
          }}
          className={`px-4 py-2 rounded transition ${
            isSpectator
              ? 'bg-gray-600 hover:bg-gray-700'
              : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {isSpectator ? 'Leave' : isAIGame ? 'Surrender' : 'Leave Game'}
        </button>
      </div>

      {/* Main content: game board + chat sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Game container */}
        <div className="flex-1 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                <p className="text-gray-400">Loading game...</p>
              </div>
            </div>
          )}
          <div ref={gameContainerRef} className="w-full h-full" />
        </div>

        {/* Chat sidebar */}
        {!isAIGame && (
          <ChatPanel className="hidden lg:flex w-80 border-l border-gray-800 h-full" />
        )}
      </div>
    </div>
  );
}

