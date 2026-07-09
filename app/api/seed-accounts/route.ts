import { NextRequest, NextResponse } from "next/server";
import { sillage, type TopAccount } from "@/lib/sillage-client";
import { saveJSON } from "@/lib/memory-store";
import type { LinkedInRow } from "@/lib/csv-parser";

/**
 * Step 1.5 — Track the donors in Sillage (accounts only, no persona yet).
 *
 * PEOPLE-FIRST: we resolve each donor as a Sillage lead (to confirm identity),
 * then push BOTH the person's LinkedIn URL and their company/foundation as top
 * accounts so ingestion surfaces THEIR posts/comments — falling back to the
 * company when the person can't be resolved. We deliberately do NOT push a
 * persona here — the persona is built later from Claude's analysis and pushed
 * once, perfected.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { rows: LinkedInRow[] };
    if (!body.rows || !Array.isArray(body.rows)) {
      return NextResponse.json({ error: "Body must include 'rows'." }, { status: 400 });
    }

    const log: string[] = [];
    // Persist rows so harvest/signals can build realistic mock fallbacks.
    saveJSON("latest_rows", { rows: body.rows });

    // 1) Resolve donors as leads (people-first). Best-effort — don't block on it.
    const withUrls = body.rows.filter((r) => r.linkedinUrl).slice(0, 50);
    let leadsResolved = 0;
    log.push(`Resolving ${withUrls.length} donors as Sillage leads…`);
    await Promise.all(
      withUrls.map(async (r) => {
        try {
          await sillage.getLead(r.linkedinUrl);
          leadsResolved++;
        } catch {
          /* lead not resolvable — we still track their company below */
        }
      })
    );
    log.push(`${leadsResolved}/${withUrls.length} donors resolved as leads.`);

    // 2) Build a people-first account payload: each donor's LinkedIn URL plus
    //    their company/foundation. De-dupe companies so we don't double-push.
    const seenCompanies = new Set<string>();
    const accounts: TopAccount[] = [];
    for (const r of withUrls) {
      accounts.push({ linkedin_url: r.linkedinUrl, name: r.fullName });
    }
    for (const r of body.rows) {
      const company = r.company?.trim();
      if (company && !seenCompanies.has(company.toLowerCase())) {
        seenCompanies.add(company.toLowerCase());
        accounts.push({ name: company });
      }
    }
    const cappedAccounts = accounts.slice(0, 100);

    log.push(
      `Seeding ${cappedAccounts.length} accounts (${withUrls.length} people + ${seenCompanies.size} companies) to Sillage…`
    );
    await sillage.addTopAccounts(cappedAccounts);
    log.push("Accounts pushed. Ingestion started in the background.");
    const accounts_pushed = cappedAccounts.length;
    const uniqueCompanies = [...seenCompanies];

    // Brief, non-blocking status check.
    let ingestionStatus;
    try {
      ingestionStatus = await sillage.pollIngestionUntilDone(3000, 2);
      log.push(`Ingestion status: ${ingestionStatus.state}`);
    } catch {
      ingestionStatus = { state: "processing", total: accounts.length, resolved: 0, failed: 0 };
      log.push("Ingestion still processing — content will surface shortly.");
    }

    return NextResponse.json({
      ok: true,
      log,
      accounts_pushed,
      leads_resolved: leadsResolved,
      companies: uniqueCompanies,
      ingestion_status: ingestionStatus,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
