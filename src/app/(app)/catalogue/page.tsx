import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Badge, Vide } from "@/components/ui";
import { nombre } from "@/lib/format";
import type { Article } from "@/lib/types";
import {
  creerArticle, modifierArticle, supprimerArticle,
  creerComposition, ajouterLigneComposition, supprimerLigneComposition, supprimerComposition,
} from "./actions";

export const dynamic = "force-dynamic";

const CATEGORIES = ["pac", "split", "fenetre", "porte", "accessoire"] as const;

const capitaliser = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

interface Composition {
  id: string;
  article_fini_id: string;
}

interface LigneComposition {
  id: string;
  composition_id: string;
  article_composant_id: string;
  quantite: number;
}

export default async function CataloguePage() {
  await requireRole(["admin", "collaborateur"]);
  const supabase = createClient();

  const [{ data: articles }, { data: compositions }, { data: lignes }] = await Promise.all([
    supabase.from("articles").select("*").order("categorie").order("designation"),
    supabase.from("compositions").select("id, article_fini_id"),
    supabase.from("composition_lignes").select("id, composition_id, article_composant_id, quantite"),
  ]);

  const listeArticles = (articles as Article[] | null) ?? [];
  const listeCompositions = (compositions as Composition[] | null) ?? [];
  const listeLignes = (lignes as LigneComposition[] | null) ?? [];

  const articleParId = new Map<string, Article>();
  for (const a of listeArticles) articleParId.set(a.id, a);

  const lignesParComposition = new Map<string, LigneComposition[]>();
  for (const l of listeLignes) {
    const arr = lignesParComposition.get(l.composition_id) ?? [];
    arr.push(l);
    lignesParComposition.set(l.composition_id, arr);
  }

  // Articles finis n'ayant pas encore de composition (pour le formulaire de création)
  const composesSet = new Set(listeCompositions.map((c) => c.article_fini_id));
  const articlesSansComposition = listeArticles.filter((a) => !composesSet.has(a.id));

  return (
    <>
      <EnTetePage
        titre="Catalogue & compositions"
        description="Gestion des articles et des nomenclatures (produits finis et leurs composants)."
      />

      <div className="mb-6">
        <Carte titre="Articles">
          <details className="mb-4">
            <summary className="btn-primaire w-fit cursor-pointer">+ Nouvel article</summary>
            <form action={creerArticle} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className="etiquette">Référence</label><input name="reference" required className="champ" /></div>
              <div><label className="etiquette">Désignation</label><input name="designation" required className="champ" /></div>
              <div>
                <label className="etiquette">Catégorie</label>
                <select name="categorie" className="champ" defaultValue="accessoire">
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{capitaliser(c)}</option>
                  ))}
                </select>
              </div>
              <div><label className="etiquette">Unité</label><input name="unite" defaultValue="pièce" className="champ" /></div>
              <div><label className="etiquette">Seuil manuel</label><input name="seuil_manuel" type="number" min="0" defaultValue={0} className="champ" /></div>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input name="serialise" type="checkbox" /> Sérialisé
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input name="compose" type="checkbox" /> Composé (non stocké)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input name="actif" type="checkbox" defaultChecked /> Actif
                </label>
              </div>
              <div className="sm:col-span-2"><button className="btn-primaire">Enregistrer</button></div>
            </form>
          </details>

          {listeArticles.length === 0 ? (
            <Vide message="Aucun article." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Référence</th><th>Désignation</th><th>Catégorie</th>
                    <th>Unité</th><th className="text-right">Seuil</th><th>État</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {listeArticles.map((a) => (
                    <tr key={a.id}>
                      <td className="font-mono text-xs text-gray-500">{a.reference}</td>
                      <td className="font-medium">{a.designation}</td>
                      <td>{capitaliser(a.categorie)}</td>
                      <td className="text-gray-500">{a.unite}</td>
                      <td className="text-right">{nombre(a.seuil_manuel)}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {a.serialise && <Badge couleur="bleu">Sérialisé</Badge>}
                          {a.compose && <Badge couleur="orange">Composé</Badge>}
                          {a.actif ? <Badge couleur="vert">Actif</Badge> : <Badge couleur="gris">Inactif</Badge>}
                        </div>
                      </td>
                      <td className="text-right">
                        <details>
                          <summary className="cursor-pointer text-xs text-brand-600">Modifier</summary>
                          <form action={modifierArticle} className="mt-2 grid gap-2 text-left">
                            <input type="hidden" name="id" value={a.id} />
                            <input name="reference" defaultValue={a.reference} className="champ" placeholder="Référence" />
                            <input name="designation" defaultValue={a.designation} className="champ" placeholder="Désignation" />
                            <select name="categorie" defaultValue={a.categorie} className="champ">
                              {CATEGORIES.map((c) => (
                                <option key={c} value={c}>{capitaliser(c)}</option>
                              ))}
                            </select>
                            <input name="unite" defaultValue={a.unite} className="champ" placeholder="Unité" />
                            <input name="seuil_manuel" type="number" min="0" defaultValue={a.seuil_manuel} className="champ" />
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                              <input name="serialise" type="checkbox" defaultChecked={a.serialise} /> Sérialisé
                            </label>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                              <input name="compose" type="checkbox" defaultChecked={a.compose} /> Composé (non stocké)
                            </label>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                              <input name="actif" type="checkbox" defaultChecked={a.actif} /> Actif
                            </label>
                            <button className="btn-primaire">Mettre à jour</button>
                          </form>
                          <form action={supprimerArticle} className="mt-2">
                            <input type="hidden" name="id" value={a.id} />
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

      <Carte titre="Compositions (nomenclature)">
        <details className="mb-4">
          <summary className="btn-secondaire w-fit cursor-pointer">+ Nouvelle composition</summary>
          <form action={creerComposition} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="etiquette">Article fini</label>
              <select name="article_fini_id" required className="champ">
                {articlesSansComposition.map((a) => (
                  <option key={a.id} value={a.id}>{a.reference} — {a.designation}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2"><button className="btn-primaire">Créer la composition</button></div>
          </form>
        </details>

        {listeCompositions.length === 0 ? (
          <Vide message="Aucune composition." />
        ) : (
          <div className="space-y-4">
            {listeCompositions.map((comp) => {
              const fini = articleParId.get(comp.article_fini_id);
              const lignesComp = lignesParComposition.get(comp.id) ?? [];
              return (
                <div key={comp.id} className="rounded-md border border-gray-100 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-medium">{fini?.designation ?? "Article inconnu"}</span>
                    {fini && <span className="font-mono text-xs text-gray-400">{fini.reference}</span>}
                  </div>

                  {lignesComp.length === 0 ? (
                    <Vide message="Aucun composant." />
                  ) : (
                    <table className="table-base">
                      <thead>
                        <tr><th>Composant</th><th className="text-right">Quantité</th><th></th></tr>
                      </thead>
                      <tbody>
                        {lignesComp.map((l) => {
                          const composant = articleParId.get(l.article_composant_id);
                          return (
                            <tr key={l.id}>
                              <td className="font-medium">
                                {composant?.designation ?? "Article inconnu"}
                                {composant && <span className="ml-2 font-mono text-xs text-gray-400">{composant.reference}</span>}
                              </td>
                              <td className="text-right">{nombre(l.quantite)}</td>
                              <td className="text-right">
                                <form action={supprimerLigneComposition}>
                                  <input type="hidden" name="id" value={l.id} />
                                  <button className="btn-danger text-xs">Supprimer</button>
                                </form>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  <form action={ajouterLigneComposition} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <input type="hidden" name="composition_id" value={comp.id} />
                    <div className="sm:col-span-2">
                      <label className="etiquette">Composant</label>
                      <select name="article_composant_id" required className="champ">
                        {listeArticles
                          .filter((a) => a.id !== comp.article_fini_id)
                          .map((a) => (
                            <option key={a.id} value={a.id}>{a.reference} — {a.designation}</option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="etiquette">Quantité</label>
                      <input name="quantite" type="number" min="1" step="1" defaultValue={1} className="champ" />
                    </div>
                    <div className="flex items-end"><button className="btn-secondaire w-full">Ajouter la ligne</button></div>
                  </form>

                  <form action={supprimerComposition} className="mt-3">
                    <input type="hidden" name="id" value={comp.id} />
                    <button className="btn-danger text-xs">Supprimer la composition</button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </Carte>
    </>
  );
}
