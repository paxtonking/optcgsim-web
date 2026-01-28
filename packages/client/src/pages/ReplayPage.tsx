import { useNavigate } from 'react-router-dom';

/**
 * ReplayPage - Match replays are no longer available for security reasons.
 * This page shows a message to users who may have bookmarked replay URLs.
 */
export default function ReplayPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg p-8 max-w-md text-center">
        <div className="text-6xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold text-white mb-4">
          Replays No Longer Available
        </h1>
        <p className="text-gray-400 mb-6">
          Match replays have been disabled to ensure fair play and prevent
          information leakage that could be used for cheating.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          Return to Home
        </button>
      </div>
    </div>
  );
}
