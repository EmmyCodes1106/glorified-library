import sql from "@/db";

export async function GET() {
  const books = await sql`
    select
      b.id,
      b.title,
      b.year,
      a.name as author,
      (l.id is not null) as on_loan,
      to_char(l.due_on, 'YYYY-MM-DD') as due_on
    from books b
    join authors a on a.id = b.author_id
    left join loans l on l.book_id = b.id and l.returned_on is null
    order by b.title
  `;

  return Response.json(books);
}