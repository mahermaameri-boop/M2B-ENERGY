"use client";

import { useState } from "react";
import { ScanSeries } from "@/components/scan-series";
import { entreeManuelle } from "./actions";

interface ArticleMin { id: string; reference: string; designation: string; serialise: boolean }

export function EntreeManuelleForm({
  articles,
  fournisseurs,
  voitPrix,
  dateJour,
}: {
  articles: ArticleMin[];
  fournisseurs: { id: string; nom: string }[];
  voitPrix: boolean;
  dateJour: string;
}) {
  const [articleId, setArticleId] = useState(articles[0]?.id ?? "");
  const [series, setSeries] = useState<string[]>([]);

  const article = articles.find((a) => a.id === articleId);
  const serialise = !!article?.serialise;

  return (
    <form action={entreeManuelle} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <label className="etiquette">Article</label>
        <select
          name="article_id" required className="champ"
          value={articleId}
          onChange={(e) => { setArticleId(e.target.value); setSeries([]); }}
        >
          {articles.map((a) => (
            <option key={a.id} value={a.id}>
              {a.reference} — {a.designation}{a.serialise ? " (sérialisé)" : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="etiquette">Date</label>
        <input name="date" type="date" defaultValue={dateJour} className="champ" />
      </div>

      {serialise ? (
        // Article sérialisé : on scanne les n° de série (la quantité = nb de séries)
        <div className="sm:col-span-3">
          <label className="etiquette">
            N° de série (scan douchette ou saisie, puis Entrée) — {series.length} saisi(s)
          </label>
          <ScanSeries series={series} onChange={setSeries} autoFocus />
          <input type="hidden" name="quantite" value="0" />
        </div>
      ) : (
        <div>
          <label className="etiquette">Quantité</label>
          <input name="quantite" type="number" min="0" step="1" defaultValue={0} className="champ" />
        </div>
      )}
      <input type="hidden" name="series" value={series.join("\n")} />

      {voitPrix && (
        <div>
          <label className="etiquette">Prix d'achat unitaire (€)</label>
          <input name="prix_achat" type="number" min="0" step="0.01" defaultValue={0} className="champ" />
        </div>
      )}
      <div>
        <label className="etiquette">Fournisseur (optionnel)</label>
        <select name="fournisseur_id" className="champ">
          <option value="">—</option>
          {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
        </select>
      </div>
      <div>
        <label className="etiquette">N° de facture (optionnel)</label>
        <input name="numero_facture" className="champ" />
      </div>
      <div>
        <label className="etiquette">Motif</label>
        <input name="motif" className="champ" placeholder="Réappro, ajustement…" />
      </div>

      <div className="sm:col-span-3">
        <button className="btn-primaire">Enregistrer l'entrée</button>
      </div>
    </form>
  );
}
