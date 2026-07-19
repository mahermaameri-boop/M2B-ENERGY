"use client";

import { useMemo, useState } from "react";
import { ScanSeries } from "@/components/scan-series";
import { nombre } from "@/lib/format";
import { effectuerSortie } from "./actions";

interface Composant {
  reservation_id: string;
  article_id: string;
  reference: string;
  designation: string;
  serialise: boolean;
  quantite: number;
}

export function SortieForm({
  chantiers,
  composantsParChantier,
  dateJour,
}: {
  chantiers: { id: string; libelle: string; client_nom: string }[];
  composantsParChantier: Record<string, Composant[]>;
  dateJour: string;
}) {
  const [chantierId, setChantierId] = useState(chantiers[0]?.id ?? "");
  // n° de série scannés, regroupés par article sérialisé
  const [seriesParArticle, setSeriesParArticle] = useState<Record<string, string[]>>({});

  const composants = composantsParChantier[chantierId] ?? [];
  const serialises = composants.filter((c) => c.serialise);
  const nonSerialises = composants.filter((c) => !c.serialise);

  function majSeries(articleId: string, s: string[]) {
    setSeriesParArticle((p) => ({ ...p, [articleId]: s }));
  }

  function changerChantier(id: string) {
    setChantierId(id);
    setSeriesParArticle({}); // le scan est propre à chaque chantier
  }

  // Séries à plat pour le serveur (effectuerSortie retrouve l'article par n° de série).
  const seriesAplat = useMemo(
    () => serialises.flatMap((c) => seriesParArticle[c.article_id] ?? []),
    [serialises, seriesParArticle],
  );
  // Lignes non sérialisées reprises automatiquement.
  const lignes = useMemo(
    () => nonSerialises.map((c) => ({ article_id: c.article_id, quantite: c.quantite })),
    [nonSerialises],
  );

  // Chaque composant sérialisé doit avoir autant de n° de série que sa quantité.
  const complet =
    composants.length > 0 &&
    serialises.every((c) => (seriesParArticle[c.article_id]?.length ?? 0) >= c.quantite);

  return (
    <form action={effectuerSortie} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="etiquette">Chantier planifié / client</label>
          <select
            name="chantier_id"
            required
            value={chantierId}
            onChange={(e) => changerChantier(e.target.value)}
            className="champ"
          >
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
        <label className="etiquette">Composition attendue du chantier</label>
        {composants.length === 0 ? (
          <p className="text-xs text-gray-400">
            Ce chantier n'a aucune composition. Ajoutez le matériel à poser dans Clients & chantiers.
          </p>
        ) : (
          <div className="space-y-3">
            {serialises.map((c) => {
              const scannes = seriesParArticle[c.article_id]?.length ?? 0;
              return (
                <div key={c.reservation_id} className="rounded border border-gray-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-medium">{c.designation}</span>
                      <span className="ml-1 text-gray-400">{c.reference}</span>
                    </div>
                    <span className={`text-xs ${scannes >= c.quantite ? "text-emerald-600" : "text-gray-500"}`}>
                      {scannes}/{nombre(c.quantite)} saisis
                    </span>
                  </div>
                  <ScanSeries
                    series={seriesParArticle[c.article_id] ?? []}
                    onChange={(s) => majSeries(c.article_id, s)}
                    placeholder="Scanner le n° de série sur le matériel, puis Entrée"
                  />
                </div>
              );
            })}

            {nonSerialises.map((c) => (
              <div key={c.reservation_id} className="flex items-center justify-between rounded border border-gray-100 bg-gray-50 px-3 py-2">
                <div className="text-sm">
                  <span className="font-medium">{c.designation}</span>
                  <span className="ml-1 text-gray-400">{c.reference}</span>
                </div>
                <span className="text-xs text-gray-500">{nombre(c.quantite)} — repris automatiquement</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <input type="hidden" name="series" value={JSON.stringify(seriesAplat)} />
      <input type="hidden" name="lignes" value={JSON.stringify(lignes)} />

      <button type="submit" disabled={!complet} className="btn-primaire disabled:cursor-not-allowed disabled:opacity-50">
        Générer le bon de sortie (PDF) et débiter le stock
      </button>
    </form>
  );
}
