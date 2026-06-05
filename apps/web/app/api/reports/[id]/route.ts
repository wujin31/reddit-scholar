import { NextResponse } from "next/server";
import { createMockReport } from "../../../../lib/mock-report";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const report = createMockReport();
  const { id } = await params;

  if (id !== report.id) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json(report);
}
