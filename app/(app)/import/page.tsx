import { redirect } from "next/navigation";
import { connection } from "next/server";
import sql from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { PageIntro } from "@/components/ui";
import BookImporter from "@/components/book-importer";
import PublicDomainFetcher from "@/components/public-domain-fetcher";
import { countBooksToCheck, countBooksWithoutCopy } from "@/lib/public-domain";

export const metadata = {
  title: "Bulk import",
};

// the importers run against the signed-in super administrator
export const instant = false;

export default async function ImportPage() {
  await connection();
  const user = await requireUser();
  if (user.role !== "super_admin") redirect("/forbidden");

  const [missing, pending, [counts]] = await Promise.all([
    countBooksWithoutCopy(),
    countBooksToCheck(),
    sql<{ total: number }[]>`select count(*)::int as total from books`,
  ]);

  return (
    <div className="space-y-6">
      <PageIntro>
        Fill the catalogue from Open Library without typing each book. Each run
        pulls a slice of search results, skips books that already exist, and can
        be stopped at any time.
      </PageIntro>
      <BookImporter />

      <div className="border-t border-line pt-6">
        <PublicDomainFetcher
          missingCount={missing}
          pendingCount={pending}
          totalCount={counts?.total ?? 0}
        />
      </div>
    </div>
  );
}
