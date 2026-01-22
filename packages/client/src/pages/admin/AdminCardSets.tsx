import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';

interface CardSet {
  id: string;
  code: string;
  name: string;
  releaseDate: string;
  isActive: boolean;
  cardCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function AdminCardSets() {
  const [cardSets, setCardSets] = useState<CardSet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSet, setEditingSet] = useState<CardSet | null>(null);

  const loadCardSets = async () => {
    setIsLoading(true);
    try {
      const response = await api.get<{ cardSets: CardSet[] }>('/admin/cardsets');
      setCardSets(response.data.cardSets);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load card sets');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCardSets();
  }, []);

  const handleToggleActive = async (cardSet: CardSet) => {
    try {
      await api.patch(`/admin/cardsets/${cardSet.id}`, {
        isActive: !cardSet.isActive,
      });
      loadCardSets();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update card set');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingSet) return;

    try {
      await api.patch(`/admin/cardsets/${editingSet.id}`, {
        name: editingSet.name,
        releaseDate: editingSet.releaseDate,
        isActive: editingSet.isActive,
      });
      setEditingSet(null);
      loadCardSets();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update card set');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Card Sets</h1>
        <Link to="/admin" className="text-gray-400 hover:text-white">
          ← Back to Dashboard
        </Link>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Total Sets</p>
          <p className="text-2xl font-bold">{cardSets.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Active Sets</p>
          <p className="text-2xl font-bold text-green-400">
            {cardSets.filter((s) => s.isActive).length}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Total Cards</p>
          <p className="text-2xl font-bold">
            {cardSets.reduce((sum, s) => sum + s.cardCount, 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Card Sets Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm bg-gray-900">
                <th className="p-4">Code</th>
                <th className="p-4">Name</th>
                <th className="p-4">Release Date</th>
                <th className="p-4">Cards</th>
                <th className="p-4">Status</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cardSets.map((cardSet) => (
                <tr
                  key={cardSet.id}
                  className="border-t border-gray-700 hover:bg-gray-700/30"
                >
                  <td className="p-4 font-mono font-medium">{cardSet.code}</td>
                  <td className="p-4">{cardSet.name}</td>
                  <td className="p-4 text-gray-400">
                    {new Date(cardSet.releaseDate).toLocaleDateString()}
                  </td>
                  <td className="p-4">{cardSet.cardCount}</td>
                  <td className="p-4">
                    <button
                      onClick={() => handleToggleActive(cardSet)}
                      className={`px-2 py-1 rounded text-sm ${
                        cardSet.isActive
                          ? 'bg-green-600/20 text-green-400'
                          : 'bg-gray-600/20 text-gray-400'
                      }`}
                    >
                      {cardSet.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => setEditingSet(cardSet)}
                      className="text-blue-400 hover:text-blue-300 text-sm"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingSet && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Edit Card Set</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Code</label>
                <input
                  type="text"
                  value={editingSet.code}
                  disabled
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={editingSet.name}
                  onChange={(e) =>
                    setEditingSet({ ...editingSet, name: e.target.value })
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Release Date
                </label>
                <input
                  type="date"
                  value={editingSet.releaseDate.split('T')[0]}
                  onChange={(e) =>
                    setEditingSet({
                      ...editingSet,
                      releaseDate: e.target.value,
                    })
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={editingSet.isActive}
                  onChange={(e) =>
                    setEditingSet({
                      ...editingSet,
                      isActive: e.target.checked,
                    })
                  }
                  className="w-4 h-4"
                />
                <label htmlFor="isActive" className="text-gray-300">
                  Active
                </label>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleSaveEdit}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded"
              >
                Save
              </button>
              <button
                onClick={() => setEditingSet(null)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded"
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
