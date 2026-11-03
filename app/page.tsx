import { Suspense } from "react";
import Link from "next/link";
import sql from "@/db";
import AddBookForm from "./add-book-form";
import BookActions from "./book-actions";

async function BookList() {
  const books = await sql`
    select
      b.id,
      b.title,
      b.year,
      a.name as author,
      m.name as borrower,
      to_char(l.due_on, 'DD Mon YYYY') as due
    from books b
    join authors a on a.id = b.author_id
    left join loans l on l.book_id = b.id and l.returned_on is null
    left join members m on m.id = l.member_id
    order by b.title
  `;

  const members = await sql`select id, name from members order by name`;
  const memberOptions = members.map((m) => ({ id: m.id, name: m.name }));

  return (
    <ul className="divide-y rounded border">
      {books.map((book) => (
        <li key={book.id} className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{book.title}</p>
              <p className="text-sm text-gray-500">
                {book.author} · {book.year}
              </p>
            </div>
            {book.borrower ? (
              <span className="text-right text-sm text-orange-600">
                On loan to {book.borrower}, due {book.due}
              </span>
            ) : (
              <span className="text-right text-sm text-green-600">
                Available
              </span>
            )}
          </div>
          <BookActions
            id={book.id}
            title={book.title}
            author={book.author}
            year={book.year}
            onLoan={Boolean(book.borrower)}
            members={memberOptions}
          />
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Glorified Library Manager</h1>
        <Link href="/members" className="underline">
          Members
        </Link>
      </div>
      <AddBookForm />
      <Suspense fallback={<p>Loading books...</p>}>
        <BookList />
      </Suspense>
    </main>
  );
}
