import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { GameController } from '../game/GameController';
import { useAuthStore } from '../stores/authStore';
import { socketService } from '../services/socket';

export default function GamePage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameControllerRef = useRef<GameController | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAIGame = searchParams.get('ai') === 'true';

  useEffect(() => {
    if (!id || !user) {
      navigate('/lobby');
      return;
    }

    // Initialize game controller
    if (gameContainerRef.current && !gameControllerRef.current) {
      gameControllerRef.current = new GameController(isAIGame);
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
  }, [id, user, navigate]);

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Game header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold">Game Room</h1>
          {isAIGame && (
            <span className="px-2 py-1 bg-purple-600 text-xs rounded">VS AI</span>
          )}
          <span className="text-sm text-gray-400">ID: {id?.slice(0, 8)}...</span>
        </div>
        <button
          onClick={() => {
            if (isAIGame) {
              socketService.emit('ai:surrender', {});
            }
            navigate('/lobby');
          }}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition"
        >
          {isAIGame ? 'Surrender' : 'Leave Game'}
        </button>
      </div>

      {/* Game container */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-gray-400">Loading game...</p>
            </div>
          </div>
        )}
        <div ref={gameContainerRef} className="w-full h-full" />
      </div>

      {/* Chat sidebar (optional) */}
      <div className="absolute right-0 top-16 bottom-0 w-80 bg-gray-900 border-l border-gray-800 p-4 hidden lg:block">
        <h2 className="text-lg font-bold mb-4">Chat</h2>
        <div className="flex-1 overflow-y-auto mb-4">
          <p className="text-gray-500 text-sm">Chat coming soon...</p>
        </div>
        <input
          type="text"
          placeholder="Type a message..."
          className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700 focus:border-primary focus:outline-none"
          disabled
        />
      </div>
    </div>
  );
}
