import { timingSafeEqual } from "node:crypto";
import { runNotificationCycle } from "@/lib/notifications";

function cronSecret() {
  return (process.env.NOTIFICATION_CRON_SECRET ?? process.env.CRON_SECRET ?? "").trim();
}

function tokenMatches(request: Request, secret: string) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return false;

  const provided = Buffer.from(token);
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

async function handle(request: Request) {
  const secret = cronSecret();
  if (!secret) {
    return Response.json(
      {
        ok: false,
        error:
          "Scheduled notifications are not configured. Set NOTIFICATION_CRON_SECRET (or CRON_SECRET) before calling this endpoint.",
      },
      { status: 503 }
    );
  }

  if (!tokenMatches(request, secret)) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const summary = await runNotificationCycle();
  return Response.json({ ok: true, summary });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
