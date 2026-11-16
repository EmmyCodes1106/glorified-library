import { Suspense } from "react";
import { connection } from "next/server";
import { requirePagePermission } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { PageIntro } from "@/components/ui";
import {
  CirculationSkeleton,
  CirculationView,
} from "../circulation/page";

export const metadata = {
  title: "Returns",
};

// every request needs the session cookie before any data is read
export const instant = false;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const user = await requirePagePermission("circulation.read");
  const canCirculate = hasPermission(user, "circulation.manage");
  const params = await searchParams;
  const withStatus = params.status ? params : { ...params, status: "returned" };

  return (
    <div className="space-y-6">
      <PageIntro>
        Record returned books and review completed loans, with any late
        returns highlighted.
      </PageIntro>

      <Suspense fallback={<CirculationSkeleton />}>
        <CirculationView
          searchParams={Promise.resolve(withStatus)}
          canCirculate={canCirculate}
          basePath="/returns"
        />
      </Suspense>
    </div>
  );
}
