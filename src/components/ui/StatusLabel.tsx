import { useAuth } from '../../context/AuthContext';
import { translateStatus } from '../../i18n/translations';

const colorMap: Record<string, { text: string; marker: string }> = {
  'In Stock': { text: 'text-emerald-700', marker: 'bg-emerald-600' },
  Confirmed: { text: 'text-emerald-700', marker: 'bg-emerald-600' },
  Completed: { text: 'text-emerald-700', marker: 'bg-emerald-600' },
  Approved: { text: 'text-emerald-700', marker: 'bg-emerald-600' },
  Active: { text: 'text-emerald-700', marker: 'bg-emerald-600' },
  'Low Stock': { text: 'text-amber-700', marker: 'bg-amber-600' },
  'Pending Approval': { text: 'text-amber-700', marker: 'bg-amber-600' },
  Pending: { text: 'text-amber-700', marker: 'bg-amber-600' },
  'In Transit': { text: 'text-[#245582]', marker: 'bg-[#245582]' },
  'Partially Received': { text: 'text-[#245582]', marker: 'bg-[#245582]' },
  'In Progress': { text: 'text-[#245582]', marker: 'bg-[#245582]' },
  Draft: { text: 'text-slate-600', marker: 'bg-slate-400' },
  'Out of Stock': { text: 'text-red-700', marker: 'bg-red-600' },
  Rejected: { text: 'text-red-700', marker: 'bg-red-600' },
  Cancelled: { text: 'text-slate-500', marker: 'bg-slate-400' },
  Inactive: { text: 'text-slate-500', marker: 'bg-slate-400' },
  Suspended: { text: 'text-red-700', marker: 'bg-red-600' },
};

export function StatusLabel({ status }: { status: string }) {
  const { language } = useAuth();
  const style = colorMap[status] || { text: 'text-slate-700', marker: 'bg-slate-400' };
  const label = translateStatus(language, status);

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-xs shrink-0 ${style.marker}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
