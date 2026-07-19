import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { getProfil } from "@/lib/auth";
import { dateFr } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- Helpers de formatage FR -------------------------------------------------
// Nombre avec virgule décimale, sans séparateur de milliers : "3450" ou "3450,50".
function num(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "";
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",");
}

// Échappement CSV (séparateur « ; »).
function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Premier jour du mois courant (aaaa-mm-jj).
function debutMoisCourant(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function GET(req: Request) {
  const p = await getProfil();
  if (p?.role !== "admin") return new NextResponse("Interdit", { status: 403 });

  const url = new URL(req.url);
  const debut = url.searchParams.get("debut") || debutMoisCourant();
  const fin = url.searchParams.get("fin") || new Date().toISOString().slice(0, 10);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  const supabase = createClient();

  // Chantiers réalisés sur la période (par date prévue).
  const { data: chantiersData } = await supabase
    .from("chantiers")
    .select("id, libelle, date_prevue, clients(nom)")
    .eq("statut", "realise")
    .gte("date_prevue", debut)
    .lte("date_prevue", fin)
    .order("date_prevue", { ascending: true });

  const chantiers = (chantiersData as any[]) ?? [];
  const ids = chantiers.map((c) => c.id);

  // Données complémentaires : composition (mouvements sortie), fournisseurs, marges.
  const [{ data: mouvData }, { data: besoinsData }, { data: margesData }] =
    ids.length === 0
      ? [{ data: [] }, { data: [] }, { data: [] }]
      : await Promise.all([
          supabase
            .from("mouvements_stock")
            .select("chantier_id, quantite, articles(designation)")
            .in("chantier_id", ids)
            .eq("type", "sortie"),
          supabase
            .from("besoins_appro")
            .select("chantier_id, commandes(fournisseurs(nom))")
            .in("chantier_id", ids)
            .not("commande_id", "is", null),
          supabase
            .from("vue_marge_chantier")
            .select("chantier_id, ca, cout_materiel, cout_sous_traitance, marge, marge_pct")
            .in("chantier_id", ids),
        ]);

  // Composition : agrégat « designation ×q » par chantier (somme par désignation).
  const compo = new Map<string, Map<string, number>>();
  for (const m of (mouvData as any[]) ?? []) {
    const des = m.articles?.designation;
    if (!des) continue;
    const q = Math.abs(Number(m.quantite) || 0);
    if (!compo.has(m.chantier_id)) compo.set(m.chantier_id, new Map());
    const inner = compo.get(m.chantier_id)!;
    inner.set(des, (inner.get(des) ?? 0) + q);
  }
  const compoStr = (id: string): string => {
    const inner = compo.get(id);
    if (!inner) return "";
    return Array.from(inner.entries())
      .map(([des, q]) => `${des} ×${num(q)}`)
      .join(", ");
  };

  // Fournisseurs distincts par chantier.
  const fournisseurs = new Map<string, Set<string>>();
  for (const b of (besoinsData as any[]) ?? []) {
    const nom = b.commandes?.fournisseurs?.nom;
    if (!nom) continue;
    if (!fournisseurs.has(b.chantier_id)) fournisseurs.set(b.chantier_id, new Set());
    fournisseurs.get(b.chantier_id)!.add(nom);
  }
  const fournStr = (id: string): string =>
    Array.from(fournisseurs.get(id) ?? []).join(", ");

  // Marges par chantier.
  const marges = new Map<string, any>();
  for (const m of (margesData as any[]) ?? []) marges.set(m.chantier_id, m);

  const entetes = [
    "Date",
    "Client",
    "Composition",
    "Fournisseur(s)",
    "CA",
    "Coût matériel",
    "Sous-traitance",
    "Marge",
    "Marge %",
  ];

  // Lignes : valeurs typées (nombres pour montants) pour un rendu xlsx correct.
  let totCa = 0,
    totMat = 0,
    totSt = 0,
    totMarge = 0;
  const lignes = chantiers.map((c) => {
    const m = marges.get(c.id) ?? {};
    const ca = Number(m.ca ?? 0);
    const mat = Number(m.cout_materiel ?? 0);
    const st = Number(m.cout_sous_traitance ?? 0);
    const marge = Number(m.marge ?? 0);
    totCa += ca;
    totMat += mat;
    totSt += st;
    totMarge += marge;
    return [
      dateFr(c.date_prevue),
      c.clients?.nom ?? "—",
      compoStr(c.id),
      fournStr(c.id),
      ca,
      mat,
      st,
      marge,
      m.marge_pct === null || m.marge_pct === undefined ? "" : Number(m.marge_pct),
    ] as (string | number)[];
  });

  const total: (string | number)[] = [
    "TOTAL",
    "",
    "",
    "",
    totCa,
    totMat,
    totSt,
    totMarge,
    "",
  ];

  const nomFichier = `marges_${debut}_${fin}`;

  if (format === "xlsx") {
    const aoa: (string | number)[][] = [entetes, ...lignes, total];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Marges");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nomFichier}.xlsx"`,
      },
    });
  }

  // CSV : montants avec virgule décimale, séparateur « ; », BOM UTF-8.
  const toCsvRow = (row: (string | number)[]) =>
    row
      .map((v, i) => (i >= 4 ? csvCell(num(typeof v === "number" ? v : v === "" ? null : Number(v))) : csvCell(v)))
      .join(";");
  // Remarque : les colonnes 0..3 sont textuelles, 4..8 numériques.
  const corps = [entetes, ...lignes, total]
    .map((row, idx) => {
      if (idx === 0) return row.map(csvCell).join(";"); // en-têtes tels quels
      return toCsvRow(row);
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
