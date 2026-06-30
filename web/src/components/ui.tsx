import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useEffect } from 'react';

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin h-5 w-5 ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function StatCard({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'brand';
  hint?: string;
}) {
  const tones: Record<string, string> = {
    default: 'text-gray-900',
    warning: 'text-amber-600',
    danger: 'text-red-600',
    brand: 'text-brand-600',
  };
  return (
    <Card className="p-5">
      <div className="text-sm font-medium text-gray-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold leading-tight tabular-nums break-words ${tones[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </Card>
  );
}

const BADGE_TONES: Record<string, string> = {
  gray: 'bg-gray-100 text-gray-700',
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800',
  indigo: 'bg-indigo-100 text-indigo-800',
};

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: keyof typeof BADGE_TONES }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

// Tone maps for domain enums (keeps badge colours consistent across screens).
export const MOVEMENT_TONE: Record<string, keyof typeof BADGE_TONES> = {
  purchase_receipt: 'green',
  transfer_in: 'blue',
  return_in: 'indigo',
  adjustment_in: 'green',
  sale: 'purple',
  transfer_out: 'blue',
  return_out: 'amber',
  adjustment_out: 'amber',
  write_off: 'red',
};

export const STATUS_TONE: Record<string, keyof typeof BADGE_TONES> = {
  draft: 'gray',
  submitted: 'blue',
  partially_received: 'amber',
  received: 'green',
  completed: 'green',
  approved: 'green',
  cancelled: 'gray',
  rejected: 'red',
  in_transit: 'amber',
  pending: 'amber',
  pending_approval: 'amber',
  counting: 'blue',
  ok: 'green',
  low: 'amber',
  out_of_stock: 'red',
};

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const widths = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className={`card w-full ${widths[size]} my-4`}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`input ${props.className ?? ''}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`input ${props.className ?? ''}`} />;
}

export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">{head}</thead>
        <tbody className="divide-y divide-gray-100 bg-white">{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="py-12 text-center text-sm text-gray-400">{message}</div>;
}

export function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <Spinner />
    </div>
  );
}
