import "server-only";

import { createTransport, type Transporter } from "nodemailer";
import sql from "@/db";

const DEFAULT_HOST = "smtp.gmail.com";
const DEFAULT_PORT = 465;

export type EmailPurpose =
  | "staff_verification"
  | "member_verification"
  | "staff_password_reset"
  | "staff_reset_link_issued"
  | "login_code"
  | "password_reset_code";

export type EmailProviderStatus = {
  provider: "Gmail SMTP";
  configured: boolean;
  missing: string[];
};

export type EmailResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export function emailProviderStatus(): EmailProviderStatus {
  const missing: string[] = [];
  if (!process.env.SMTP_USER?.trim()) missing.push("SMTP_USER");
  if (!process.env.SMTP_PASS?.trim()) missing.push("SMTP_PASS");
  if (!process.env.EMAIL_FROM?.trim()) missing.push("EMAIL_FROM");
  return { provider: "Gmail SMTP", configured: missing.length === 0, missing };
}

let transport: Transporter | null = null;

function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT ?? DEFAULT_PORT);
    transport = createTransport({
      host: process.env.SMTP_HOST?.trim() || DEFAULT_HOST,
      port: Number.isInteger(port) ? port : DEFAULT_PORT,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      },
    });
  }
  return transport;
}

function describeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 300);
}

function deliveryHint(error: unknown, message: string) {
  const code = (error as { code?: string }).code;
  if (/certificate/i.test(message)) {
    return " The SMTP server's certificate was not trusted. An antivirus mail scanner is likely intercepting outbound mail; add an exclusion for this app or turn off Mail Shield.";
  }
  if (code === "EAUTH" || /5\.7\.8/.test(message)) {
    return " Gmail rejected the login. SMTP_PASS must be a 16-character Google App Password, not the normal account password.";
  }
  return "";
}

function isTransient(error: unknown) {
  const { code, responseCode } = error as { code?: string; responseCode?: number };
  if (responseCode && [421, 450, 451, 452, 454].includes(responseCode)) {
    return true;
  }
  return ["ETIMEDOUT", "ECONNECTION", "ESOCKET", "EDNS"].includes(code ?? "");
}

// Sends through the configured SMTP account. Without credentials this reports
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

  let lastError = "Gmail SMTP delivery failed.";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await getTransport().sendMail({
        from: process.env.EMAIL_FROM,
        to,
        subject,
        text,
      });
      return { status: "sent" };
    } catch (error) {
      const message = describeError(error);
      lastError = `Gmail SMTP failed: ${message}${deliveryHint(error, message)}`;
      if (!isTransient(error)) break;
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
