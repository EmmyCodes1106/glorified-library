import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import { requireMember } from "@/lib/member-auth/dal";
import { getEbookAccess } from "@/lib/ebooks";
import { EmptyState, PageIntro } from "@/components/ui";
import EbookReader from "@/components/ebook-reader";

export const metadata = {
  title: "Read online",
};

// access depends on the live loan, so this is rendered per request
export const instant = false;

export default async function MemberReaderPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  await connection();
  const { bookId } = await params;
  const id = Number(bookId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const member = await requireMember();
  const access = await getEbookAccess(member.id, id);

  if (!access) {
    return (
      <div className="space-y-6">
        <PageIntro>
          Online reading is tied to a current loan of the same title.
        </PageIntro>
        <EmptyState
          icon={BookOpen}
          title="This title is not available to read right now"
          description={
            member.status === "active"
              ? "Borrow a copy from the library desk, or check that this loan has not been returned yet."
              : "Your membership is not active, so online reading is paused. Contact the library to restore it."
          }
          action={
            <Link href="/member/loans" className="btn btn-sm btn-secondary">
              View my loans
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <EbookReader
      bookId={access.bookId}
      title={access.title}
      author={access.author}
      dueOn={access.dueOn}
    />
  );
}
