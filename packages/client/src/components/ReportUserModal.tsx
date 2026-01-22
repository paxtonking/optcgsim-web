import { useState } from 'react';
import { api } from '../services/api';

type ReportType = 'CHEATING' | 'HARASSMENT' | 'INAPPROPRIATE_CONTENT' | 'GRIEFING' | 'OTHER';

interface ReportUserModalProps {
  targetId: string;
  targetUsername: string;
  matchId?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const REPORT_TYPES: { value: ReportType; label: string; description: string }[] = [
  { value: 'CHEATING', label: 'Cheating', description: 'Using exploits, third-party tools, or other unfair advantages' },
  { value: 'HARASSMENT', label: 'Harassment', description: 'Targeted harassment, hate speech, or threats' },
  { value: 'INAPPROPRIATE_CONTENT', label: 'Inappropriate Content', description: 'Offensive username, profile, or deck names' },
  { value: 'GRIEFING', label: 'Griefing', description: 'Intentionally ruining games, stalling, or refusing to play' },
  { value: 'OTHER', label: 'Other', description: 'Other rule violations not listed above' },
];

export default function ReportUserModal({ targetId, targetUsername, matchId, onClose, onSuccess }: ReportUserModalProps) {
  const [reportType, setReportType] = useState<ReportType>('CHEATING');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!description.trim()) {
      setError('Please provide a description');
      return;
    }

    if (description.length < 10) {
      setError('Description must be at least 10 characters');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.post('/reports', {
        type: reportType,
        targetId,
        matchId,
        description: description.trim(),
      });

      if (onSuccess) {
        onSuccess();
      }
      onClose();
      alert('Report submitted successfully. Our moderation team will review it.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit report');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
        <h3 className="text-xl font-bold mb-2">Report User</h3>
        <p className="text-gray-400 mb-4">
          Reporting: <span className="text-red-400">{targetUsername}</span>
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-600 rounded p-3 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Report Type *</label>
            <div className="space-y-2">
              {REPORT_TYPES.map((type) => (
                <label
                  key={type.value}
                  className={`block p-3 rounded cursor-pointer transition-colors ${
                    reportType === type.value
                      ? 'bg-red-600/20 border border-red-600'
                      : 'bg-gray-700 border border-gray-600 hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="reportType"
                      value={type.value}
                      checked={reportType === type.value}
                      onChange={(e) => setReportType(e.target.value as ReportType)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium text-white">{type.label}</div>
                      <div className="text-sm text-gray-400">{type.description}</div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Description * <span className="text-gray-500">(min 10 characters)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
              placeholder="Please describe what happened in detail. Include any relevant information that would help our moderation team investigate."
            />
            <div className="text-xs text-gray-500 mt-1">
              {description.length} / 10 minimum characters
            </div>
          </div>

          {matchId && (
            <div className="text-sm text-gray-400">
              This report will be linked to match: <span className="text-blue-400">{matchId.slice(0, 8)}...</span>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed text-white py-2 rounded"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded"
            >
              Cancel
            </button>
          </div>
        </form>

        <p className="text-xs text-gray-500 mt-4">
          False reports may result in action being taken against your account.
          Please only report genuine violations.
        </p>
      </div>
    </div>
  );
}
