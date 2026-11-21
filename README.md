This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Notification email and scheduling

Notification events (borrow/return confirmations, due reminders, overdue notices,
suspension notices and the daily administrator alert) are stored in the
`notifications` table and shown under `/notifications`. Email is delivered over
SMTP from a Gmail account using an App Password; no simulated delivery is used.
If SMTP is not configured, each notification is recorded with a `skipped` email
status and the reason is kept in the history.

Required environment variables:

| Variable | Purpose |
| --- | --- |
| `SMTP_HOST` | SMTP server, defaults to `smtp.gmail.com`. |
| `SMTP_PORT` | SMTP port, defaults to `465` (TLS). |
| `SMTP_USER` | Gmail address used to send mail. |
| `SMTP_PASS` | Google App Password for that account (requires 2-Step Verification). |
| `EMAIL_FROM` | Sender shown to recipients, must be `SMTP_USER`, e.g. `Glorified Library <you@gmail.com>`. |
| `APP_URL` | Public base URL used in staff password-reset links. |
| `NOTIFICATION_CRON_SECRET` | Bearer token for the scheduled endpoint. |
| `CRON_SECRET` | Alternative token; Vercel Cron sends it automatically. |

Create the App Password at <https://myaccount.google.com/apppasswords>; the
option only appears after 2-Step Verification is enabled. Gmail rejects the
normal account password with `535-5.7.8 Username and Password not accepted`.

If delivery fails with a certificate error (`self-signed certificate in
certificate chain`), an antivirus mail scanner is intercepting SMTP. Turn off
its Mail Shield for this machine or add an exclusion for the Node.js process;
the app deliberately does not disable TLS verification.

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
psql "$DATABASE_URL" -f db/email-verification.sql
psql "$DATABASE_URL" -f db/email-verification-otp.sql
psql "$DATABASE_URL" -f db/auth-codes.sql
psql "$DATABASE_URL" -f db/member-password-requests.sql
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
`/verify-email`, `/account` (profile, password, active sessions), `/users`
(staff), `/audit` and `/audit/email`.

### Email verification

New staff registrations and member portal sign-ups receive a six-digit email
verification code and immediately show a code-entry form. Codes expire after
10 minutes, are single-use, and allow at most five attempts. Only salted scrypt
hashes are stored. Resending replaces the old code, with a 60-second cooldown
and a five-code hourly limit per account. Public verification also limits
requests by network. Codes are never returned to the browser or recorded in
logs. Staff accounts still need Super Administrator approval after verification.

`/verify-email?type=staff` and `/verify-email?type=member` support entering or
resending codes later. Super Administrators can also resend from `/users`.
Existing verified accounts stay verified. Old confirmation links are no longer
accepted; request a code instead.

For an existing installation, apply only the additive OTP migration:

```bash
psql "$DATABASE_URL" -f db/email-verification-otp.sql
```

Do not rerun `db/email-verification.sql` on an existing installation: its
initial backfill marks existing accounts verified.

Every auth email (verification codes and password reset codes) is sent through
Gmail SMTP and recorded in `email_log`. Super Administrators can review Sent / Skipped /
Failed attempts, including the provider response, under `/audit/email`. When
email is unconfigured the staff reset flow still works: Super Administrators can
issue a one-time reset link from `/users` and share it securely.

### Member portal passwords

Members reset their own portal password from `/member/forgot-password`. The app
emails a six-digit code (10-minute expiry, 60-second resend cooldown, five
attempts) through Gmail SMTP; entering it with a new password updates
`members.password_hash`, clears failed-login counters, revokes every open portal
session and records `member.portal_password_reset` in the audit log. No staff
approval is involved. Super Administrators can still set a temporary password
from `/members/[id]` as a fallback when a member cannot receive email; that path
also resolves any older `member_password_requests` rows.

### Book metadata lookup

The Add Book form (on `/` and `/dashboard`) can look up titles on
[Open Library](https://openlibrary.org) — search by title, author or ISBN,
pick a result, and the form is prefilled with title, author, year, ISBN and
description, with the cover downloaded from Open Library's cover service when
the book is saved. Saving still runs through the normal `addBook` validation,
so the existing ISBN duplicate protection and cover rules apply. Covers are
only fetched from `covers.openlibrary.org` (see `lib/open-library.ts`). No
API key is required.

Note for local development behind antivirus TLS filtering (for example Avast
Web Shield): outbound HTTPS from Node fails because the filter's root CA is
not in Node's bundled trust store. Start the dev server with the system trust
store:

```bash
NODE_OPTIONS=--use-system-ca npm run dev
```

### Bulk import from Open Library

Super administrators can fill the catalogue from **Administration → Bulk
import** (`/import`) instead of typing books one at a time. A run matches
either an Open Library subject (e.g. "African literature") or a free-text
search query, pulls up to 200 results, and adds each new book with **5
copies** and its cover image. Books already in the catalogue are skipped by
Open Library work key or ISBN, subject runs create/assign the matching
category, and a run can be stopped at any time without losing what was
already added. Each batch is recorded in the audit trail as
`book.bulk_imported`.

"All books" is not importable in one go: Open Library holds tens of millions
of works and its search API stops deep paging at about 10,000 results per
query. Import in slices instead. The importer is limited to `super_admin`
accounts; other roles do not see the navigation entry and are redirected to
`/forbidden`. The `books.open_library_key` column comes from
`db/book-import.sql`.

### Digital copies (read online)

Staff with `books.manage` can attach one EPUB to any title from its card on
the inventory page (**Digital copy → Choose EPUB**). Uploaded files are
validated as EPUBs and stored in `storage/ebooks/`, outside the web root, so
there is no public URL to fetch them. Replacing a file deletes the previous
one; deleting the book deletes its file too. Uploads and removals are
audited as `book.ebook_uploaded` and `book.ebook_removed`.

Members read a digital copy from **My loans → Read online**
(`/member/read/<bookId>`). The reader streams one chapter at a time from
`/api/member/read/...`; both chapter and image routes re-check, on every
request, that the signed-in member has an unreturned loan for that exact
book and an active membership. Chapter HTML is sanitised on the server
(scripts, styles, external links and remote images are stripped), images come
from an index into the EPUB manifest, every page carries the member's name
and member code, and responses are `no-store`. When the loan is returned — or
the digital copy is removed — the next request is refused, so access ends
without any separate revocation step.

Two honest limits: this is not DRM (a determined member can still copy text
already shown in their browser), and Open Library metadata carries no
reading rights. Only upload EPUBs the library owns or that are public domain
(for example Project Gutenberg or Internet Archive titles).

Apply the migration first:

```bash
psql "$DATABASE_URL" -f db/ebooks.sql
```

### Public-domain copies from Project Gutenberg

The second panel on **Administration → Bulk import** attaches free reading
copies to catalogue books that have none. For each book it asks Open Library
for the Project Gutenberg numbers recorded on that work (using the stored
`books.open_library_key` when present, otherwise a title/author search that
must match the title closely), then downloads the EPUB from
`www.gutenberg.org` with `gutenberg.pglaf.org` as a fallback mirror. A download
is only attached if it is a real EPUB, parses, and its embedded title matches
the catalogue title; anything else is discarded rather than guessed.

Books are processed in catalogue order, ten per batch, and the panel keeps
running until the chosen number of books has been checked. `public_domain_checks`
remembers each result, so `no-match` titles are not re-scanned and repeated runs
move forward through the catalogue. Failures caused by an unreachable server are
retried on the next run. Attachments store `source = 'gutenberg'`, the Gutenberg
number, the download URL and `rights_basis = 'public_domain'` on `book_files`,
show as "Public domain copy from Project Gutenberg" on the book card, and are
audited as `book.public_domain_attached`. An attached copy behaves exactly like
an upload: the member reader, loan gate and watermark are unchanged.

Coverage is limited by copyright, not by the tool: only works in the public
domain (in practice, published before 1929 in the United States) have a free
edition. Current, in-copyright titles need a licence from a library vendor and
cannot be fetched this way.

```bash
psql "$DATABASE_URL" -f db/ebook-sources.sql
psql "$DATABASE_URL" -f db/public-domain-checks.sql
```

## System settings

Administrators configure the library from `/settings`. Settings live in the
database, so changes apply everywhere without a redeploy: the library name,
metadata titles, contact details, lending limits, fine policy,
membership validity, notification preferences, book categories, opening hours
and general preferences (currency symbol, notice banner).

Apply the migration first:

```bash
psql "$DATABASE_URL" -f db/settings.sql
```

| Section | Stored in | Permission |
| --- | --- | --- |
| Library name, contact details | `library_settings` | `settings.manage` |
| Loan duration, borrowing limits, membership months | `library_settings` / `circulation_settings` | `settings.manage` |
| Fine rate, grace period, enablement | `circulation_settings` | `settings.manage` |
| Notification preferences | `notification_settings` | `notifications.manage` |
| Book categories | `categories` | `books.manage` |
| Opening hours, currency, notice | `library_settings` | `settings.manage` |

Permissions are enforced in the server actions themselves; the page also hides
forms the signed-in user cannot use. Every save validates the input on the
server, records an audit entry and revalidates the affected pages.

Notes:

- Fixed light and dark logos live in `public/library-logo-light.png` and
  `public/library-logo-dark.png`. The UI follows the current theme; exported PDFs
  use the blue light-theme logo. Logo upload and removal are not available.
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
