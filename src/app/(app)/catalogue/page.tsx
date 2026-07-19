import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Vide } from "@/components/ui";
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
    supabase
      .from("articles")
      .select("id, reference, designation, categorie, unite, serialise, compose, seuil_manuel, actif")
      .order("categorie")
      .order("designation"),
    supabase.from("compositions").select("id, article_fini_id"),
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

  // Articles finis n'ayant pas encore de composition (pour le formulaire de création).
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
          <CatalogueTable
            articles={listeArticles}
            creerArticle={creerArticle}
            modifierArticle={modifierArticle}
            supprimerArticle={supprimerArticle}
          />
        </Carte>
      </div>

      <Carte titre="Compositions (nomenclature)">
        <details className="mb-4">
          <summary className="btn-secondaire w-fit cursor-pointer">+ Nouvelle composition</summary>
          {articlesSansComposition.length === 0 ? (
            <p className="mt-4 text-sm text-gray-400">
              Tous les articles disposent déjà d&apos;une composition.
            </p>
          ) : (
            <form action={creerComposition} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="etiquette">Article fini</label>
                <select name="article_fini_id" required className="champ">
                  {articlesSansComposition.map((a) => (
                    <option key={a.id} value={a.id}>{a.reference} — {a.designation}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <button className="btn-primaire">Créer la composition</button>
              </div>
            </form>
          )}
        </details>

        {listeCompositions.length === 0 ? (
          <Vide message="Aucune composition." />
        ) : (
          <div className="space-y-4">
            {listeCompositions.map((comp) => {
              const fini = articleParId.get(comp.article_fini_id);
              const lignesComp = lignesParComposition.get(comp.id) ?? [];
              const composantsPossibles = listeArticles.filter((a) => a.id !== comp.article_fini_id);
              return (
                <div key={comp.id} className="rounded-md border border-gray-200 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{fini?.designation ?? "Article inconnu"}</span>
                      {fini && <span className="font-mono text-xs text-gray-400">{fini.reference}</span>}
                    </div>
                    <form action={supprimerComposition}>
                      <input type="hidden" name="id" value={comp.id} />
                      <button className="btn-danger text-xs">Supprimer la composition</button>
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
        )}
      </Carte>
    </>
  );
}
