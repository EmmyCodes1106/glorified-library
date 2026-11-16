"use client";
import Link from "next/link";
import { useActionState } from "react";
import { verifyLoginCodeAction } from "@/app/otp-actions";

export default function VerifyForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(verifyLoginCodeAction, { message: "" });
  return (
    <form action={action}>
      <h1>Enter your code</h1>
      <p>If {email} can sign in, we sent a 6-digit code to it.</p>
      <input type="hidden" name="email" value={email} />
      <input name="code" inputMode="numeric" autoComplete="one-time-code"
             maxLength={6} pattern="\d{6}" required autoFocus />
      {state.message && <p role="alert">{state.message}</p>}
      <button disabled={pending}>{pending ? "Checking…" : "Sign in"}</button>
      <p><Link href="/login/code">Send a new code</Link></p>
    </form>
  );
}