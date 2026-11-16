import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";

type Tone = "brand" | "success" | "warning" | "danger" | "neutral";

const TONE_STYLES: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-surface-2 text-muted-strong",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className="card flex items-start justify-between gap-3 p-5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className="mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums text-foreground">
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TONE_STYLES[tone]}`}
        aria-hidden="true"
      >
        <Icon size={18} strokeWidth={2} />
      </span>
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
  id,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-sm text-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={2} />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="max-w-md text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const NOTICE_STYLES = {
  warning: "border-warning/30 bg-warning-soft text-warning",
  info: "border-brand-soft-border bg-brand-soft text-brand",
  danger: "border-danger/30 bg-danger-soft text-danger",
  success: "border-success/30 bg-success-soft text-success",
} as const;

export function Notice({
  tone = "info",
  children,
}: {
  tone?: keyof typeof NOTICE_STYLES;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={`rounded-lg border px-3.5 py-2.5 text-sm ${NOTICE_STYLES[tone]}`}
    >
      {children}
    </div>
  );
}

export function PageIntro({ children }: { children: ReactNode }) {
  return <p className="-mt-2 text-sm text-muted">{children}</p>;
}
