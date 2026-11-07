import sql from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasPermission(user, "books.read")) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const books = await sql`
    select
      b.id,
      b.book_code,
      b.title,
      b.year,
      a.name as author,
      c.name as category,
      b.isbn,
      b.description,
      b.cover_path,
      b.total_copies,
      b.shelf,
      b.rack,
      coalesce((
        select array_agg(g.name order by g.name)
        from book_genres bg
        join genres g on g.id = bg.genre_id
        where bg.book_id = b.id
      ), '{}') as genres,
      coalesce(l.open_loans, 0)::int as borrowed_copies,
      greatest(b.total_copies - coalesce(l.open_loans, 0), 0)::int
        as available_copies,
      coalesce(l.open_loans, 0) > 0 as on_loan,
      to_char(l.next_due, 'YYYY-MM-DD') as due_on
    from books b
    join authors a on a.id = b.author_id
    left join categories c on c.id = b.category_id
    left join (
      select
        book_id,
        count(*)::int as open_loans,
        min(due_on) as next_due
      from loans
      where returned_on is null
      group by book_id
    ) l on l.book_id = b.id
    order by b.title
  `;

  return Response.json(books);
}
