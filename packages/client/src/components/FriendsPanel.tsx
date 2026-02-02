import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFriendsStore } from '../stores/friendsStore';
import { useLobbyStore } from '../stores/lobbyStore';
import { useDeckStore } from '../stores/deckStore';
import { toast } from '../stores/toastStore';

type Tab = 'friends' | 'requests' | 'search';

export function FriendsPanel() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSyncingDeck, setIsSyncingDeck] = useState(false);

  const {
    friends,
    pendingRequests,
    sentRequests,
    pendingChallenge,
    isLoading,
    loadFriends,
    loadRequests,
    sendFriendRequest,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    removeFriend,
    searchUsers,
    sendChallenge,
    acceptChallenge,
    declineChallenge,
    setupChallengeListeners,
    setupPresenceListeners,
  } = useFriendsStore();

  const { selectedDeckId } = useLobbyStore();
  const { getServerDeckId, saveDeckToServer } = useDeckStore();

  // Load friends and requests on mount
  useEffect(() => {
    loadFriends();
    loadRequests();
  }, [loadFriends, loadRequests]);

  // Set up challenge and presence listeners
  useEffect(() => {
    const cleanupChallenge = setupChallengeListeners();
    const cleanupPresence = setupPresenceListeners();
    return () => {
      cleanupChallenge();
      cleanupPresence();
    };
  }, [setupChallengeListeners, setupPresenceListeners]);

  // Handle search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchUsers(searchQuery);
      setSearchResults(results);
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchUsers]);

  const handleSendRequest = async (username: string) => {
    setActionError(null);
    const result = await sendFriendRequest(username);
    if (!result.success) {
      setActionError(result.error || 'Failed to send request');
    } else if (result.autoAccepted) {
      setActionError(null);
      // Optionally show success message
    }
    // Clear search after sending
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleChallenge = async (friendId: string) => {
    setActionError(null);

    if (!selectedDeckId) {
      setActionError('Please select a deck first');
      return;
    }

    // Convert local deck ID to server deck ID
    let serverDeckId = getServerDeckId(selectedDeckId);
    if (!serverDeckId) {
      setIsSyncingDeck(true);
      serverDeckId = await saveDeckToServer(selectedDeckId);
      setIsSyncingDeck(false);
      if (!serverDeckId) {
        setActionError('Failed to sync deck to server. Please check deck validity.');
        return;
      }
    }

    const result = await sendChallenge(friendId, serverDeckId);
    if (result.success) {
      toast.success('Challenge sent!');
    } else {
      setActionError(result.error || 'Failed to send challenge');
    }
  };

  const handleAcceptChallenge = async () => {
    if (!pendingChallenge) return;

    if (!selectedDeckId) {
      setActionError('Please select a deck to accept the challenge');
      return;
    }

    // Convert local deck ID to server deck ID
    let serverDeckId = getServerDeckId(selectedDeckId);
    if (!serverDeckId) {
      setIsSyncingDeck(true);
      serverDeckId = await saveDeckToServer(selectedDeckId);
      setIsSyncingDeck(false);
      if (!serverDeckId) {
        setActionError('Failed to sync deck to server. Please check deck validity.');
        return;
      }
    }

    const result = await acceptChallenge(pendingChallenge.challengeId, serverDeckId);
    if (result.success) {
      // Navigate to lobby - the lobby update will handle game start
      navigate('/lobby');
    } else {
      setActionError(result.error || 'Failed to accept challenge');
    }
  };

  const handleDeclineChallenge = async () => {
    if (!pendingChallenge) return;
    await declineChallenge(pendingChallenge.challengeId);
  };

  const totalRequests = pendingRequests.length + sentRequests.length;

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Friends</h2>

      {/* Challenge notification */}
      {pendingChallenge && (
        <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-4 mb-4">
          <p className="text-yellow-400 font-medium mb-2">
            Challenge received!
          </p>
          <p className="text-gray-300 mb-3">
            <span className="font-bold">{pendingChallenge.fromUsername}</span> wants to play
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleAcceptChallenge}
              disabled={!selectedDeckId || isSyncingDeck}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded transition-colors disabled:opacity-50"
            >
              {isSyncingDeck ? 'Syncing...' : 'Accept'}
            </button>
            <button
              onClick={handleDeclineChallenge}
              className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-2 rounded transition-colors"
            >
              Decline
            </button>
          </div>
          {!selectedDeckId && (
            <p className="text-yellow-500 text-xs mt-2">Select a deck to accept</p>
          )}
        </div>
      )}

      {/* Error display */}
      {actionError && (
        <div className="bg-red-900/30 border border-red-600 rounded p-2 mb-4">
          <p className="text-red-400 text-sm">{actionError}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-700 mb-4">
        <button
          onClick={() => setActiveTab('friends')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'friends'
              ? 'text-white border-b-2 border-red-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Friends ({friends.length})
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'requests'
              ? 'text-white border-b-2 border-red-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Requests {totalRequests > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-red-600 text-white text-xs rounded-full">
              {totalRequests}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'search'
              ? 'text-white border-b-2 border-red-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Add Friend
        </button>
      </div>

      {/* Content */}
      <div className="max-h-80 overflow-y-auto">
        {/* Friends Tab */}
        {activeTab === 'friends' && (
          <div className="space-y-2">
            {isLoading ? (
              <p className="text-gray-400 text-center py-4">Loading...</p>
            ) : friends.length === 0 ? (
              <p className="text-gray-400 text-center py-4">No friends yet</p>
            ) : (
              friends.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center justify-between bg-gray-700 rounded p-3"
                >
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                        {friend.username.charAt(0).toUpperCase()}
                      </div>
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-700 ${
                          friend.isOnline ? 'bg-green-500' : 'bg-gray-500'
                        }`}
                        title={friend.isOnline ? 'Online' : 'Offline'}
                      />
                    </div>
                    <div>
                      <p className="font-medium text-white">{friend.username}</p>
                      <p className="text-xs text-gray-400">
                        {friend.eloRating} ELO
                        <span className={`ml-2 ${friend.isOnline ? 'text-green-400' : 'text-gray-500'}`}>
                          {friend.isOnline ? 'Online' : 'Offline'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleChallenge(friend.friendId)}
                      disabled={!selectedDeckId || isSyncingDeck}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors disabled:opacity-50"
                      title={!selectedDeckId ? 'Select a deck first' : 'Challenge to a game'}
                    >
                      {isSyncingDeck ? 'Syncing...' : 'Challenge'}
                    </button>
                    <button
                      onClick={() => removeFriend(friend.friendId)}
                      className="px-3 py-1 bg-gray-600 hover:bg-red-600 text-white text-sm rounded transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <div className="space-y-4">
            {/* Pending requests (received) */}
            {pendingRequests.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-2">Received</h3>
                <div className="space-y-2">
                  {pendingRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between bg-gray-700 rounded p-3"
                    >
                      <div>
                        <p className="font-medium text-white">{request.fromUsername}</p>
                        <p className="text-xs text-gray-400">{request.eloRating} ELO</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => acceptRequest(request.id)}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => rejectRequest(request.id)}
                          className="px-3 py-1 bg-gray-600 hover:bg-red-600 text-white text-sm rounded transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sent requests */}
            {sentRequests.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-2">Sent</h3>
                <div className="space-y-2">
                  {sentRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between bg-gray-700 rounded p-3"
                    >
                      <div>
                        <p className="font-medium text-white">{request.toUsername}</p>
                        <p className="text-xs text-gray-400">Pending</p>
                      </div>
                      <button
                        onClick={() => cancelRequest(request.id)}
                        className="px-3 py-1 bg-gray-600 hover:bg-red-600 text-white text-sm rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pendingRequests.length === 0 && sentRequests.length === 0 && (
              <p className="text-gray-400 text-center py-4">No pending requests</p>
            )}
          </div>
        )}

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by username..."
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
            />

            {isSearching ? (
              <p className="text-gray-400 text-center py-4">Searching...</p>
            ) : searchResults.length === 0 ? (
              searchQuery.length >= 2 ? (
                <p className="text-gray-400 text-center py-4">No users found</p>
              ) : (
                <p className="text-gray-400 text-center py-4">Enter at least 2 characters</p>
              )
            ) : (
              <div className="space-y-2">
                {searchResults.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between bg-gray-700 rounded p-3"
                  >
                    <div>
                      <p className="font-medium text-white">{user.username}</p>
                      <p className="text-xs text-gray-400">{user.eloRating} ELO</p>
                    </div>
                    {user.isFriend ? (
                      <span className="text-green-400 text-sm">Already friends</span>
                    ) : user.isPending ? (
                      <span className="text-yellow-400 text-sm">Pending</span>
                    ) : (
                      <button
                        onClick={() => handleSendRequest(user.username)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                      >
                        Add Friend
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
