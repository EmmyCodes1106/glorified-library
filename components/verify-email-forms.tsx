"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { ArrowRight, MailCheck } from "lucide-react";
import {
  confirmEmailAction,
  requestVerificationEmailAction,
  type VerifyEmailState,
} from "@/app/email-verification-actions";

const initial: VerifyEmailState = { message: "" };
type AccountType = "staff" | "member";

function Message({ state }: { state: VerifyEmailState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`rounded-lg border p-3 text-sm ${
        state.ok
          ? "border-success/30 bg-success-soft text-success"
          : "border-danger/30 bg-danger-soft text-danger"
      }`}
    >
      {state.message}
    </p>
  );
}

export function EmailVerificationForm({
  initialEmail = "",
  accountType = "staff",
  allowAccountTypeChange = false,
}: {
  initialEmail?: string;
  accountType?: AccountType;
  allowAccountTypeChange?: boolean;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [selectedType, setSelectedType] = useState(accountType);
  const [code, setCode] = useState("");
  const [lastSubmission, setLastSubmission] = useState<"confirm" | "resend" | null>(null);
  const [confirmState, confirmAction, confirming] = useActionState(
    confirmEmailAction,
    initial
  );
  const [resendState, resendAction, resending] = useActionState(
    requestVerificationEmailAction,
    initial
  );
  const hintId = useId();
  const accountHintId = useId();
  const pending = confirming || resending;

  if (confirmState.ok) {
    return (
      <div className="grid gap-4">
        <Message state={confirmState} />
        {confirmState.nextHref && (
          <Link href={confirmState.nextHref} className="btn btn-secondary w-full">
            <ArrowRight size={15} aria-hidden="true" />
            {confirmState.nextLabel ?? "Continue"}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <form
        action={confirmAction}
        onSubmit={() => setLastSubmission("confirm")}
        className="grid gap-4"
      >
        <p className="text-sm text-muted">
          Enter the six-digit verification code emailed to you to confirm your
          {selectedType === "member" ? " member" : " staff"} account.
        </p>
        <label className="grid gap-1 text-sm">
          <span className="label">Email address</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            maxLength={254}
            autoFocus={!initialEmail}
            value={email}
            readOnly={pending}
            onChange={(event) => {
              setEmail(event.target.value);
              setCode("");
              setLastSubmission(null);
            }}
            className="field w-full"
          />
        </label>
        {allowAccountTypeChange ? (
          <label className="grid gap-1 text-sm">
            <span className="label">Account type</span>
            <select
              name="accountType"
              value={selectedType}
              disabled={pending}
              aria-describedby={accountHintId}
              onChange={(event) => {
                setSelectedType(event.target.value === "member" ? "member" : "staff");
                setCode("");
                setLastSubmission(null);
              }}
              className="field w-full"
            >
              <option value="staff">Staff account</option>
              <option value="member">Member account</option>
            </select>
            <span id={accountHintId} className="hint">
              Staff and member accounts are verified separately, even if they use
              the same email address.
            </span>
          </label>
        ) : (
          <input type="hidden" name="accountType" value={selectedType} />
        )}
        <label className="grid gap-1 text-sm">
          <span className="label">Six-digit verification code</span>
          <input
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            required
            autoFocus={Boolean(initialEmail)}
            aria-describedby={hintId}
            value={code}
            readOnly={pending}
            onChange={(event) => setCode(event.target.value)}
            className="field w-full"
          />
        </label>
        <p id={hintId} className="hint">
          Codes expire after 10 minutes. Check your spam folder if the email
          hasn&apos;t arrived. Wait 60 seconds before requesting another code.
        </p>
        {lastSubmission === "confirm" && <Message state={confirmState} />}
        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          <MailCheck size={15} aria-hidden="true" />
          {confirming ? "Confirming..." : "Confirm email address"}
        </button>
      </form>
      <form
        action={resendAction}
        onSubmit={() => setLastSubmission("resend")}
        className="grid gap-4"
      >
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="accountType" value={selectedType} />
        {lastSubmission === "resend" && <Message state={resendState} />}
        <button
          type="submit"
          disabled={pending || !email.trim()}
          aria-describedby={hintId}
          className="btn btn-secondary w-full"
        >
          {resending ? "Sending..." : "Send / resend verification code"}
        </button>
      </form>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
        <Link
          href="/login"
          className="text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          Staff sign in
        </Link>
        <Link
          href="/member/login"
          className="text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          Member sign in
        </Link>
      </div>
    </div>
  );
}
