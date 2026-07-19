import React from "react";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { dateFr } from "@/lib/format";
import { EtiquettesPDF, type DonneesEtiquettes, type Unite } from "@/components/etiquettes-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Étiquettes générées à la préparation d'un chantier (module « À préparer »),
// à partir de sa composition réservée (une étiquette par unité).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Non autorisé", { status: 401 });

  const { data: chantier } = await supabase
    .from("chantiers")
    .select("id, date_prevue, clients(nom)")
    .eq("id", params.id)
    .single();
  if (!chantier) return new NextResponse("Chantier introuvable", { status: 404 });

  // Unités = quantités réservées (matériel mis de côté) pour ce chantier
  const { data: resa } = await supabase
    .from("reservations").select("quantite").eq("chantier_id", params.id).eq("statut", "reserve");
  let n = 0;
  for (const r of (resa as any[]) ?? []) n += Math.abs(Number(r.quantite));
  if (n === 0) n = 1;

  const unites: Unite[] = Array.from({ length: n }, (_, i) => ({ index: i + 1, total: n }));
  const donnees: DonneesEtiquettes = {
    client: (chantier as any).clients?.nom ?? "—",
    date_installation: dateFr(chantier.date_prevue),
    unites,
  };

  const buffer = await renderToBuffer(React.createElement(EtiquettesPDF, { data: donnees }) as any);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="etiquettes-chantier.pdf"`,
    },
  });
}
