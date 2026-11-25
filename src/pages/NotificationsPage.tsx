import { useState, useEffect, useCallback } from 'react';
import { CheckCheck, Bell } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatDate } from '../lib/exportUtils';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { EmptyState, ErrorBanner, TableSkeleton } from '../components/ui/DataState';

interface NotificationRow {
  _id: string;
  type: string;
  title: string;
  titleSo: string;
  message: string;
  messageSo: string;
  referenceNumber: string;
  isRead: boolean;
  createdAt: string;
}

export function NotificationsPage() {
  const { language, brand, refreshUnreadCount } = useAuth();
  const { showSuccess, showError } = useToast();

  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ notifications: NotificationRow[] }>('/api/notifications');
      setNotifications(res.notifications);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const markRead = async (id: string) => {
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
      refreshUnreadCount();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to mark read');
    }
  };

  const markAllRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      refreshUnreadCount();
      showSuccess('All notifications marked as read.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to mark all read');
    }
  };

  const visible =
    filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded ${
              filter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={`px-3 py-1.5 text-xs font-medium rounded ${
              filter === 'unread' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Unread ({notifications.filter((n) => !n.isRead).length})
          </button>
        </div>

        <button
          type="button"
          onClick={markAllRead}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-50"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span>Mark All Read</span>
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
        {loading ? (
          <TableSkeleton rows={5} />
        ) : visible.length === 0 ? (
          <EmptyState title="No notifications" />
        ) : (
          visible.map((n) => (
            <div
              key={n._id}
              className={`p-4 flex items-start justify-between gap-4 ${
                n.isRead ? 'bg-white' : 'bg-[#F3F7FB]'
              }`}
            >
              <div className="flex items-start gap-3">
                <Bell
                  className={`w-4 h-4 mt-0.5 shrink-0 ${
                    n.isRead ? 'text-slate-400' : 'text-[#245582]'
                  }`}
                />
                <div>
                  <p className="text-xs font-semibold text-slate-900">
                    {language === 'so' ? n.titleSo : n.title}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {language === 'so' ? n.messageSo : n.message}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1 font-mono">
                    <span>{n.type}</span>
                    {n.referenceNumber && (
                      <>
                        <span>·</span>
                        <span>{n.referenceNumber}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>{formatDate(n.createdAt, brand.dateFormat)}</span>
                  </div>
                </div>
              </div>
              {!n.isRead && (
                <button
                  type="button"
                  onClick={() => markRead(n._id)}
                  className="px-2.5 py-1 text-[11px] font-medium text-[#245582] border border-[#245582]/30 rounded hover:bg-white shrink-0"
                >
                  Mark Read
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
