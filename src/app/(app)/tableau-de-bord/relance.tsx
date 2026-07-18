"use client";

import { useState } from "react";
import { dateFr } from "@/lib/format";
import { enregistrerSousTraitance } from "./actions";

export interface ChantierACompleter {
  id: string;
  libelle: string;
  client: string;
  date_prevue: string | null;
}

// Fenêtre de relance (Admin) : invite à saisir le coût de sous-traitance des
// chantiers réalisés dont le coût n'est pas encore renseigné. Fermable, mais les
// chantiers restent listés (carte « À compléter ») tant que ce n'est pas saisi.
export function RelanceSousTraitance({ chantiers }: { chantiers: ChantierACompleter[] }) {
  const [ouvert, setOuvert] = useState(true);
  if (chantiers.length === 0 || !ouvert) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">
            Coût de sous-traitance à compléter ({chantiers.length})
          </h2>
          <button onClick={() => setOuvert(false)} className="text-gray-400 hover:text-gray-700" aria-label="Fermer">×</button>
        </div>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
          <p className="text-sm text-gray-500">
            Ces chantiers sont passés : saisissez le prix du sous-traitant pour compléter la marge.
          </p>
          {chantiers.map((c) => (
            <form key={c.id} action={enregistrerSousTraitance} className="flex items-end gap-2 rounded-md border border-gray-100 p-2">
              <input type="hidden" name="chantier_id" value={c.id} />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-800">{c.libelle}</div>
                <div className="text-xs text-gray-400">{c.client} · {dateFr(c.date_prevue)}</div>
              </div>
              <div>
                <label className="etiquette">Sous-traitance (€)</label>
                <input name="cout_sous_traitance" type="number" min="0" step="0.01" required className="champ w-32 text-right" />
              </div>
              <button className="btn-primaire">Enregistrer</button>
            </form>
          ))}
        </div>
        <div className="border-t border-gray-200 px-4 py-3 text-right">
          <button onClick={() => setOuvert(false)} className="btn-secondaire">Plus tard</button>
        </div>
      </div>
    </div>
  );
}
