"use client";
import { useActionState } from "react";
import { requestLoginCodeAction } from "@/app/otp-actions";

export default function LoginCodePage() {
  const [state, action, pending] = useActionState(requestLoginCodeAction, { message: "" });
  return (
    <form action={action}>
      <h1>Email me a sign-in code</h1>
      <label htmlFor="email">Email address</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      {state.message && <p role="alert">{state.message}</p>}
      <button disabled={pending}>{pending ? "Sending…" : "Send code"}</button>
    </form>
  );
}