"use client";

import { useState } from "react";
import { euro } from "@/lib/format";
import { creerCommande } from "./actions";

interface ArticleMin { id: string; reference: string; designation: string }
interface Ligne { article_id: string; quantite: number; prix_unitaire: number }

export function NouvelleCommandeForm({
  fournisseurs,
  articles,
  compositions,
  stockMap,
  prixMap,
  numeroPropose,
  dateJour,
  voitPrix,
}: {
  fournisseurs: { id: string; nom: string }[];
  articles: ArticleMin[];
  compositions: Record<string, { article_composant_id: string; quantite: number }[]>;
  stockMap: Record<string, number>;
  prixMap: Record<string, number>;
  numeroPropose: string;
  dateJour: string;
  voitPrix: boolean;
}) {
  const [lignes, setLignes] = useState<Ligne[]>([{ article_id: "", quantite: 1, prix_unitaire: 0 }]);

  const artById = new Map(articles.map((a) => [a.id, a]));

  function majLigne(i: number, patch: Partial<Ligne>) {
    setLignes((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function ajouterLigne() {
    setLignes((prev) => [...prev, { article_id: "", quantite: 1, prix_unitaire: 0 }]);
  }
  function retirerLigne(i: number) {
    setLignes((prev) => prev.filter((_, idx) => idx !== i));
  }

  function selectionArticle(i: number, article_id: string) {
    majLigne(i, { article_id, prix_unitaire: prixMap[article_id] ?? 0 });
  }

  // Décompose un produit fini : remplace la ligne par les composants manquants
  function decomposer(i: number) {
    const ligne = lignes[i];
    const compo = compositions[ligne.article_id];
    if (!compo) return;
    const q = ligne.quantite || 1;
    const nouvelles: Ligne[] = [];
    for (const c of compo) {
      const besoin = c.quantite * q;
      const stock = stockMap[c.article_composant_id] ?? 0;
      const manque = Math.max(besoin - stock, 0);
      if (manque > 0) {
        nouvelles.push({
          article_id: c.article_composant_id,
          quantite: manque,
          prix_unitaire: prixMap[c.article_composant_id] ?? 0,
        });
      }
    }
    setLignes((prev) => {
      const copie = [...prev];
      copie.splice(i, 1, ...(nouvelles.length ? nouvelles : []));
      return copie.length ? copie : [{ article_id: "", quantite: 1, prix_unitaire: 0 }];
    });
  }

  const total = lignes.reduce((s, l) => s + (l.quantite || 0) * (l.prix_unitaire || 0), 0);

  return (
    <form action={creerCommande} className="space-y-6">
      <div className="carte p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="etiquette">Numéro</label>
            <input name="numero" defaultValue={numeroPropose} className="champ" />
          </div>
          <div>
            <label className="etiquette">Fournisseur</label>
            <select name="fournisseur_id" required className="champ">
              {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="etiquette">Date de commande</label>
            <input name="date_commande" type="date" defaultValue={dateJour} className="champ" />
          </div>
          <div>
            <label className="etiquette">Livraison prévue</label>
            <input name="date_livraison_prevue" type="date" className="champ" />
          </div>
          <div>
            <label className="etiquette">Statut</label>
            <select name="statut" defaultValue="brouillon" className="champ">
              <option value="brouillon">Brouillon</option>
              <option value="en_transit">En transit</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <label className="etiquette">Notes</label>
            <input name="notes" className="champ" />
          </div>
        </div>
      </div>

      <div className="carte p-4">
        <div className="mb-2 text-sm font-semibold text-gray-700">Lignes de commande</div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-1/2">Article</th>
                <th className="text-right">Quantité</th>
                {voitPrix && <th className="text-right">Prix unitaire (€)</th>}
                {voitPrix && <th className="text-right">Sous-total</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => {
                const estFini = !!compositions[l.article_id];
                return (
                  <tr key={i}>
                    <td>
                      <select
                        value={l.article_id}
                        onChange={(e) => selectionArticle(i, e.target.value)}
                        className="champ"
                      >
                        <option value="">— Choisir un article —</option>
                        {articles.map((a) => (
                          <option key={a.id} value={a.id}>{a.reference} — {a.designation}</option>
                        ))}
                      </select>
                      {estFini && (
                        <button
                          type="button"
                          onClick={() => decomposer(i)}
                          className="mt-1 text-xs text-brand-600 hover:underline"
                        >
                          ⤵ Décomposer (commander les composants manquants)
                        </button>
                      )}
                    </td>
                    <td className="text-right">
                      <input
                        type="number" min="0" step="1"
                        value={l.quantite}
                        onChange={(e) => majLigne(i, { quantite: Number(e.target.value) })}
                        className="champ w-24 text-right"
                      />
                    </td>
                    {voitPrix && (
                      <td className="text-right">
                        <input
                          type="number" min="0" step="0.01"
                          value={l.prix_unitaire}
                          onChange={(e) => majLigne(i, { prix_unitaire: Number(e.target.value) })}
                          className="champ w-28 text-right"
                        />
                      </td>
                    )}
                    {voitPrix && <td className="text-right">{euro((l.quantite || 0) * (l.prix_unitaire || 0))}</td>}
                    <td className="text-right">
                      <button type="button" onClick={() => retirerLigne(i)} className="text-xs text-red-600 hover:underline">
                        Retirer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {voitPrix && (
              <tfoot>
                <tr>
                  <td colSpan={3} className="text-right font-semibold">Total commande</td>
                  <td className="text-right font-semibold">{euro(total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <button type="button" onClick={ajouterLigne} className="btn-secondaire mt-3">
          + Ajouter une ligne
        </button>
      </div>

      <input type="hidden" name="lignes" value={JSON.stringify(lignes.filter((l) => l.article_id && l.quantite > 0))} />
      <div className="flex gap-2">
        <button type="submit" className="btn-primaire">Enregistrer la commande</button>
      </div>
    </form>
  );
}
