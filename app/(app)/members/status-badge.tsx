import type { MemberStatus } from "@/app/actions";

const styles: Record<MemberStatus, string> = {
  active: "badge-success",
  suspended: "badge-warning",
  expired: "badge-neutral",
};

export default function StatusBadge({ status }: { status: MemberStatus }) {
  return (
    <span className={`badge capitalize ${styles[status]}`}>{status}</span>
  );
}
