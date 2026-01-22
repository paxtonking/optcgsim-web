import { useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useLobbyStore } from '../stores/lobbyStore';
import { socketService } from '../services/socket';
import { ChatPanel } from '../components/ChatPanel';
import { GameBoard } from '../components/game/GameBoard';

export default function GamePage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const isAIGame = searchParams.get('ai') === 'true';
  const isSpectator = searchParams.get('spectate') === 'true';

  useEffect(() => {
    if (!id || !user) {
      navigate('/lobby');
      return;
    }
  }, [id, user, navigate]);

  const handleLeave = () => {
    if (isAIGame && !isSpectator) {
      socketService.emit('ai:surrender', {});
    }
    // Reset lobby state to prevent navigation loop
    useLobbyStore.getState().reset();
    navigate('/lobby');
  };

  if (!id || !user) {
    return null;
  }

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
          onClick={handleLeave}
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
          <GameBoard
            gameId={id}
            playerId={user.id}
            isAIGame={isAIGame}
            isSpectator={isSpectator}
            onLeave={handleLeave}
          />
        </div>

        {/* Chat sidebar */}
        {!isAIGame && (
          <ChatPanel className="hidden lg:flex w-80 border-l border-gray-800 h-full" />
        )}
      </div>
    </div>
  );
}
