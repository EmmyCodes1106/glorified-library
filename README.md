This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Notification email and scheduling

Notification events (borrow/return confirmations, due reminders, overdue notices,
suspension notices and the daily administrator alert) are stored in the
`notifications` table and shown under `/notifications`. Email is delivered
through [Resend](https://resend.com); no simulated delivery is used. If the
provider is not configured, each notification is recorded with a `skipped`
email status and the reason is kept in the history.

Required environment variables:

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Resend API key used to send transactional email. |
| `EMAIL_FROM` | Verified sender, e.g. `Glorified Library <notifications@example.com>`. |
| `NOTIFICATION_CRON_SECRET` | Bearer token for the scheduled endpoint. |
| `CRON_SECRET` | Alternative token; Vercel Cron sends it automatically. |

Apply the migration with `psql "$DATABASE_URL" -f db/notifications.sql`.

Scheduled processing runs through `GET`/`POST /api/notifications/run` with
`Authorization: Bearer $NOTIFICATION_CRON_SECRET`. `vercel.json` schedules it
daily at 07:00 UTC. Any external scheduler can call the same endpoint:

```bash
curl -fsS -X POST https://your-app.example/api/notifications/run \
  -H "Authorization: Bearer $NOTIFICATION_CRON_SECRET"
```

Every notification carries a unique dedupe key, so repeated or concurrent runs
never send the same reminder twice.

## Authentication and roles

The app ships its own session-based authentication. Passwords are hashed with
scrypt (Node `crypto`) and never stored or logged in plain text. Sessions are
opaque random tokens kept in an `HttpOnly`, `SameSite=Lax` cookie; only a
SHA-256 hash of each token is stored in the database.

Apply the migration before first use:

```bash
psql "$DATABASE_URL" -f db/auth.sql
```

Then set `AUTH_SETUP_TOKEN` (any long random string) and open `/setup` to create
the first Super Administrator. The setup route refuses to run once a user
exists, and the form requires the configured token. After setup, remove the
variable so no further bootstrap is possible.

| Role | Default access |
| --- | --- |
| Super Administrator | Everything, including staff management and the audit log. |
| Administrator | Books, members, circulation, fines, reports, notifications, settings. |
| Librarian | Read books/fines/reports; manage members and circulation. |

Super administrators can grant or revoke any non-system permission per user;
`users.manage` and `audit.read` are reserved to Super Administrators.
Permissions are re-checked inside every server action and route handler, not
only in the page UI.

Relevant routes: `/login`, `/setup`, `/forgot-password`, `/reset-password`,
`/account` (profile, password, active sessions), `/users` (staff), `/audit`.
Password-reset emails use the same Resend configuration described above and,
when email is unconfigured, Super Administrators can issue a one-time reset link
from `/users`.

## System settings

Administrators configure the library from `/settings`. Settings live in the
database, so changes apply everywhere without a redeploy: the library name,
logo and metadata titles, contact details, lending limits, fine policy,
membership validity, notification preferences, book categories, opening hours
and general preferences (currency symbol, notice banner).

Apply the migration first:

```bash
psql "$DATABASE_URL" -f db/settings.sql
```

| Section | Stored in | Permission |
| --- | --- | --- |
| Library name, logo, contact details | `library_settings` | `settings.manage` |
| Loan duration, borrowing limits, membership months | `library_settings` / `circulation_settings` | `settings.manage` |
| Fine rate, grace period, enablement | `circulation_settings` | `settings.manage` |
| Notification preferences | `notification_settings` | `notifications.manage` |
| Book categories | `categories` | `books.manage` |
| Opening hours, currency, notice | `library_settings` | `settings.manage` |

Permissions are enforced in the server actions themselves; the page also hides
forms the signed-in user cannot use. Every save validates the input on the
server, records an audit entry and revalidates the affected pages.

Notes:

- Logos must be PNG, JPEG or WebP and at most 300 KB; they are stored as a
  base64 data URL and embedded in exported PDFs.
- Fines never accrue retroactively: charges start from the effective date and
  after the configured grace period. Each overdue day is charged once at the
  rate in force when it was accrued.
- A category cannot be deleted while books are assigned to it; reassign or
  recategorise those books first.
- Membership expiry is optional (`0` months means memberships never lapse). An
  active member past their expiry date is shown as expired across the members
  directory, profile and dashboard, and can be renewed from their profile,
  which extends from the current expiry (or today) by the configured months.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
