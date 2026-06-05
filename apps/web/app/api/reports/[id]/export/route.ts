import { NextResponse } from "next/server";
import { createMockReport, exportMockReport } from "../../../../../lib/mock-report";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const report = createMockReport();
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const { id } = await params;

  if (id !== report.id) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const body = exportMockReport(format);
  const contentType = format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";

  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${report.id}.${format}"`
    }
  });
}
