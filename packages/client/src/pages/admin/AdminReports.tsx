import { useEffect, useState } from 'react';
import { api } from '../../services/api';

type ReportType = 'CHEATING' | 'HARASSMENT' | 'INAPPROPRIATE_CONTENT' | 'GRIEFING' | 'OTHER';
type ReportStatus = 'PENDING' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';

interface Report {
  id: string;
  type: ReportType;
  status: ReportStatus;
  description: string;
  evidence: string | null;
  resolution: string | null;
  createdAt: string;
  reviewedAt: string | null;
  author: { id: string; username: string };
  target: { id: string; username: string };
  match: { id: string } | null;
}

const STATUS_OPTIONS: ReportStatus[] = ['PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'];

const STATUS_STYLES: Record<ReportStatus, string> = {
  PENDING: 'bg-yellow-600/20 text-yellow-400',
  INVESTIGATING: 'bg-blue-600/20 text-blue-400',
  RESOLVED: 'bg-green-600/20 text-green-400',
  DISMISSED: 'bg-gray-600/20 text-gray-400',
};

const TYPE_LABELS: Record<ReportType, string> = {
  CHEATING: 'Cheating',
  HARASSMENT: 'Harassment',
  INAPPROPRIATE_CONTENT: 'Inappropriate Content',
  GRIEFING: 'Griefing',
  OTHER: 'Other',
};

export default function AdminReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [resolution, setResolution] = useState('');

  const loadReports = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const response = await api.get<{ reports: Report[] }>(`/admin/reports?${params}`);
      setReports(response.data.reports);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load reports');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [statusFilter]);

  const handleStatusUpdate = async (reportId: string, newStatus: ReportStatus) => {
    try {
      await api.patch(`/admin/reports/${reportId}`, {
        status: newStatus,
        resolution: newStatus === 'RESOLVED' || newStatus === 'DISMISSED' ? resolution : undefined,
      });
      loadReports();
      setSelectedReport(null);
      setResolution('');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update report');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Report Management</h1>

      {error && (
        <div className="bg-red-900/30 border border-red-600 rounded p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter('')}
            className={`px-4 py-2 rounded ${!statusFilter ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
          >
            All
          </button>
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded ${statusFilter === status ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Reports List */}
      <div className="space-y-4">
        {reports.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-400">No reports found</p>
          </div>
        ) : (
          reports.map((report) => (
            <div key={report.id} className="bg-gray-800 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-1 rounded text-xs ${STATUS_STYLES[report.status]}`}>
                      {report.status}
                    </span>
                    <span className="px-2 py-1 bg-purple-600/20 text-purple-400 rounded text-xs">
                      {TYPE_LABELS[report.type]}
                    </span>
                  </div>
                  <div className="mb-2">
                    <span className="text-gray-400">Reporter: </span>
                    <span className="text-white">{report.author.username}</span>
                    <span className="text-gray-400 mx-2">→</span>
                    <span className="text-gray-400">Target: </span>
                    <span className="text-red-400">{report.target.username}</span>
                  </div>
                  <p className="text-gray-300 text-sm line-clamp-2">{report.description}</p>
                  <div className="mt-2 text-xs text-gray-500">
                    Reported: {new Date(report.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedReport(report);
                      setResolution(report.resolution || '');
                    }}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    Review
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Review Modal */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Review Report</h3>

            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm text-gray-400 mb-1">Status</label>
                  <span className={`inline-block px-2 py-1 rounded text-sm ${STATUS_STYLES[selectedReport.status]}`}>
                    {selectedReport.status}
                  </span>
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-gray-400 mb-1">Type</label>
                  <span className="text-white">{TYPE_LABELS[selectedReport.type]}</span>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm text-gray-400 mb-1">Reporter</label>
                  <span className="text-white">{selectedReport.author.username}</span>
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-gray-400 mb-1">Target</label>
                  <span className="text-red-400">{selectedReport.target.username}</span>
                </div>
              </div>

              {selectedReport.match && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Related Match</label>
                  <span className="text-blue-400">{selectedReport.match.id}</span>
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <p className="bg-gray-700 rounded p-3 text-white whitespace-pre-wrap">
                  {selectedReport.description}
                </p>
              </div>

              {selectedReport.evidence && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Evidence</label>
                  <p className="bg-gray-700 rounded p-3 text-white whitespace-pre-wrap">
                    {selectedReport.evidence}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-400 mb-1">Resolution Notes</label>
                <textarea
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  rows={3}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  placeholder="Add resolution notes..."
                />
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => handleStatusUpdate(selectedReport.id, 'INVESTIGATING')}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded"
                >
                  Mark Investigating
                </button>
                <button
                  onClick={() => handleStatusUpdate(selectedReport.id, 'RESOLVED')}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded"
                >
                  Resolve
                </button>
                <button
                  onClick={() => handleStatusUpdate(selectedReport.id, 'DISMISSED')}
                  className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-2 rounded"
                >
                  Dismiss
                </button>
              </div>

              <button
                onClick={() => {
                  setSelectedReport(null);
                  setResolution('');
                }}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded mt-2"
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
