import { buildReport, isReportId } from "@/lib/reports";
import { renderReportExcel } from "@/lib/report-excel";
import { renderReportPdf } from "@/lib/report-pdf";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getLibraryIdentity } from "@/lib/settings";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasPermission(user, "reports.export")) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const url = new URL(request.url);
  const report = url.searchParams.get("report") ?? "";
  const format = url.searchParams.get("format") ?? "";

  if (!isReportId(report)) {
    return Response.json({ error: "Unknown report." }, { status: 400 });
  }
  if (format !== "pdf" && format !== "xlsx") {
    return Response.json(
      { error: "Specify format=pdf or format=xlsx." },
      { status: 400 }
    );
  }

  try {
    const [data, identity] = await Promise.all([
      buildReport(report, {
        start: url.searchParams.get("start") ?? undefined,
        end: url.searchParams.get("end") ?? undefined,
        category: url.searchParams.get("category") ?? undefined,
        q: url.searchParams.get("q") ?? undefined,
        period: url.searchParams.get("period") ?? undefined,
      }),
      getLibraryIdentity(),
    ]);

    const branding = {
      name: identity.name,
      logoDataUrl: identity.logoDataUrl,
    };

    const bytes =
      format === "pdf"
        ? await renderReportPdf(data, branding)
        : await renderReportExcel(data, branding);

    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type":
          format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${data.filenameBase}.${format}"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Report export failed:", error);
    return Response.json(
      { error: "The report could not be generated." },
      { status: 500 }
    );
  }
}
