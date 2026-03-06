import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

interface CsvScoreRow {
  score: number | null;
  tier: string | null;
  reasoning: string | null;
  contacts: {
    name?: string | null;
    company_name?: string | null;
    email?: string | null;
  } | null;
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET() {
  const { data, error } = await supabaseServer
    .from("icp_scores")
    .select("score,tier,reasoning,contacts(name,company_name,email)")
    .order("scored_at", { ascending: false })
    .limit(1000);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const header = ["name", "company", "email", "score", "tier", "reasoning"];
  const rows = ((data ?? []) as CsvScoreRow[]).map((row) => [
    row.contacts?.name ?? "",
    row.contacts?.company_name ?? "",
    row.contacts?.email ?? "",
    row.score ?? "",
    row.tier ?? "",
    row.reasoning ?? "",
  ]);

  const csv = [header, ...rows]
    .map((line) => line.map(csvEscape).join(","))
    .join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leads.csv"',
    },
  });
}
