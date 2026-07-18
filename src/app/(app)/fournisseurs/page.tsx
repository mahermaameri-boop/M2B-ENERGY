import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Badge, Vide } from "@/components/ui";
import { euro, nombre, dateFr, dateISO } from "@/lib/format";
import {
  creerFournisseur, modifierFournisseur, supprimerFournisseur,
} from "./actions";

export const dynamic = "force-dynamic";

interface Reassort {
  article_id: string;
  fournisseur_id: string;
  fournisseur_nom: string;
  prix: number;
  delai_livraison_jours: number;
  date_prix: string;
  rang: number;
}

const SEUIL_DELAI = 7; // drapeau prix/délai (Étape 2), affiché à titre indicatif

export default async function FournisseursPage() {
  await requireRole(["admin"]);
  const supabase = createClient();

  const [{ data: fournisseurs }, { data: articles }, { data: reassort }, { data: prevRupture }] =
    await Promise.all([
      supabase.from("fournisseurs").select("*").order("nom"),
      supabase.from("articles").select("id, reference, designation").eq("actif", true).order("designation"),
      supabase.from("vue_reassort").select("*").order("article_id").order("rang"),
      supabase.rpc("fn_stock_previsionnel", { d_cible: dateISO() }),
    ]);

  const parArticle = new Map<string, Reassort[]>();
  for (const r of (reassort as Reassort[] | null) ?? []) {
    const l = parArticle.get(r.article_id) ?? [];
    l.push(r);
    parArticle.set(r.article_id, l);
  }
  const ruptureSet = new Set(
    ((prevRupture as { article_id: string; previsionnel: number }[] | null) ?? [])
      .filter((p) => p.previsionnel <= 0)
      .map((p) => p.article_id),
  );

  return (
    <>
      <EnTetePage
        titre="Fournisseurs & prix"
        description="Fiches fournisseurs, historique des prix et ordre d'appel au réassort (du moins cher au plus cher)."
      />

      <div className="mb-6">
        <Carte titre="Fournisseurs">
          <details className="mb-4">
            <summary className="btn-primaire w-fit cursor-pointer">+ Nouveau fournisseur</summary>
            <form action={creerFournisseur} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className="etiquette">Nom</label><input name="nom" required className="champ" /></div>
              <div><label className="etiquette">E-mail</label><input name="email" type="email" className="champ" /></div>
              <div><label className="etiquette">Téléphone</label><input name="telephone" className="champ" /></div>
              <div><label className="etiquette">Délai de livraison (jours)</label><input name="delai_livraison_jours" type="number" min="0" defaultValue={7} className="champ" /></div>
              <div className="sm:col-span-2"><label className="etiquette">Notes</label><input name="notes" className="champ" /></div>
              <div className="sm:col-span-2"><button className="btn-primaire">Enregistrer</button></div>
            </form>
          </details>

          {(fournisseurs ?? []).length === 0 ? (
            <Vide message="Aucun fournisseur." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr><th>Nom</th><th>Contact</th><th className="text-right">Délai (j)</th><th>Notes</th><th></th></tr>
                </thead>
                <tbody>
                  {(fournisseurs ?? []).map((f) => (
                    <tr key={f.id}>
                      <td className="font-medium">{f.nom}</td>
                      <td className="text-gray-500">
                        {f.email && <div>{f.email}</div>}
                        {f.telephone && <div>{f.telephone}</div>}
                      </td>
                      <td className="text-right">{nombre(f.delai_livraison_jours)}</td>
                      <td className="text-gray-500">{f.notes}</td>
                      <td className="text-right">
                        <details>
                          <summary className="cursor-pointer text-xs text-brand-600">Modifier</summary>
                          <form action={modifierFournisseur} className="mt-2 grid gap-2 text-left">
                            <input type="hidden" name="id" value={f.id} />
                            <input name="nom" defaultValue={f.nom} className="champ" placeholder="Nom" />
                            <input name="email" defaultValue={f.email ?? ""} className="champ" placeholder="E-mail" />
                            <input name="telephone" defaultValue={f.telephone ?? ""} className="champ" placeholder="Téléphone" />
                            <input name="delai_livraison_jours" type="number" defaultValue={f.delai_livraison_jours} className="champ" />
                            <input name="notes" defaultValue={f.notes ?? ""} className="champ" placeholder="Notes" />
                            <button className="btn-primaire">Mettre à jour</button>
                          </form>
                          <form action={supprimerFournisseur} className="mt-2">
                            <input type="hidden" name="id" value={f.id} />
                            <button className="btn-danger w-full text-xs">Supprimer</button>
                          </form>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Carte>
      </div>

      <Carte titre="Prix & ordre d'appel au réassort">
        <p className="mb-4 rounded-md border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600">
          L'historique des prix, le meilleur prix et l'ordre de réassort sont calculés
          automatiquement à partir des <strong>commandes fournisseurs réellement passées</strong>
          (prix saisis par l'Admin sur les lignes de commande). Il n'y a pas de saisie de prix
          manuelle : passez une commande pour alimenter l'historique.
        </p>

        <div className="space-y-4">
          {(articles ?? []).map((a) => {
            const lignes = parArticle.get(a.id) ?? [];
            if (lignes.length === 0) return null;
            const enRupture = ruptureSet.has(a.id);
            return (
              <div key={a.id} className="rounded-md border border-gray-100 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-medium">{a.designation}</span>
                  <span className="font-mono text-xs text-gray-400">{a.reference}</span>
                  {enRupture && <Badge couleur="rouge">En rupture</Badge>}
                </div>
                <table className="table-base">
                  <thead>
                    <tr><th>Rang</th><th>Fournisseur</th><th className="text-right">Dernier prix</th><th className="text-right">Délai (j)</th><th>Depuis</th><th></th></tr>
                  </thead>
                  <tbody>
                    {lignes.map((r) => {
                      const meilleur = r.rang === 1;
                      const drapeau = enRupture && meilleur && r.delai_livraison_jours > SEUIL_DELAI;
                      return (
                        <tr key={r.fournisseur_id} className={meilleur ? "bg-emerald-50" : ""}>
                          <td>{r.rang}</td>
                          <td className="font-medium">
                            {r.fournisseur_nom} {meilleur && <Badge couleur="vert">Meilleur prix</Badge>}
                          </td>
                          <td className="text-right font-semibold">{euro(r.prix)}</td>
                          <td className="text-right">{nombre(r.delai_livraison_jours)}</td>
                          <td className="text-gray-500">{dateFr(r.date_prix)}</td>
                          <td>{drapeau && <Badge couleur="orange">Délai &gt; {SEUIL_DELAI} j — arbitrer</Badge>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </Carte>
    </>
  );
}
