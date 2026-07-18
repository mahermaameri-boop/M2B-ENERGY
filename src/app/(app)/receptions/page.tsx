import Link from "next/link";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Badge, Vide } from "@/components/ui";
import { dateFr, dateISO } from "@/lib/format";
import { LABEL_STATUT_COMMANDE, type StatutCommande } from "@/lib/types";
import { entreeManuelle } from "./actions";

export const dynamic = "force-dynamic";

export default async function ReceptionsPage() {
  await requireProfil();
  const supabase = createClient();

  const [{ data: commandes }, { data: articles }, { data: fournisseurs }] = await Promise.all([
    supabase.from("commandes")
      .select("id, numero, date_livraison_prevue, statut, fournisseurs(nom)")
      .in("statut", ["brouillon", "en_transit", "livree_partiel"])
      .order("date_livraison_prevue"),
    supabase.from("articles").select("id, reference, designation, serialise").eq("actif", true).order("designation"),
    supabase.from("fournisseurs").select("id, nom").order("nom"),
  ]);

  return (
    <>
      <EnTetePage
        titre="Réceptions"
        description="Réceptionner une commande (totale ou partielle) ou enregistrer une entrée de stock manuelle."
      />

      <div className="mb-6">
        <Carte titre="Commandes à réceptionner">
          {((commandes as any[]) ?? []).length === 0 ? (
            <Vide message="Aucune commande en attente de réception." />
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Numéro</th><th>Fournisseur</th><th>Livraison prévue</th><th>Statut</th><th></th>
                </tr>
              </thead>
              <tbody>
                {((commandes as any[]) ?? []).map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.numero}</td>
                    <td>{c.fournisseurs?.nom ?? "—"}</td>
                    <td>{dateFr(c.date_livraison_prevue)}</td>
                    <td><Badge couleur="bleu">{LABEL_STATUT_COMMANDE[c.statut as StatutCommande]}</Badge></td>
                    <td className="text-right">
                      <Link href={`/receptions/${c.id}`} className="btn-primaire text-xs">Réceptionner</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Carte>
      </div>

      <Carte titre="Entrée de stock manuelle (réappro hors commande / ajustement)">
        <form action={entreeManuelle} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="etiquette">Article</label>
            <select name="article_id" required className="champ">
              {((articles as any[]) ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.reference} — {a.designation}{a.serialise ? " (sérialisé)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="etiquette">Date</label>
            <input name="date" type="date" defaultValue={dateISO()} className="champ" />
          </div>
          <div>
            <label className="etiquette">Quantité (articles non sérialisés)</label>
            <input name="quantite" type="number" min="0" step="1" defaultValue={0} className="champ" />
          </div>
          <div>
            <label className="etiquette">Prix d'achat unitaire (€)</label>
            <input name="prix_achat" type="number" min="0" step="0.01" defaultValue={0} className="champ" />
          </div>
          <div>
            <label className="etiquette">Fournisseur (optionnel)</label>
            <select name="fournisseur_id" className="champ">
              <option value="">—</option>
              {((fournisseurs as any[]) ?? []).map((f) => (
                <option key={f.id} value={f.id}>{f.nom}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="etiquette">N° de facture (optionnel)</label>
            <input name="numero_facture" className="champ" />
          </div>
          <div>
            <label className="etiquette">Motif</label>
            <input name="motif" className="champ" placeholder="Réappro, ajustement…" />
          </div>
          <div className="sm:col-span-3">
            <label className="etiquette">N° de série (articles sérialisés — un par ligne)</label>
            <textarea name="series" rows={2} className="champ" placeholder="Un numéro de série par ligne (laisser vide sinon)" />
          </div>
          <div className="sm:col-span-3">
            <button className="btn-primaire">Enregistrer l'entrée</button>
          </div>
        </form>
      </Carte>
    </>
  );
}
