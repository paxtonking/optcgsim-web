import { useEffect, useState } from 'react';
import { api } from '../services/api';

type AnnouncementType = 'INFO' | 'UPDATE' | 'EVENT' | 'MAINTENANCE' | 'ALERT';

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: AnnouncementType;
  isPinned: boolean;
  publishedAt: string;
}

const TYPE_STYLES: Record<AnnouncementType, { bg: string; border: string; icon: string }> = {
  INFO: { bg: 'bg-blue-900/30', border: 'border-blue-600', icon: 'Info' },
  UPDATE: { bg: 'bg-green-900/30', border: 'border-green-600', icon: 'New' },
  EVENT: { bg: 'bg-purple-900/30', border: 'border-purple-600', icon: 'Event' },
  MAINTENANCE: { bg: 'bg-orange-900/30', border: 'border-orange-600', icon: 'Maintenance' },
  ALERT: { bg: 'bg-red-900/30', border: 'border-red-600', icon: 'Alert' },
};

export default function AnnouncementsBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const loadAnnouncements = async () => {
      try {
        const response = await api.get<{ announcements: Announcement[] }>('/announcements?limit=5');
        setAnnouncements(response.data.announcements);
      } catch (err) {
        // Silently fail - announcements are optional
        console.error('Failed to load announcements:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadAnnouncements();
  }, []);

  if (isLoading || announcements.length === 0) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div className="space-y-3">
        {announcements.map((announcement) => {
          const styles = TYPE_STYLES[announcement.type] || TYPE_STYLES.INFO;
          const isExpanded = expandedId === announcement.id;

          return (
            <div
              key={announcement.id}
              className={`${styles.bg} border ${styles.border} rounded-lg overflow-hidden`}
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : announcement.id)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium px-2 py-1 bg-white/10 rounded">
                    {styles.icon}
                  </span>
                  {announcement.isPinned && (
                    <span className="text-xs text-yellow-400">Pinned</span>
                  )}
                  <span className="font-semibold">{announcement.title}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">
                    {new Date(announcement.publishedAt).toLocaleDateString()}
                  </span>
                  <span className="text-gray-400">{isExpanded ? '−' : '+'}</span>
                </div>
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 text-gray-300 whitespace-pre-wrap">
                  {announcement.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
