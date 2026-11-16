import type { PortalMemberStatus } from "@/lib/member-portal";

const MEMBER_STATUS: Record<
  PortalMemberStatus,
  { label: string; classes: string }
> = {
  active: { label: "Active", classes: "badge-success" },
  suspended: { label: "Suspended", classes: "badge-danger" },
  expired: { label: "Expired", classes: "badge-warning" },
};

export function MemberStatusBadge({
  status,
}: {
  status: PortalMemberStatus;
}) {
  const entry = MEMBER_STATUS[status];
  return <span className={`badge ${entry.classes}`}>{entry.label}</span>;
}

export function LoanStatusBadge({
  returned,
  overdue,
}: {
  returned: boolean;
  overdue: boolean;
}) {
  if (returned) {
    return <span className="badge badge-success">Returned</span>;
  }
  if (overdue) {
    return <span className="badge badge-danger">Overdue</span>;
  }
  return <span className="badge badge-warning">On loan</span>;
}
