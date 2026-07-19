"use client";

import { useState } from "react";
import { Badge, Vide } from "@/components/ui";
import { nombre } from "@/lib/format";
import { CATEGORIES_ARTICLE } from "@/lib/types";
import type { Article } from "@/lib/types";

type ActionArticle = (formData: FormData) => Promise<void>;

const CATEGORIE_DEFAUT = "Accessoires";

export function CatalogueTable({
  articles,
  creerArticle,
  modifierArticle,
  supprimerArticle,
}: {
  articles: Article[];
  creerArticle: ActionArticle;
  modifierArticle: ActionArticle;
  supprimerArticle: ActionArticle;
}) {
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [editionId, setEditionId] = useState<string | null>(null);

  // Wrappers clients : appellent la Server Action puis referment l'UI.
  async function envoyerCreation(formData: FormData) {
    await creerArticle(formData);
    setCreationOuverte(false);
  }

  async function envoyerModification(formData: FormData) {
    await modifierArticle(formData);
    setEditionId(null);
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {articles.length} article{articles.length > 1 ? "s" : ""}
        </p>
        <button
          type="button"
          className="btn-primaire w-fit"
          onClick={() => setCreationOuverte((v) => !v)}
        >
          {creationOuverte ? "Fermer" : "+ Nouvel article"}
        </button>
      </div>

      {creationOuverte && (
        <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-4">
          <form action={envoyerCreation} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="etiquette">Référence</label>
              <input name="reference" required className="champ" />
            </div>
            <div>
              <label className="etiquette">Désignation</label>
              <input name="designation" required className="champ" />
            </div>
            <div>
              <label className="etiquette">Catégorie</label>
              <select name="categorie" className="champ" defaultValue={CATEGORIE_DEFAUT}>
                {CATEGORIES_ARTICLE.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="etiquette">Unité</label>
              <input name="unite" defaultValue="pièce" className="champ" />
            </div>
            <div>
              <label className="etiquette">Seuil manuel</label>
              <input name="seuil_manuel" type="number" min="0" defaultValue={0} className="champ" />
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input name="serialise" type="checkbox" /> Sérialisé
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input name="compose" type="checkbox" /> Composé
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input name="actif" type="checkbox" defaultChecked /> Actif
              </label>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <button className="btn-primaire">Enregistrer</button>
              <button
                type="button"
                className="btn-secondaire"
                onClick={() => setCreationOuverte(false)}
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {articles.length === 0 ? (
        <Vide message="Aucun article." />
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Désignation</th>
                <th>Catégorie</th>
                <th>Attributs</th>
                <th className="text-right">Seuil</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => {
                const enEdition = editionId === a.id;
                const formId = `edit-${a.id}`;

                if (!enEdition) {
                  return (
                    <tr key={a.id}>
                      <td className="font-mono text-xs text-gray-500">{a.reference}</td>
                      <td className="font-medium">{a.designation}</td>
                      <td>{a.categorie}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {a.serialise && <Badge couleur="bleu">Sérialisé</Badge>}
                          {a.compose && <Badge couleur="orange">Composé</Badge>}
                          {a.actif ? (
                            <Badge couleur="vert">Actif</Badge>
                          ) : (
                            <Badge couleur="gris">Inactif</Badge>
                          )}
                        </div>
                      </td>
                      <td className="text-right">{nombre(a.seuil_manuel)}</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className="btn-secondaire text-xs"
                            onClick={() => setEditionId(a.id)}
                          >
                            Modifier
                          </button>
                          <form action={supprimerArticle}>
                            <input type="hidden" name="id" value={a.id} />
                            <button className="btn-danger text-xs">Supprimer</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                }

                // Ligne en édition : inputs inline (associés au form via l'attribut `form`).
                return (
                  <tr key={a.id} className="bg-brand-50/40 align-top">
                    <td>
                      <form id={formId} action={envoyerModification}>
                        <input type="hidden" name="id" value={a.id} />
                      </form>
                      <input
                        name="reference"
                        form={formId}
                        defaultValue={a.reference}
                        className="champ"
                        placeholder="Référence"
                      />
                    </td>
                    <td>
                      <input
                        name="designation"
                        form={formId}
                        defaultValue={a.designation}
                        className="champ"
                        placeholder="Désignation"
                      />
                    </td>
                    <td>
                      <select
                        name="categorie"
                        form={formId}
                        defaultValue={a.categorie}
                        className="champ"
                      >
                        {CATEGORIES_ARTICLE.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input name="serialise" type="checkbox" form={formId} defaultChecked={a.serialise} />
                          Sérialisé
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input name="compose" type="checkbox" form={formId} defaultChecked={a.compose} />
                          Composé
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input name="actif" type="checkbox" form={formId} defaultChecked={a.actif} />
                          Actif
                        </label>
                      </div>
                    </td>
                    <td>
                      <input
                        name="seuil_manuel"
                        type="number"
                        min="0"
                        form={formId}
                        defaultValue={a.seuil_manuel}
                        className="champ text-right"
                      />
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        <button type="submit" form={formId} className="btn-primaire text-xs">
                          Enregistrer
                        </button>
                        <button
                          type="button"
                          className="btn-secondaire text-xs"
                          onClick={() => setEditionId(null)}
                        >
                          Annuler
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
