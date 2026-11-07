"use client";

import { useState, useActionState } from "react";
import {
  deleteMember,
  renewMembership,
  setMemberStatus,
  updateMember,
  type FormState,
  type MemberStatus,
} from "../../actions";

const initial: FormState = { message: "" };

type Props = {
  member: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    status: MemberStatus;
    loanLimit: number;
  };
  totalLoans: number;
  openLoans: number;
  maxLoanLimit?: number;
  membershipMonths?: number;
};

export default function MemberActions({
  member,
  totalLoans,
  openLoans,
  maxLoanLimit = 100,
  membershipMonths = 0,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [lastAction, setLastAction] = useState<
    "update" | "status" | "renew" | "delete" | null
  >(null);

  async function handleUpdate(prev: FormState, formData: FormData) {
    setLastAction("update");
    const result = await updateMember(prev, formData);
    if (result.ok) setEditing(false);
    return result;
  }

  async function handleStatus(prev: FormState, formData: FormData) {
    setLastAction("status");
    return setMemberStatus(prev, formData);
  }

  async function handleRenew(prev: FormState, formData: FormData) {
    setLastAction("renew");
    return renewMembership(prev, formData);
  }

  async function handleDelete(prev: FormState, formData: FormData) {
    setLastAction("delete");
    return deleteMember(prev, formData);
  }

  const [updateState, updateAction, updating] = useActionState(
    handleUpdate,
    initial
  );
  const [statusState, statusAction, statusPending] = useActionState(
    handleStatus,
    initial
  );
  const [renewState, renewAction, renewing] = useActionState(
    handleRenew,
    initial
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    handleDelete,
    initial
  );

  const nextStatus = member.status === "active" ? "suspended" : "active";
  const canDelete = totalLoans === 0;

  return (
    <section className="rounded-lg border p-4 sm:p-5" aria-labelledby="manage-member-heading">
      <h2 id="manage-member-heading" className="font-semibold">
        Manage member
      </h2>

      {lastAction === "update" && updateState.ok && updateState.message && (
        <p className="mt-2 text-sm text-green-600">{updateState.message}</p>
      )}

      {editing ? (
        <form action={updateAction} className="mt-4 grid gap-3">
          <input type="hidden" name="id" value={member.id} />

          <label className="grid gap-1 text-sm">
            <span className="text-gray-500">Full name</span>
            <input
              name="name"
              required
              maxLength={160}
              autoComplete="name"
              defaultValue={member.name}
              className="w-full min-w-0 rounded border bg-transparent p-2"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-gray-500">Email address</span>
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              defaultValue={member.email ?? ""}
              className="w-full min-w-0 rounded border bg-transparent p-2"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-gray-500">Phone number (optional)</span>
            <input
              name="phone"
              inputMode="tel"
              maxLength={20}
              autoComplete="tel"
              defaultValue={member.phone ?? ""}
              className="w-full min-w-0 rounded border bg-transparent p-2"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-gray-500">Address (optional)</span>
            <textarea
              name="address"
              rows={3}
              maxLength={500}
              autoComplete="street-address"
              defaultValue={member.address ?? ""}
              className="w-full min-w-0 rounded border bg-transparent p-2"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-gray-500">Borrowing limit (books)</span>
            <input
              name="loanLimit"
              type="number"
              min={0}
              max={maxLoanLimit}
              required
              defaultValue={member.loanLimit}
              className="w-full min-w-0 rounded border bg-transparent p-2"
            />
            <span className="text-xs text-gray-500">
              Set to 0 to pause new loans. The system maximum is{" "}
              {maxLoanLimit}.
            </span>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-gray-500">Membership status</span>
            <select
              name="status"
              defaultValue={member.status}
              className="w-full min-w-0 rounded border bg-transparent p-2"
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="expired">Expired</option>
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              disabled={updating}
              className="rounded bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
            >
              {updating ? "Saving..." : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="underline"
            >
              Cancel
            </button>
          </div>

          {updateState.message && !updateState.ok && (
            <p className="text-sm text-red-500">{updateState.message}</p>
          )}
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border px-3 py-1.5 text-sm"
          >
            Edit details
          </button>

          <form action={statusAction}>
            <input type="hidden" name="id" value={member.id} />
            <input type="hidden" name="status" value={nextStatus} />
            <button
              disabled={statusPending}
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {statusPending
                ? "Updating..."
                : nextStatus === "suspended"
                  ? "Suspend membership"
                  : "Reactivate membership"}
            </button>
          </form>

          <form action={renewAction}>
            <input type="hidden" name="id" value={member.id} />
            <button
              disabled={renewing}
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {renewing ? "Renewing..." : "Renew membership"}
            </button>
          </form>
        </div>
      )}

      {lastAction === "renew" && renewState.message && (
        <p
          className={`mt-2 text-sm ${
            renewState.ok ? "text-green-600" : "text-red-500"
          }`}
        >
          {renewState.message}
        </p>
      )}

      {lastAction !== "renew" && membershipMonths > 0 && !editing && (
        <p className="mt-2 text-xs text-gray-500">
          Renewing extends membership by {membershipMonths}{" "}
          {membershipMonths === 1 ? "month" : "months"} from the current expiry
          date.
        </p>
      )}

      {lastAction === "status" && statusState.message && (
        <p
          className={`mt-2 text-sm ${
            statusState.ok ? "text-green-600" : "text-red-500"
          }`}
        >
          {statusState.message}
        </p>
      )}

      <div className="mt-4 border-t pt-4">
        {canDelete ? (
          <form
            action={deleteAction}
            onSubmit={(event) => {
              if (!confirm(`Delete ${member.name}? This cannot be undone.`)) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="id" value={member.id} />
            <button disabled={deleting} className="text-sm text-red-500 underline">
              {deleting ? "Deleting..." : "Delete member"}
            </button>
          </form>
        ) : (
          <div>
            <button
              type="button"
              disabled
              className="cursor-not-allowed text-sm text-red-500 underline opacity-50"
            >
              Delete member
            </button>
            <p className="mt-1 text-xs text-gray-500">
              {openLoans > 0
                ? "Return all borrowed books before deleting this member."
                : "Borrowing history must be kept, so this member cannot be deleted. Suspend the membership instead."}
            </p>
          </div>
        )}

        {lastAction === "delete" && deleteState.message && !deleteState.ok && (
          <p className="mt-2 text-sm text-red-500">{deleteState.message}</p>
        )}
      </div>
    </section>
  );
}
