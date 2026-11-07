import { redirect } from "next/navigation";
import { connection } from "next/server";
import sql from "@/db";
import AuthShell from "../auth-shell";
import { SetupForm } from "../auth-forms";

export const metadata = {
  title: "First-run setup",
};

// every request needs the session cookie before any data is read
export const instant = false;

export default async function SetupPage() {
  await connection();

  const [counts] = await sql<{ count: number }[]>`
    select count(*)::int as count from users
  `;
  if (counts.count > 0) redirect("/login");

  const tokenConfigured = Boolean(process.env.AUTH_SETUP_TOKEN?.trim());

  return (
    <AuthShell
      title="First-run setup"
      subtitle="Create the initial Super Administrator for this library."
    >
      <SetupForm tokenConfigured={tokenConfigured} />
    </AuthShell>
  );
}
