import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';

type AnnouncementType = 'INFO' | 'UPDATE' | 'EVENT' | 'MAINTENANCE' | 'ALERT';

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: AnnouncementType;
  isPinned: boolean;
  isActive: boolean;
  publishedAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const ANNOUNCEMENT_TYPES: { value: AnnouncementType; label: string; color: string }[] = [
  { value: 'INFO', label: 'Info', color: 'bg-blue-600' },
  { value: 'UPDATE', label: 'Update', color: 'bg-green-600' },
  { value: 'EVENT', label: 'Event', color: 'bg-purple-600' },
  { value: 'MAINTENANCE', label: 'Maintenance', color: 'bg-orange-600' },
  { value: 'ALERT', label: 'Alert', color: 'bg-red-600' },
];

export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'INFO' as AnnouncementType,
    isPinned: false,
    isActive: true,
    expiresAt: '',
  });

  const loadAnnouncements = async () => {
    setIsLoading(true);
    try {
      const response = await api.get<{ announcements: Announcement[] }>('/admin/announcements');
      setAnnouncements(response.data.announcements);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load announcements');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const handleCreate = () => {
    setFormData({
      title: '',
      content: '',
      type: 'INFO',
      isPinned: false,
      isActive: true,
      expiresAt: '',
    });
    setIsCreating(true);
  };

  const handleEdit = (announcement: Announcement) => {
    setFormData({
      title: announcement.title,
      content: announcement.content,
      type: announcement.type,
      isPinned: announcement.isPinned,
      isActive: announcement.isActive,
      expiresAt: announcement.expiresAt ? announcement.expiresAt.split('T')[0] : '',
    });
    setEditingAnnouncement(announcement);
  };

  const handleSave = async () => {
    try {
      if (editingAnnouncement) {
        await api.patch(`/admin/announcements/${editingAnnouncement.id}`, {
          ...formData,
          expiresAt: formData.expiresAt || null,
        });
      } else {
        await api.post('/admin/announcements', {
          ...formData,
          expiresAt: formData.expiresAt || null,
        });
      }
      setEditingAnnouncement(null);
      setIsCreating(false);
      loadAnnouncements();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save announcement');
    }
  };

  const handleDelete = async (announcement: Announcement) => {
    if (!confirm(`Are you sure you want to delete "${announcement.title}"?`)) {
      return;
    }

    try {
      await api.delete(`/admin/announcements/${announcement.id}`);
      loadAnnouncements();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete announcement');
    }
  };

  const handleToggleActive = async (announcement: Announcement) => {
    try {
      await api.patch(`/admin/announcements/${announcement.id}`, {
        isActive: !announcement.isActive,
      });
      loadAnnouncements();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update announcement');
    }
  };

  const handleTogglePinned = async (announcement: Announcement) => {
    try {
      await api.patch(`/admin/announcements/${announcement.id}`, {
        isPinned: !announcement.isPinned,
      });
      loadAnnouncements();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update announcement');
    }
  };

  const getTypeInfo = (type: AnnouncementType) => {
    return ANNOUNCEMENT_TYPES.find((t) => t.value === type) || ANNOUNCEMENT_TYPES[0];
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
        <h1 className="text-3xl font-bold">Announcements</h1>
        <div className="flex gap-4">
          <button
            onClick={handleCreate}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
          >
            New Announcement
          </button>
          <Link to="/admin" className="text-gray-400 hover:text-white">
            Back to Dashboard
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Total Announcements</p>
          <p className="text-2xl font-bold">{announcements.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Active</p>
          <p className="text-2xl font-bold text-green-400">
            {announcements.filter((a) => a.isActive).length}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Pinned</p>
          <p className="text-2xl font-bold text-yellow-400">
            {announcements.filter((a) => a.isPinned).length}
          </p>
        </div>
      </div>

      {/* Announcements List */}
      <div className="space-y-4">
        {announcements.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-400">No announcements yet</p>
            <button
              onClick={handleCreate}
              className="mt-4 text-red-400 hover:text-red-300"
            >
              Create your first announcement
            </button>
          </div>
        ) : (
          announcements.map((announcement) => {
            const typeInfo = getTypeInfo(announcement.type);
            return (
              <div
                key={announcement.id}
                className={`bg-gray-800 rounded-lg p-4 ${!announcement.isActive ? 'opacity-60' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs text-white ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      {announcement.isPinned && (
                        <span className="px-2 py-1 bg-yellow-600/20 text-yellow-400 rounded text-xs">
                          Pinned
                        </span>
                      )}
                      {!announcement.isActive && (
                        <span className="px-2 py-1 bg-gray-600/20 text-gray-400 rounded text-xs">
                          Inactive
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold">{announcement.title}</h3>
                    <p className="text-gray-400 text-sm mt-1 line-clamp-2">{announcement.content}</p>
                    <p className="text-gray-500 text-xs mt-2">
                      Published: {new Date(announcement.publishedAt).toLocaleString()}
                      {announcement.expiresAt && (
                        <> | Expires: {new Date(announcement.expiresAt).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleTogglePinned(announcement)}
                      className={`text-sm ${announcement.isPinned ? 'text-yellow-400' : 'text-gray-400'} hover:text-yellow-300`}
                      title={announcement.isPinned ? 'Unpin' : 'Pin'}
                    >
                      {announcement.isPinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      onClick={() => handleToggleActive(announcement)}
                      className={`text-sm ${announcement.isActive ? 'text-green-400' : 'text-gray-400'} hover:text-green-300`}
                    >
                      {announcement.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleEdit(announcement)}
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(announcement)}
                      className="text-sm text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create/Edit Modal */}
      {(isCreating || editingAnnouncement) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">
              {editingAnnouncement ? 'Edit Announcement' : 'New Announcement'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Announcement title..."
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Content</label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={6}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Announcement content..."
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as AnnouncementType })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    {ANNOUNCEMENT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Expires At (optional)
                  </label>
                  <input
                    type="date"
                    value={formData.expiresAt}
                    onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.isPinned}
                    onChange={(e) => setFormData({ ...formData, isPinned: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-gray-300">Pinned</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-gray-300">Active</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleSave}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded"
              >
                {editingAnnouncement ? 'Save Changes' : 'Create Announcement'}
              </button>
              <button
                onClick={() => {
                  setEditingAnnouncement(null);
                  setIsCreating(false);
                }}
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
