import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import sql from "@/db";
import { sendLoggedEmail } from "@/lib/email";

export type Purpose = "login" | "reset";
export type SendCodeResult = "sent" | "cooldown" | "failed";
const TTL_MIN = 10, MAX_ATTEMPTS = 5, COOLDOWN_SEC = 60;

const h = (c: string) =>
  createHash("sha256").update(c + process.env.OTP_SECRET!).digest("hex");

export async function sendCode(
  email: string,
  purpose: Purpose
): Promise<SendCodeResult> {
  const [last] = await sql`
    select created_at from auth_codes
    where email = ${email} and purpose = ${purpose}
    order by created_at desc limit 1`;
  if (last && Date.now() - new Date(last.created_at).getTime() < COOLDOWN_SEC * 1000) {
    return "cooldown";
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const [row] = await sql`
    insert into auth_codes (email, purpose, code_hash, expires_at)
    values (${email}, ${purpose}, ${h(code)}, now() + make_interval(mins => ${TTL_MIN}))
    returning id`;

  const result = await sendLoggedEmail({
    to: email,
    subject: purpose === "reset" ? "Reset your password" : "Your sign-in code",
    text: `Your Glorified Library code is ${code}. It expires in ${TTL_MIN} minutes. If you didn't ask for this, ignore this email.`,
    purpose: purpose === "reset" ? "password_reset_code" : "login_code",
  });

  // If delivery failed, drop the code so the 60-second cooldown doesn't block a retry
  if (result.status !== "sent") {
    await sql`delete from auth_codes where id = ${row.id}`;
    return "failed";
  }
  return "sent";
}

export async function verifyCode(email: string, purpose: Purpose, code: string) {
  const [row] = await sql`
    select id, code_hash, attempts from auth_codes
    where email = ${email} and purpose = ${purpose}
      and used_at is null and expires_at > now()
    order by created_at desc limit 1`;
  if (!row || row.attempts >= MAX_ATTEMPTS) return false;

  await sql`update auth_codes set attempts = attempts + 1 where id = ${row.id}`;
  const a = Buffer.from(row.code_hash), b = Buffer.from(h(code));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  const used = await sql`
    update auth_codes set used_at = now()
    where id = ${row.id} and used_at is null returning id`;
  return used.length === 1;
}