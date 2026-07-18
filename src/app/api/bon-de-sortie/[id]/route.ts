import React from "react";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { dateFr } from "@/lib/format";
import { BonDeSortiePDF, type DonneesBon, type ItemBon } from "./pdf-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Non autorisé", { status: 401 });

  const { data: bon } = await supabase
    .from("bons_de_sortie")
    .select("id, numero, date, chantiers(libelle, clients(nom, adresse))")
    .eq("id", params.id)
    .single();
  if (!bon) return new NextResponse("Bon introuvable", { status: 404 });

  const [{ data: series }, { data: mouvements }] = await Promise.all([
    supabase.from("numeros_serie")
      .select("numero_serie, articles(reference, designation)")
      .eq("bon_de_sortie_id", params.id),
    supabase.from("mouvements_stock")
      .select("quantite, articles(reference, designation)")
      .eq("reference", params.id)
      .eq("type", "sortie")
      .is("numero_serie_id", null),
  ]);

  const items: ItemBon[] = [];
  for (const s of (series as any[]) ?? []) {
    const qr = await QRCode.toDataURL(s.numero_serie, { margin: 0, width: 120 });
    items.push({
      designation: s.articles?.designation ?? "",
      reference: s.articles?.reference ?? "",
      numero_serie: s.numero_serie,
      quantite: 1,
      qr,
    });
  }
  for (const m of (mouvements as any[]) ?? []) {
    items.push({
      designation: m.articles?.designation ?? "",
      reference: m.articles?.reference ?? "",
      numero_serie: null,
      quantite: Math.abs(Number(m.quantite)),
      qr: null,
    });
  }

  const chantier = (bon as any).chantiers;
  const donnees: DonneesBon = {
    numero: bon.numero,
    date: dateFr(bon.date),
    chantier: chantier?.libelle ?? "—",
    client: chantier?.clients?.nom ?? "—",
    adresse: chantier?.clients?.adresse ?? "",
    items,
  };

  const buffer = await renderToBuffer(
    React.createElement(BonDeSortiePDF, { data: donnees }) as any,
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${bon.numero}.pdf"`,
    },
  });
}
