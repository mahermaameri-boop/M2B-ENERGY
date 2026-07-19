import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Badge, Vide } from "@/components/ui";
import { nombre, dateFr, dateISO } from "@/lib/format";
import { SortieForm } from "./sortie-form";

export const dynamic = "force-dynamic";

export default async function SortiesPage() {
  await requireProfil();
  const supabase = createClient();

  const [{ data: chantiers }, { data: reservations }, { data: bons }] =
    await Promise.all([
      // Une sortie part d'un chantier PLANIFIÉ (les réalisés sont déjà sortis).
      supabase.from("chantiers")
        .select("id, libelle, date_prevue, clients(nom)")
        .eq("statut", "planifie")
        .order("date_prevue"),
      // Composition attendue = réservations 'reserve' des chantiers planifiés.
      supabase.from("reservations")
        .select("id, quantite, date_prevue, chantier_id, articles!inner(id, reference, designation, serialise), chantiers!inner(libelle, statut)")
        .eq("statut", "reserve")
        .eq("chantiers.statut", "planifie")
        .order("date_prevue"),
      supabase.from("bons_de_sortie")
        .select("id, numero, date, chantiers(libelle, clients(nom))")
        .order("date", { ascending: false }).limit(50),
    ]);

  const chantiersIn = ((chantiers as any[]) ?? []).map((c) => ({
    id: c.id, libelle: c.libelle, client_nom: c.clients?.nom ?? "—",
  }));

  // Map { chantier_id -> composants attendus } passé au formulaire (calcul serveur).
  const composantsParChantier: Record<string, {
    reservation_id: string; article_id: string; reference: string;
    designation: string; serialise: boolean; quantite: number;
  }[]> = {};
  for (const r of (reservations as any[]) ?? []) {
    (composantsParChantier[r.chantier_id] ??= []).push({
      reservation_id: r.id,
      article_id: r.articles?.id,
      reference: r.articles?.reference ?? "—",
      designation: r.articles?.designation ?? "—",
      serialise: !!r.articles?.serialise,
      quantite: Number(r.quantite),
    });
  }

  return (
    <>
      <EnTetePage
        titre="Sorties & bons de sortie"
        description="La sortie part d'un chantier planifié et de sa composition. Réservations déduites du prévisionnel."
      />

      <div className="mb-6">
        <Carte titre="Effectuer une sortie">
          {chantiersIn.length === 0 ? (
            <Vide message="Aucun chantier planifié. Planifiez un chantier et sa composition dans Clients & chantiers." />
          ) : (
            <SortieForm
              chantiers={chantiersIn}
              composantsParChantier={composantsParChantier}
              dateJour={dateISO()}
            />
          )}
        </Carte>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Carte titre="Réservations (sorties planifiées)">
          {((reservations as any[]) ?? []).length === 0 ? (
            <Vide message="Aucune réservation active." />
          ) : (
            <table className="table-base">
              <thead>
                <tr><th>Article</th><th>Chantier</th><th className="text-right">Qté</th><th>Prévue</th></tr>
              </thead>
              <tbody>
                {((reservations as any[]) ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">
                      {r.articles?.designation}
                      {r.articles?.serialise && <span className="ml-2"><Badge couleur="bleu">série</Badge></span>}
                    </td>
                    <td className="text-gray-500">{r.chantiers?.libelle}</td>
                    <td className="text-right">{nombre(r.quantite)}</td>
                    <td>{dateFr(r.date_prevue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Carte>

        <Carte titre="Bons de sortie récents">
          {((bons as any[]) ?? []).length === 0 ? (
            <Vide message="Aucun bon de sortie émis." />
          ) : (
            <table className="table-base">
              <thead>
                <tr><th>N° bon</th><th>Chantier / client</th><th>Date</th><th></th></tr>
              </thead>
              <tbody>
                {((bons as any[]) ?? []).map((b) => (
                  <tr key={b.id}>
                    <td className="font-medium">{b.numero}</td>
                    <td className="text-gray-500">{b.chantiers?.libelle} — {b.chantiers?.clients?.nom}</td>
                    <td>{dateFr(b.date)}</td>
                    <td className="text-right">
                      <a href={`/api/bon-de-sortie/${b.id}`} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">
                        Ouvrir le PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Carte>
      </div>
    </>
  );
}
