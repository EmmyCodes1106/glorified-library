import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/member-auth/dal";
import { getPortalMember } from "@/lib/member-portal";
import { PageIntro } from "@/components/ui";
import { MemberStatusBadge } from "@/components/member-status";
import {
  MemberContactForm,
  MemberPasswordForm,
} from "@/components/member-profile-forms";

export const metadata = {
  title: "Profile",
};

// every request needs the member session cookie before any data is read
export const instant = false;

function ProfileSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="skeleton h-8 w-48" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card h-96" />
        <div className="card h-96" />
      </div>
    </div>
  );
}

async function ProfileView() {
  const session = await requireMember();
  const member = await getPortalMember(session.id);
  if (!member) notFound();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="break-words text-2xl font-semibold tracking-tight">
            {member.name}
          </h2>
          <MemberStatusBadge status={member.status} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {member.member_code} · Member since {member.joined}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <section className="card p-5" aria-labelledby="contact-heading">
            <h3 id="contact-heading" className="font-semibold">
              Contact details
            </h3>
            <p className="mt-1 text-sm text-muted">
              Keep your name, phone and address up to date for library notices.
            </p>
            <div className="mt-4">
              <MemberContactForm
                name={member.name}
                email={member.email}
                phone={member.phone}
                address={member.address}
              />
            </div>
          </section>

          <section className="card p-5" aria-labelledby="password-heading">
            <h3 id="password-heading" className="font-semibold">
              Password
            </h3>
            <p className="mt-1 text-sm text-muted">
              Changing your password signs out other portal sessions.
            </p>
            <div className="mt-4">
              <MemberPasswordForm />
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="card p-5" aria-labelledby="membership-heading">
            <h2 id="membership-heading" className="font-semibold">
              Membership
            </h2>
            <dl className="mt-3 grid gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Member ID</dt>
                <dd className="font-medium">{member.member_code}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Status</dt>
                <dd className="mt-1">
                  <MemberStatusBadge status={member.status} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Registered</dt>
                <dd>{member.joined}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Membership expiry</dt>
                <dd
                  className={
                    member.status === "expired"
                      ? "font-medium text-danger"
                      : ""
                  }
                >
                  {member.expires ?? "No expiry"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Borrowing limit</dt>
                <dd>
                  {member.loan_limit}{" "}
                  {member.loan_limit === 1 ? "book" : "books"} at a time
                </dd>
              </div>
            </dl>
            {member.status !== "active" && (
              <p className="mt-3 rounded-lg border border-warning/25 bg-warning-soft p-2 text-xs text-warning">
                {member.status === "expired"
                  ? `Your membership ${
                      member.expires ? `expired on ${member.expires}` : "has expired"
                    }. Contact the library to renew it.`
                  : "Your membership is suspended. Contact the library to reactivate it."}
              </p>
            )}
          </section>

          <section className="card p-5" aria-labelledby="portal-heading">
            <h2 id="portal-heading" className="font-semibold">
              Portal account
            </h2>
            <dl className="mt-3 grid gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Sign-in email</dt>
                <dd className="break-words">{member.email ?? "Not provided"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Portal opened</dt>
                <dd>{member.portal_registered ?? "Not recorded"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Last sign-in</dt>
                <dd>{member.portal_last_login ?? "First visit"}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">
              To change the email address linked to your membership, speak to
              library staff.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default async function MemberProfilePage() {
  await connection();

  return (
    <div className="space-y-6">
      <PageIntro>
        Your membership details and the information the library keeps on file.
      </PageIntro>
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileView />
      </Suspense>
    </div>
  );
}
