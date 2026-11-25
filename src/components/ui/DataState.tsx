import { AlertCircle, PackageOpen } from 'lucide-react';

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="p-6 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-9 bg-slate-100 rounded animate-pulse"
          style={{ animationDelay: `${i * 50}ms` }}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      <PackageOpen className="w-9 h-9 text-slate-300 mb-3" />
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="text-xs text-slate-500 mt-1 max-w-md">{description}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 text-xs font-medium text-white bg-[#245582] hover:bg-[#1B4368] rounded-md whitespace-nowrap shrink-0"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 p-4 bg-red-50 border border-red-200 rounded-md text-xs text-red-800">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-3 py-1.5 font-medium bg-white border border-red-300 rounded text-red-700 hover:bg-red-50 whitespace-nowrap shrink-0"
        >
          Retry
        </button>
      )}
    </div>
  );
}
