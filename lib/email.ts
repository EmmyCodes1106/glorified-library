const RESEND_ENDPOINT = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 8000;

export type EmailProviderStatus = {
  provider: "Resend";
  configured: boolean;
  missing: string[];
};

export type EmailResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export function emailProviderStatus(): EmailProviderStatus {
  const missing: string[] = [];
  if (!process.env.RESEND_API_KEY?.trim()) missing.push("RESEND_API_KEY");
  if (!process.env.EMAIL_FROM?.trim()) missing.push("EMAIL_FROM");
  return { provider: "Resend", configured: missing.length === 0, missing };
}

function describeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 300);
}

// Sends through Resend's HTTP API. Without credentials this reports
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
  const provider = emailProviderStatus();
  if (!provider.configured) {
    return {
      status: "skipped",
      reason: `Email provider is not configured. Set ${provider.missing.join(
        " and "
      )} to enable delivery.`,
    };
  }

  const body = JSON.stringify({
    from: process.env.EMAIL_FROM,
    to: [to],
    subject,
    text,
  });

  let lastError = "Email delivery failed.";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.ok) return { status: "sent" };

      const detail = (await response.text()).trim().slice(0, 300);
      lastError = `Resend returned ${response.status}${
        detail ? `: ${detail}` : ""
      }`;

      // retry throttling and server errors once, not rejected requests
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = `Could not reach Resend: ${describeError(error)}`;
    }

    if (attempt === 1) {
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }

  return { status: "failed", reason: lastError };
}
