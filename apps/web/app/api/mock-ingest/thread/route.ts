import { NextResponse } from "next/server";
import { createMockReport } from "../../../../lib/mock-report";

export async function POST() {
  const report = createMockReport();

  return NextResponse.json({
    reportId: report.id,
    reportUrl: `/reports/${report.id}`,
    sourceThreadId: report.source.id
  });
}
