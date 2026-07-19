"use client";

import { useMemo, useState } from "react";
import { Carte, Badge, Vide } from "@/components/ui";
import { euro, nombre, dateFr } from "@/lib/format";
import { creerCommandesGroupees } from "./actions";

export interface LigneArticle {
  article_id: string;
  designation: string;
  reference: string;
  quantite: number;
  chantiers: { libelle: string; date_prevue: string | null; urgent: boolean }[];
  urgence: boolean;
  rupture: boolean;
  delaiLong: boolean;
  fournisseur: { id: string; nom: string; prix: number | null; delai: number | null } | null;
}

export function SelectionAchats({
  lignes,
  voitPrix,
}: {
  lignes: LigneArticle[];
  voitPrix: boolean;
}) {
  const [selection, setSelection] = useState<Set<string>>(new Set());

  const toutSelectionne = lignes.length > 0 && selection.size === lignes.length;

  function basculer(id: string) {
    setSelection((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  function basculerTout() {
    setSelection((prev) =>
      prev.size === lignes.length ? new Set() : new Set(lignes.map((l) => l.article_id)),
    );
  }

  // Charge utile envoyée à la Server Action : article + fournisseur conseillé (si connu).
  const payload = useMemo(
    () =>
      lignes
        .filter((l) => selection.has(l.article_id))
        .map((l) => ({ article_id: l.article_id, fournisseur_id: l.fournisseur?.id ?? "" })),
    [lignes, selection],
  );

  if (lignes.length === 0) {
    return (
      <Carte>
        <Vide message="Aucun besoin à commander." />
      </Carte>
    );
  }

  // Nombre de colonnes financières (fournisseur / prix / délai) affichées.
  const colFinancieres = voitPrix ? 3 : 0;

  return (
    <form action={creerCommandesGroupees}>
      <input type="hidden" name="lignes" value={JSON.stringify(payload)} />

      <Carte titre="Besoins à commander — consolidés par article">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-8">
                  <input
                    type="checkbox"
                    checked={toutSelectionne}
                    onChange={basculerTout}
                    aria-label="Tout sélectionner"
                  />
                </th>
                <th>Article</th>
                <th className="text-right">Qté à commander</th>
                <th>Chantiers (pose)</th>
                {voitPrix && <th>Fournisseur conseillé</th>}
                {voitPrix && <th className="text-right">Prix unitaire</th>}
                {voitPrix && <th className="text-right">Délai</th>}
                <th>Alertes</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => {
                const coche = selection.has(l.article_id);
                return (
                  <tr key={l.article_id} className={coche ? "bg-brand-50/40" : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={coche}
                        onChange={() => basculer(l.article_id)}
                        aria-label={`Sélectionner ${l.designation}`}
                      />
                    </td>
                    <td className="font-medium">
                      {l.designation}{" "}
                      <span className="font-mono text-xs text-gray-400">{l.reference}</span>
                    </td>
                    <td className="text-right font-semibold">{nombre(l.quantite)}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {l.chantiers.map((c, i) => (
                          <span
                            key={i}
                            className={`text-xs ${c.urgent ? "font-medium text-red-600" : "text-gray-600"}`}
                          >
                            {c.libelle}
                            {c.date_prevue ? ` (${dateFr(c.date_prevue)})` : ""}
                            {i < l.chantiers.length - 1 ? "," : ""}
                          </span>
                        ))}
                      </div>
                    </td>
                    {voitPrix && <td>{l.fournisseur?.nom ?? "—"}</td>}
                    {voitPrix && (
                      <td className="text-right">
                        {l.fournisseur?.prix != null ? euro(l.fournisseur.prix) : "—"}
                      </td>
                    )}
                    {voitPrix && (
                      <td className="text-right">
                        {l.fournisseur?.delai != null ? `${nombre(l.fournisseur.delai)} j` : "—"}
                      </td>
                    )}
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {l.urgence && <Badge couleur="rouge">Urgent</Badge>}
                        {l.rupture && <Badge couleur="rouge">Rupture</Badge>}
                        {l.delaiLong && <Badge couleur="orange">Délai long</Badge>}
                        {!l.urgence && !l.rupture && !l.delaiLong && (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-gray-500">
            {nombre(selection.size)} article(s) sélectionné(s)
            {colFinancieres === 0 && (
              <span className="ml-1 text-gray-400">
                · le fournisseur le moins cher sera choisi automatiquement
              </span>
            )}
          </span>
          <button
            type="submit"
            className="btn inline-flex bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            disabled={selection.size === 0}
          >
            Créer les commandes (par fournisseur)
          </button>
        </div>
      </Carte>
    </form>
  );
}
