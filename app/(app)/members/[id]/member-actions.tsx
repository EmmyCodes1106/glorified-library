"use client";

import { useState, useActionState } from "react";
import {
  deleteMember,
  renewMembership,
  setMemberStatus,
  updateMember,
  type FormState,
  type MemberStatus,
} from "@/app/actions";
import ConfirmDialog, { DialogSubmit } from "@/components/confirm-dialog";

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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
  const [deleteState, deleteAction] = useActionState(handleDelete, initial);

  const nextStatus = member.status === "active" ? "suspended" : "active";
  const canDelete = totalLoans === 0;

  return (
    <section className="card p-5" aria-labelledby="manage-member-heading">
      <h2 id="manage-member-heading" className="font-semibold">
        Manage member
      </h2>

      {lastAction === "update" && updateState.ok && updateState.message && (
        <p role="status" className="mt-2 text-sm text-success">{updateState.message}</p>
      )}

      {editing ? (
        <form action={updateAction} className="mt-4 grid gap-3">
          <input type="hidden" name="id" value={member.id} />

          <label className="grid gap-1 text-sm">
            <span className="label">Full name</span>
            <input
              name="name"
              required
              maxLength={160}
              autoComplete="name"
              defaultValue={member.name}
              className="field w-full"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="label">Email address</span>
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              defaultValue={member.email ?? ""}
              className="field w-full"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="label">Phone number (optional)</span>
            <input
              name="phone"
              inputMode="tel"
              maxLength={20}
              autoComplete="tel"
              defaultValue={member.phone ?? ""}
              className="field w-full"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="label">Address (optional)</span>
            <textarea
              name="address"
              rows={3}
              maxLength={500}
              autoComplete="street-address"
              defaultValue={member.address ?? ""}
              className="field w-full"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="label">Borrowing limit (books)</span>
            <input
              name="loanLimit"
              type="number"
              min={0}
              max={maxLoanLimit}
              required
              defaultValue={member.loanLimit}
              className="field w-full"
            />
            <span className="hint">
              Set to 0 to pause new loans. The system maximum is{" "}
              {maxLoanLimit}.
            </span>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="label">Membership status</span>
            <select
              name="status"
              defaultValue={member.status}
              className="field w-full"
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="expired">Expired</option>
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              disabled={updating}
              className="btn btn-primary"
            >
              {updating ? "Saving..." : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>

          {updateState.message && !updateState.ok && (
            <p role="alert" className="text-sm text-danger">{updateState.message}</p>
          )}
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn btn-sm btn-secondary"
          >
            Edit details
          </button>

          <form action={statusAction}>
            <input type="hidden" name="id" value={member.id} />
            <input type="hidden" name="status" value={nextStatus} />
            <button
              disabled={statusPending}
              className="btn btn-sm btn-secondary"
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
              className="btn btn-sm btn-secondary"
            >
              {renewing ? "Renewing..." : "Renew membership"}
            </button>
          </form>
        </div>
      )}

      {lastAction === "renew" && renewState.message && (
        <p
          role={renewState.ok ? "status" : "alert"}
          className={`mt-2 text-sm ${
            renewState.ok ? "text-success" : "text-danger"
          }`}
        >
          {renewState.message}
        </p>
      )}

      {lastAction !== "renew" && membershipMonths > 0 && !editing && (
        <p className="mt-2 text-xs text-muted">
          Renewing extends membership by {membershipMonths}{" "}
          {membershipMonths === 1 ? "month" : "months"} from the current expiry
          date.
        </p>
      )}

      {lastAction === "status" && statusState.message && (
        <p
          role={statusState.ok ? "status" : "alert"}
          className={`mt-2 text-sm ${
            statusState.ok ? "text-success" : "text-danger"
          }`}
        >
          {statusState.message}
        </p>
      )}

      <div className="mt-4 border-t pt-4">
        {canDelete ? (
          <>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="btn btn-sm btn-danger"
            >
              Delete member
            </button>

            {confirmingDelete && (
              <ConfirmDialog
                title={`Delete ${member.name}?`}
                description="This removes the member record permanently. This cannot be undone."
                onClose={() => setConfirmingDelete(false)}
              >
                <form action={deleteAction} className="contents">
                  <input type="hidden" name="id" value={member.id} />
                  <DialogSubmit pendingLabel="Deleting...">
                    Delete member
                  </DialogSubmit>
                </form>
              </ConfirmDialog>
            )}
          </>
        ) : (
          <div>
            <button
              type="button"
              disabled
              className="btn btn-sm btn-danger"
            >
              Delete member
            </button>
            <p className="mt-1 text-xs text-muted">
              {openLoans > 0
                ? "Return all borrowed books before deleting this member."
                : "Borrowing history must be kept, so this member cannot be deleted. Suspend the membership instead."}
            </p>
          </div>
        )}

        {lastAction === "delete" && deleteState.message && !deleteState.ok && (
          <p role="alert" className="mt-2 text-sm text-danger">{deleteState.message}</p>
        )}
      </div>
    </section>
  );
}
