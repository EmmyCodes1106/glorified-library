import type { MemberStatus } from "../actions";

const styles: Record<MemberStatus, string> = {
  active:
    "border-green-300 text-green-700 dark:border-green-800 dark:text-green-400",
  suspended:
    "border-orange-300 text-orange-700 dark:border-orange-800 dark:text-orange-400",
  expired:
    "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-400",
};

export default function StatusBadge({ status }: { status: MemberStatus }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${styles[status]}`}
    >
      {status}
    </span>
  );
}
