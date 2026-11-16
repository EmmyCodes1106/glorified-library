import "server-only";

import sql from "@/db";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const REQUEST_TIMEOUT_MS = 8000;

export type EmailPurpose =
  | "staff_verification"
  | "member_verification"
  | "staff_password_reset"
  | "staff_reset_link_issued"
  | "login_code"
  | "password_reset_code";

export type EmailProvider = "Brevo" | "Resend";

export type EmailProviderStatus = {
  provider: EmailProvider;
  configured: boolean;
  missing: string[];
};

export type EmailResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

// Brevo is preferred because its free plan can verify a single sender address,
// while Resend only accepts a tested domain. Resend remains a fallback.
function configuredProvider(): EmailProvider | null {
  if (process.env.BREVO_API_KEY?.trim()) return "Brevo";
  if (process.env.RESEND_API_KEY?.trim()) return "Resend";
  return null;
}

export function emailProviderStatus(): EmailProviderStatus {
  const provider = configuredProvider();
  const missing: string[] = [];
  if (!provider) missing.push("BREVO_API_KEY");
  if (!process.env.EMAIL_FROM?.trim()) missing.push("EMAIL_FROM");
  return {
    provider: provider ?? "Brevo",
    configured: missing.length === 0,
    missing,
  };
}

function parseSender(raw: string) {
  const match = raw.match(/^(.*?)\s*<([^>]+)>\s*$/);
  return match
    ? { name: match[1].trim() || undefined, email: match[2].trim() }
    : { email: raw.trim() };
}

function describeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 300);
}

// Sends through the configured HTTP API. Without credentials this reports
// "skipped" — it never pretends an email was delivered.
export async function sendEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}): Promise<EmailResult> {
  const status = emailProviderStatus();
  if (!status.configured) {
    return {
      status: "skipped",
      reason: `Email provider is not configured. Set ${status.missing.join(
        " and "
      )} to enable delivery.`,
    };
  }

  const from = process.env.EMAIL_FROM!;
  const brevo = status.provider === "Brevo";
  const endpoint = brevo ? BREVO_ENDPOINT : RESEND_ENDPOINT;
  const body = JSON.stringify(
    brevo
      ? { sender: parseSender(from), to: [{ email: to }], subject, textContent: text }
      : { from, to: [to], subject, text }
  );
  const headers: Record<string, string> = brevo
    ? {
        "api-key": process.env.BREVO_API_KEY!,
        "Content-Type": "application/json",
        Accept: "application/json",
      }
    : {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      };

  let lastError = `${status.provider} delivery failed.`;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.ok) return { status: "sent" };

      const detail = (await response.text()).trim().slice(0, 300);
      lastError = `${status.provider} returned ${response.status}${
        detail ? `: ${detail}` : ""
      }`;

      // retry throttling and server errors once, not rejected requests
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = `Could not reach ${status.provider}: ${describeError(error)}`;
    }

    if (attempt === 1) {
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }

  return { status: "failed", reason: lastError };
}

// Every auth-related email is recorded so delivery problems are visible in the
// audit area. Logging failures never interrupt the calling action.
export async function sendLoggedEmail({
  to,
  subject,
  text,
  purpose,
}: {
  to: string;
  subject: string;
  text: string;
  purpose: EmailPurpose;
}): Promise<EmailResult> {
  const result = await sendEmail({ to, subject, text });

  try {
    await sql`
      insert into email_log (recipient, subject, purpose, status, detail)
      values (
        ${to},
        ${subject.slice(0, 300)},
        ${purpose},
        ${result.status},
        ${result.status === "sent" ? null : result.reason.slice(0, 500)}
      )
    `;
  } catch (error) {
    console.error("Email log write failed:", error);
  }

  return result;
}
