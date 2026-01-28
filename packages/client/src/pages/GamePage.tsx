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

  useEffect(() => {
    if (!id || !user) {
      navigate('/lobby');
      return;
    }
  }, [id, user, navigate]);

  const handleLeave = () => {
    if (isAIGame) {
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
      {/* Main content: game board + chat sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Game container */}
        <div className="flex-1 relative">
          <GameBoard
            gameId={id}
            playerId={user.id}
            isAIGame={isAIGame}
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
