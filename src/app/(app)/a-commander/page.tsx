import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Badge, Vide } from "@/components/ui";
import { nombre, dateFr, dateISO } from "@/lib/format";
import { LABEL_STATUT_BESOIN, type StatutBesoin } from "@/lib/types";
import { creerBesoin, supprimerBesoin, marquerCommande } from "./actions";

export const dynamic = "force-dynamic";

interface Besoin {
  id: string; chantier_id: string; article_id: string; quantite: number;
  date_besoin: string; statut: StatutBesoin; commande_id: string | null;
  articles: { reference: string; designation: string } | null;
  chantiers: { libelle: string; clients: { nom: string } | null } | null;
}

export default async function ACommanderPage() {
  await requireProfil();
  const supabase = createClient();

  const [{ data: besoinsData }, { data: stock }, { data: fournisseurs }, { data: chantiers }, { data: articles }, { data: compositions }] =
    await Promise.all([
      supabase.from("besoins_appro")
        .select("id, chantier_id, article_id, quantite, date_besoin, statut, commande_id, articles(reference, designation), chantiers(libelle, clients(nom))")
        .order("date_besoin"),
      supabase.from("vue_stock_actuel").select("article_id, stock"),
      supabase.from("fournisseurs").select("id, nom").order("nom"),
      supabase.from("chantiers").select("id, libelle, clients(nom)").order("libelle"),
      supabase.from("articles").select("id, reference, designation, compose").eq("actif", true).order("designation"),
      supabase.from("compositions").select("id, article_fini_id, nom_variante").order("nom_variante"),
    ]);

  const besoins = (besoinsData as unknown as Besoin[]) ?? [];
  const stockMap = new Map(((stock as any[]) ?? []).map((s) => [s.article_id, Number(s.stock)]));
  const chantiersIn = ((chantiers as any[]) ?? []).map((c) => ({ id: c.id, libelle: c.libelle, client_nom: c.clients?.nom ?? "—" }));
  const articlesIn = (articles as any[]) ?? [];
  const articleParId = new Map(articlesIn.map((a) => [a.id, a]));

  // Variantes regroupées par produit fini ; on ne propose le choix que pour les
  // produits ayant au moins deux variantes (une seule = décomposition implicite).
  const variantesParFini = new Map<string, { id: string; nom_variante: string }[]>();
  for (const c of ((compositions as any[]) ?? [])) {
    const arr = variantesParFini.get(c.article_fini_id) ?? [];
    arr.push({ id: c.id, nom_variante: c.nom_variante });
    variantesParFini.set(c.article_fini_id, arr);
  }
  const finisMultiVariantes = [...variantesParFini.entries()].filter(([, v]) => v.length >= 2);

  // Regroupe les besoins « à commander » par chantier
  const aCommander = besoins.filter((b) => b.statut === "a_commander");
  const parChantier = new Map<string, { libelle: string; client: string; lignes: Besoin[] }>();
  for (const b of aCommander) {
    const cur = parChantier.get(b.chantier_id) ?? {
      libelle: b.chantiers?.libelle ?? "—", client: b.chantiers?.clients?.nom ?? "—", lignes: [],
    };
    cur.lignes.push(b);
    parChantier.set(b.chantier_id, cur);
  }
  const enCours = besoins.filter((b) => b.statut === "commande");

  return (
    <>
      <EnTetePage
        titre="À commander"
        description="Passerelle planning → achats : encoder les besoins matériel des chantiers, croiser avec le stock, et générer les commandes des manquants."
      />

      {/* Côté planning : encoder un besoin */}
      <div className="mb-6">
        <Carte titre="Encoder un besoin (planning)">
          {chantiersIn.length === 0 ? (
            <Vide message="Créez d'abord un client et un chantier (module Clients & chantiers)." />
          ) : (
            <form action={creerBesoin} className="grid grid-cols-1 gap-4 sm:grid-cols-5">
              <div className="sm:col-span-2">
                <label className="etiquette">Chantier / client</label>
                <select name="chantier_id" required className="champ">
                  {chantiersIn.map((c) => <option key={c.id} value={c.id}>{c.libelle} — {c.client_nom}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="etiquette">Matériel (article ou produit composé)</label>
                <select name="article_id" required className="champ">
                  {articlesIn.map((a) => (
                    <option key={a.id} value={a.id}>{a.reference} — {a.designation}{a.compose ? " (composé)" : ""}</option>
                  ))}
                </select>
              </div>
              {finisMultiVariantes.length > 0 && (
                <div className="sm:col-span-2">
                  <label className="etiquette">Variante (produits composés)</label>
                  <select name="composition_id" className="champ" defaultValue="">
                    <option value="">Automatique (Standard)</option>
                    {finisMultiVariantes.map(([finiId, vars]) => {
                      const art = articleParId.get(finiId);
                      return (
                        <optgroup key={finiId} label={art ? `${art.reference} — ${art.designation}` : "Produit composé"}>
                          {vars.map((v) => (
                            <option key={v.id} value={v.id}>{v.nom_variante}</option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
              )}
              <div>
                <label className="etiquette">Quantité</label>
                <input name="quantite" type="number" min="1" defaultValue={1} className="champ" />
              </div>
              <div className="sm:col-span-2">
                <label className="etiquette">Date de besoin</label>
                <input name="date_besoin" type="date" defaultValue={dateISO()} className="champ" />
              </div>
              <div className="sm:col-span-2">
                <label className="etiquette">Notes</label>
                <input name="notes" className="champ" />
              </div>
              <div className="flex items-end">
                <button className="btn-primaire w-full">Ajouter le besoin</button>
              </div>
            </form>
          )}
          <p className="mt-2 text-xs text-gray-400">
            Un produit composé est automatiquement décomposé en composants via sa nomenclature.
          </p>
        </Carte>
      </div>

      {/* Côté achats : besoins à commander groupés par chantier */}
      <div className="mb-6 space-y-4">
        {parChantier.size === 0 ? (
          <Carte><Vide message="Aucun besoin à commander." /></Carte>
        ) : (
          [...parChantier.entries()].map(([chantierId, grp]) => {
            const totalManque = grp.lignes.reduce(
              (s, b) => s + Math.max(Number(b.quantite) - (stockMap.get(b.article_id) ?? 0), 0), 0);
            return (
              <Carte key={chantierId} titre={`${grp.libelle} — ${grp.client}`}>
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Article</th><th className="text-right">Besoin</th>
                        <th className="text-right">En stock</th><th className="text-right">À commander</th>
                        <th>Date besoin</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {grp.lignes.map((b) => {
                        const stockDispo = stockMap.get(b.article_id) ?? 0;
                        const enStock = Math.min(Number(b.quantite), stockDispo);
                        const manque = Math.max(Number(b.quantite) - stockDispo, 0);
                        return (
                          <tr key={b.id}>
                            <td className="font-medium">{b.articles?.designation} <span className="font-mono text-xs text-gray-400">{b.articles?.reference}</span></td>
                            <td className="text-right">{nombre(b.quantite)}</td>
                            <td className="text-right text-emerald-600">{nombre(enStock)}</td>
                            <td className="text-right font-semibold">{manque > 0 ? <Badge couleur="orange">{nombre(manque)}</Badge> : <Badge couleur="vert">0</Badge>}</td>
                            <td>{dateFr(b.date_besoin)}</td>
                            <td className="text-right">
                              <form action={supprimerBesoin}>
                                <input type="hidden" name="id" value={b.id} />
                                <button className="text-xs text-red-600 hover:underline">Retirer</button>
                              </form>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <form action={marquerCommande} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="chantier_id" value={chantierId} />
                  <div>
                    <label className="etiquette">Fournisseur</label>
                    <select name="fournisseur_id" required className="champ">
                      <option value="">— Choisir —</option>
                      {((fournisseurs as any[]) ?? []).map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                    </select>
                  </div>
                  <button
                    className="btn inline-flex bg-emerald-600 text-white hover:bg-emerald-700"
                    disabled={totalManque === 0}
                    title={totalManque === 0 ? "Tout est en stock" : ""}
                  >
                    ✓ Marquer comme commandé ({nombre(totalManque)} à commander)
                  </button>
                </form>
              </Carte>
            );
          })
        )}
      </div>

      {/* Besoins déjà passés en commande */}
      {enCours.length > 0 && (
        <Carte titre="Besoins commandés (en attente de réception)">
          <table className="table-base">
            <thead>
              <tr><th>Chantier</th><th>Article</th><th className="text-right">Qté</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {enCours.map((b) => (
                <tr key={b.id}>
                  <td className="text-gray-500">{b.chantiers?.libelle}</td>
                  <td className="font-medium">{b.articles?.designation}</td>
                  <td className="text-right">{nombre(b.quantite)}</td>
                  <td><Badge couleur="bleu">{LABEL_STATUT_BESOIN[b.statut]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Carte>
      )}
    </>
  );
}
