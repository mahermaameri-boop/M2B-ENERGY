import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Vide } from "@/components/ui";
import { SousOnglets } from "@/components/sous-onglets";
import { ongletsUnivers } from "@/lib/navigation";
import { nombre } from "@/lib/format";
import type { Article } from "@/lib/types";
import { CatalogueTable } from "./catalogue-table";
import {
  creerArticle, modifierArticle, supprimerArticle,
  creerComposition, ajouterLigneComposition, supprimerLigneComposition, supprimerComposition,
} from "./actions";

export const dynamic = "force-dynamic";

interface Composition {
  id: string;
  article_fini_id: string;
  nom_variante: string;
}

interface LigneComposition {
  id: string;
  composition_id: string;
  article_composant_id: string;
  quantite: number;
}

export default async function CataloguePage() {
  const profil = await requireRole(["admin", "collaborateur"]);
  const supabase = createClient();

  const [{ data: articles }, { data: compositions }, { data: lignes }] = await Promise.all([
    supabase
      .from("articles")
      .select("id, reference, designation, categorie, unite, serialise, compose, seuil_manuel, actif")
      .order("categorie")
      .order("designation"),
    supabase.from("compositions").select("id, article_fini_id, nom_variante").order("nom_variante"),
    supabase
      .from("composition_lignes")
      .select("id, composition_id, article_composant_id, quantite"),
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

  // Variantes regroupées par produit fini.
  const compositionsParFini = new Map<string, Composition[]>();
  for (const c of listeCompositions) {
    const arr = compositionsParFini.get(c.article_fini_id) ?? [];
    arr.push(c);
    compositionsParFini.set(c.article_fini_id, arr);
  }
  // Produits composés (compose=true) : on peut leur créer plusieurs variantes.
  const articlesComposes = listeArticles.filter((a) => a.compose);
  // Produits finis ayant au moins une variante, dans l'ordre du catalogue.
  const finisAvecVariantes = articlesComposes.filter((a) => compositionsParFini.has(a.id));

  return (
    <>
      <SousOnglets onglets={ongletsUnivers("reglages", profil.role)} />
      <EnTetePage
        titre="Catalogue & compositions"
        description="Gestion des articles et des nomenclatures (produits finis et leurs composants)."
      />

      <div className="mb-6">
        <Carte titre="Articles">
          <CatalogueTable
            articles={listeArticles}
            finisAvecCompo={[...compositionsParFini.keys()]}
            creerArticle={creerArticle}
            modifierArticle={modifierArticle}
            supprimerArticle={supprimerArticle}
          />
        </Carte>
      </div>

      <Carte titre="Compositions (nomenclature)">
        <details className="mb-4">
          <summary className="btn-secondaire w-fit cursor-pointer">+ Nouvelle variante</summary>
          {articlesComposes.length === 0 ? (
            <p className="mt-4 text-sm text-gray-400">
              Aucun produit composé. Cochez « composé » sur un article pour lui définir des variantes.
            </p>
          ) : (
            <form action={creerComposition} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="etiquette">Produit fini</label>
                <select name="article_fini_id" required className="champ">
                  {articlesComposes.map((a) => (
                    <option key={a.id} value={a.id}>{a.reference} — {a.designation}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="etiquette">Nom de la variante</label>
                <input name="nom_variante" defaultValue="Standard" className="champ" placeholder="Standard" />
              </div>
              <div className="sm:col-span-2">
                <button className="btn-primaire">Créer la variante</button>
              </div>
            </form>
          )}
        </details>

        {finisAvecVariantes.length === 0 ? (
          <Vide message="Aucune composition." />
        ) : (
          <div className="space-y-6">
            {finisAvecVariantes.map((fini) => {
              const variantes = compositionsParFini.get(fini.id) ?? [];
              const composantsPossibles = listeArticles.filter((a) => a.id !== fini.id);
              return (
                <div key={fini.id} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{fini.designation}</span>
                    <span className="font-mono text-xs text-gray-400">{fini.reference}</span>
                    <span className="text-xs text-gray-400">
                      {variantes.length} variante{variantes.length > 1 ? "s" : ""}
                    </span>
                  </div>

                  {variantes.map((comp) => {
                    const lignesComp = lignesParComposition.get(comp.id) ?? [];
                    return (
                      <div key={comp.id} className="rounded-md border border-gray-200 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {fini.designation} — {comp.nom_variante}
                          </span>
                          <form action={supprimerComposition}>
                            <input type="hidden" name="id" value={comp.id} />
                            <button className="btn-danger text-xs">Supprimer la variante</button>
                          </form>
                        </div>

                        {lignesComp.length === 0 ? (
                          <Vide message="Aucun composant." />
                        ) : (
                          <table className="table-base">
                            <thead>
                              <tr>
                                <th>Composant</th>
                                <th className="text-right">Quantité</th>
                                <th className="text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lignesComp.map((l) => {
                                const composant = articleParId.get(l.article_composant_id);
                                return (
                                  <tr key={l.id}>
                                    <td className="font-medium">
                                      {composant?.designation ?? "Article inconnu"}
                                      {composant && (
                                        <span className="ml-2 font-mono text-xs text-gray-400">{composant.reference}</span>
                                      )}
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
                              {composantsPossibles.map((a) => (
                                <option key={a.id} value={a.id}>{a.reference} — {a.designation}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="etiquette">Quantité</label>
                            <input name="quantite" type="number" min="1" step="1" defaultValue={1} className="champ" />
                          </div>
                          <div className="flex items-end">
                            <button className="btn-secondaire w-full">Ajouter la ligne</button>
                          </div>
                        </form>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </Carte>
    </>
  );
}
