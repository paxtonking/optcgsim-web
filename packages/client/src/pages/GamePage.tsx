import { useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useLobbyStore } from '../stores/lobbyStore';
import { socketService } from '../services/socket';
import { GameBoard } from '../components/game/GameBoard';
import { usePreventZoom } from '../hooks/usePreventZoom';

export default function GamePage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const isAIGame = searchParams.get('ai') === 'true';

  // Prevent browser zoom during gameplay
  usePreventZoom();

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
    <div
      className="h-screen bg-background flex flex-col"
      style={{ touchAction: 'none' }}
    >
      {/* Main content: game board */}
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
      </div>
    </div>
  );
}
