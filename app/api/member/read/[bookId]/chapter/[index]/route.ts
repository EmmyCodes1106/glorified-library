import { loadChapter } from "@/lib/ebooks";
import {
  READING_HEADERS,
  authoriseReading,
  parseId,
} from "@/lib/member-reading";

type Params = { params: Promise<{ bookId: string; index: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { bookId, index } = await params;
  const access = await authoriseReading(parseId(bookId));
  if (!access.ok) {
    return Response.json(
      { error: access.error },
      { status: access.status, headers: READING_HEADERS }
    );
  }

  const chapterIndex = parseId(index);
  if (chapterIndex === null) {
    return Response.json(
      { error: "That chapter does not exist." },
      { status: 404, headers: READING_HEADERS }
    );
  }

  const chapter = await loadChapter(
    access.access.bookId,
    access.access.file,
    chapterIndex
  );
  if (!chapter.ok) {
    return Response.json(
      { error: chapter.error },
      { status: 404, headers: READING_HEADERS }
    );
  }

  return Response.json(
    {
      html: chapter.html,
      chapter: chapterIndex,
      chapterCount: chapter.chapterCount,
      title: access.access.title,
      author: access.access.author,
      dueOn: access.access.dueOn,
      member: {
        name: access.member.name,
        code: access.member.memberCode,
      },
    },
    { headers: READING_HEADERS }
  );
}
