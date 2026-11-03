import { Suspense } from "react";
import Link from "next/link";
import sql from "@/db";
import AddMemberForm from "./add-member-form";

async function MemberList() {
  const members = await sql`
    select id, name, phone from members order by name
  `;

  return (
    <ul className="divide-y rounded border">
      {members.map((member) => (
        <li key={member.id} className="flex items-center justify-between p-4">
          <p className="font-medium">{member.name}</p>
          <p className="text-sm text-gray-500">{member.phone ?? "No phone"}</p>
        </li>
      ))}
    </ul>
  );
}

export default function MembersPage() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Members</h1>
        <Link href="/" className="underline">
          Books
        </Link>
      </div>
      <AddMemberForm />
      <Suspense fallback={<p>Loading members...</p>}>
        <MemberList />
      </Suspense>
    </main>
  );
}