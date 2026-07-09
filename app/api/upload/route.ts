import { NextRequest, NextResponse } from "next/server";
import { parseLinkedInCSV } from "@/lib/csv-parser";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded. Use multipart field name 'file'." }, { status: 400 });
    }

    const text = await (file as File).text();
    const result = parseLinkedInCSV(text);

    return NextResponse.json({
      ok: true,
      filename: (file as File).name,
      total_raw: result.totalRaw,
      valid_rows: result.rows.length,
      skipped: result.skipped,
      warnings: result.warnings,
      preview: result.rows.slice(0, 5),
      rows: result.rows,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
