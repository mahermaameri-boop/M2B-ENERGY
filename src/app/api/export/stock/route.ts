import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { getProfil } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nombre avec virgule décimale, sans séparateur de milliers.
function num(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "";
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",");
}

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const p = await getProfil();
  if (p?.role !== "admin") return new NextResponse("Interdit", { status: 403 });

  const url = new URL(req.url);
  const dateCible = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  const supabase = createClient();

  const [{ data: articlesData }, { data: mouvData }, { data: prixData }] =
    await Promise.all([
      supabase
        .from("articles")
        .select("id, reference, designation, categorie")
        .eq("actif", true)
        .eq("compose", false)
        .order("categorie")
        .order("designation"),
      supabase.from("mouvements_stock").select("article_id, quantite, date"),
      supabase.from("vue_dernier_prix").select("article_id, dernier_prix"),
    ]);

  // Stock à la date : somme des mouvements dont date <= date choisie (jour inclus).
  const stock = new Map<string, number>();
  for (const m of (mouvData as any[]) ?? []) {
    const jour = String(m.date).slice(0, 10);
    if (jour > dateCible) continue;
    stock.set(m.article_id, (stock.get(m.article_id) ?? 0) + Number(m.quantite || 0));
  }

  const prix = new Map<string, number>();
  for (const pr of (prixData as any[]) ?? []) prix.set(pr.article_id, Number(pr.dernier_prix));

  const entetes = [
    "Référence",
    "Désignation",
    "Catégorie",
    "Stock",
    "Dernier prix d'achat",
    "Valeur",
  ];

  let totValeur = 0;
  const lignes = ((articlesData as any[]) ?? []).map((a) => {
    const q = stock.get(a.id) ?? 0;
    const pu = prix.has(a.id) ? prix.get(a.id)! : null;
    const valeur = pu != null ? q * pu : null;
    if (valeur != null) totValeur += valeur;
    return [
      a.reference ?? "",
      a.designation ?? "",
      a.categorie ?? "",
      q,
      pu === null ? "" : pu,
      valeur === null ? "" : valeur,
    ] as (string | number)[];
  });

  const total: (string | number)[] = ["TOTAL", "", "", "", "", totValeur];

  const nomFichier = `stock_${dateCible}`;

  if (format === "xlsx") {
    const aoa: (string | number)[][] = [entetes, ...lignes, total];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nomFichier}.xlsx"`,
      },
    });
  }

  // CSV : colonnes 0..2 textuelles, 3..5 numériques.
  const corps = [entetes, ...lignes, total]
    .map((row, idx) => {
      if (idx === 0) return row.map(csvCell).join(";");
      return row
        .map((v, i) =>
          i >= 3
            ? csvCell(num(typeof v === "number" ? v : v === "" ? null : Number(v)))
            : csvCell(v),
        )
        .join(";");
    })
    .join("\r\n");
  const csv = "﻿" + corps;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomFichier}.csv"`,
    },
  });
}
