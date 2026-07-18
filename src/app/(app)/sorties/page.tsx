import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Badge, Vide } from "@/components/ui";
import { nombre, dateFr, dateISO } from "@/lib/format";
import { SortieForm } from "./sortie-form";
import { creerReservation, annulerReservation, creerClientChantierRapide } from "./actions";

export const dynamic = "force-dynamic";

export default async function SortiesPage() {
  await requireProfil();
  const supabase = createClient();

  const [{ data: chantiers }, { data: articles }, { data: reservations }, { data: bons }] =
    await Promise.all([
      supabase.from("chantiers").select("id, libelle, clients(nom)").order("libelle"),
      supabase.from("articles").select("id, reference, designation, serialise").eq("actif", true).order("designation"),
      supabase.from("reservations")
        .select("id, quantite, date_prevue, statut, articles(reference, designation), chantiers(libelle)")
        .eq("statut", "reserve").order("date_prevue"),
      supabase.from("bons_de_sortie")
        .select("id, numero, date, chantiers(libelle, clients(nom))")
        .order("date", { ascending: false }).limit(50),
    ]);

  const chantiersIn = ((chantiers as any[]) ?? []).map((c) => ({
    id: c.id, libelle: c.libelle, client_nom: c.clients?.nom ?? "—",
  }));

  return (
    <>
      <EnTetePage
        titre="Sorties & bons de sortie"
        description="Réservations (déduites du prévisionnel) et sorties effectuées avec génération du bon de sortie."
      />

      <div className="mb-6">
        <Carte titre="Effectuer une sortie">
          <details className="mb-4">
            <summary className="btn-secondaire w-fit cursor-pointer">+ Nouveau client / chantier</summary>
            <form action={creerClientChantierRapide} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="etiquette">Nom du client</label>
                <input name="client_nom" required className="champ" />
              </div>
              <div>
                <label className="etiquette">Adresse</label>
                <input name="client_adresse" className="champ" />
              </div>
              <div>
                <label className="etiquette">Référence du chantier</label>
                <input name="chantier_libelle" required className="champ" />
              </div>
              <div>
                <label className="etiquette">Date prévue</label>
                <input name="chantier_date" type="date" defaultValue={dateISO()} className="champ" />
              </div>
              <div className="sm:col-span-2">
                <button className="btn-primaire w-fit">Créer le client et le chantier</button>
              </div>
            </form>
          </details>

          {chantiersIn.length === 0 ? (
            <Vide message="Créez d'abord un client et un chantier (module Clients & CA)." />
          ) : (
            <SortieForm chantiers={chantiersIn} articles={(articles as any) ?? []} dateJour={dateISO()} />
          )}
        </Carte>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Carte titre="Réservations (sorties planifiées)">
          <details className="mb-4">
            <summary className="btn-secondaire w-fit cursor-pointer">+ Nouvelle réservation</summary>
            <form action={creerReservation} className="mt-3 grid grid-cols-1 gap-3">
              <div>
                <label className="etiquette">Chantier</label>
                <select name="chantier_id" required className="champ">
                  {chantiersIn.map((c) => <option key={c.id} value={c.id}>{c.libelle} — {c.client_nom}</option>)}
                </select>
              </div>
              <div>
                <label className="etiquette">Article</label>
                <select name="article_id" required className="champ">
                  {((articles as any[]) ?? []).map((a) => <option key={a.id} value={a.id}>{a.reference} — {a.designation}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="etiquette">Quantité</label><input name="quantite" type="number" min="1" defaultValue={1} className="champ" /></div>
                <div><label className="etiquette">Date prévue</label><input name="date_prevue" type="date" defaultValue={dateISO()} className="champ" /></div>
              </div>
              <button className="btn-primaire w-fit">Réserver</button>
            </form>
          </details>

          {((reservations as any[]) ?? []).length === 0 ? (
            <Vide message="Aucune réservation active." />
          ) : (
            <table className="table-base">
              <thead>
                <tr><th>Article</th><th>Chantier</th><th className="text-right">Qté</th><th>Prévue</th><th></th></tr>
              </thead>
              <tbody>
                {((reservations as any[]) ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.articles?.designation}</td>
                    <td className="text-gray-500">{r.chantiers?.libelle}</td>
                    <td className="text-right">{nombre(r.quantite)}</td>
                    <td>{dateFr(r.date_prevue)}</td>
                    <td className="text-right">
                      <form action={annulerReservation}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="text-xs text-red-600 hover:underline">Annuler</button>
                      </form>
                    </td>
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
