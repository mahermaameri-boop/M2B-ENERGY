"use client";

import { useState } from "react";
import { ScanSeries } from "@/components/scan-series";
import { effectuerSortie } from "./actions";

interface ArticleMin { id: string; reference: string; designation: string; serialise: boolean }

export function SortieForm({
  chantiers,
  articles,
  dateJour,
}: {
  chantiers: { id: string; libelle: string; client_nom: string }[];
  articles: ArticleMin[];
  dateJour: string;
}) {
  const [series, setSeries] = useState<string[]>([]);
  const [lignes, setLignes] = useState<{ article_id: string; quantite: number }[]>([]);

  const nonSerial = articles.filter((a) => !a.serialise);

  function ajouterLigne() {
    setLignes((p) => [...p, { article_id: nonSerial[0]?.id ?? "", quantite: 1 }]);
  }
  function majLigne(i: number, patch: Partial<{ article_id: string; quantite: number }>) {
    setLignes((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function retirerLigne(i: number) {
    setLignes((p) => p.filter((_, idx) => idx !== i));
  }

  return (
    <form action={effectuerSortie} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="etiquette">Chantier / client</label>
          <select name="chantier_id" required className="champ">
            {chantiers.map((c) => (
              <option key={c.id} value={c.id}>{c.libelle} — {c.client_nom}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="etiquette">Date de sortie</label>
          <input name="date" type="date" defaultValue={dateJour} className="champ" />
        </div>
      </div>

      <div>
        <label className="etiquette">Numéros de série (scan douchette ou saisie) — {series.length} article(s)</label>
        <ScanSeries series={series} onChange={setSeries} placeholder="Scanner le n° de série sur le matériel, puis Entrée" />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="etiquette mb-0">Articles non sérialisés</label>
          <button type="button" onClick={ajouterLigne} className="text-xs text-brand-600 hover:underline">+ Ajouter</button>
        </div>
        {lignes.length === 0 ? (
          <p className="text-xs text-gray-400">Aucune ligne. Utilisez « Ajouter » pour sortir des accessoires, fenêtres, etc.</p>
        ) : (
          <div className="space-y-2">
            {lignes.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={l.article_id}
                  onChange={(e) => majLigne(i, { article_id: e.target.value })}
                  className="champ flex-1"
                >
                  {nonSerial.map((a) => (
                    <option key={a.id} value={a.id}>{a.reference} — {a.designation}</option>
                  ))}
                </select>
                <input
                  type="number" min="1" step="1" value={l.quantite}
                  onChange={(e) => majLigne(i, { quantite: Number(e.target.value) })}
                  className="champ w-24 text-right"
                />
                <button type="button" onClick={() => retirerLigne(i)} className="text-xs text-red-600 hover:underline">
                  Retirer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <input type="hidden" name="series" value={JSON.stringify(series)} />
      <input type="hidden" name="lignes" value={JSON.stringify(lignes.filter((l) => l.article_id && l.quantite > 0))} />

      <button type="submit" className="btn-primaire">
        Générer le bon de sortie (PDF) et débiter le stock
      </button>
    </form>
  );
}
