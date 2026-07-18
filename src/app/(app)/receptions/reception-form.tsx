"use client";

import { useState } from "react";
import { nombre } from "@/lib/format";
import { ScanSeries } from "@/components/scan-series";
import { receptionnerCommande } from "./actions";

interface LigneIn {
  id: string;
  article_id: string;
  reference: string;
  designation: string;
  serialise: boolean;
  quantite: number;
  quantite_recue: number;
  prix_unitaire: number;
}

interface EtatLigne {
  quantite_recue: number;
  series: string[];
}

export function ReceptionForm({
  commande,
  lignes,
  dateJour,
}: {
  commande: { id: string; numero: string; fournisseur_nom: string };
  lignes: LigneIn[];
  dateJour: string;
}) {
  const [etat, setEtat] = useState<Record<string, EtatLigne>>(() =>
    Object.fromEntries(lignes.map((l) => [l.id, { quantite_recue: Math.max(l.quantite - l.quantite_recue, 0), series: [] }])),
  );

  function maj(id: string, patch: Partial<EtatLigne>) {
    setEtat((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  const payload = lignes.map((l) => {
    const e = etat[l.id];
    return {
      ligne_id: l.id,
      article_id: l.article_id,
      serialise: l.serialise,
      quantite_recue: l.serialise ? e.series.length : e.quantite_recue,
      series: e.series,
      prix_unitaire: l.prix_unitaire,
    };
  }).filter((l) => l.quantite_recue > 0);

  return (
    <form action={receptionnerCommande} className="space-y-6">
      <input type="hidden" name="commande_id" value={commande.id} />
      <input type="hidden" name="lignes" value={JSON.stringify(payload)} />

      <div className="carte p-4">
        <div className="mb-3 text-sm font-semibold text-gray-700">Facture d'achat</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="etiquette">N° de facture</label>
            <input name="facture_numero" className="champ" placeholder="FA-2026-…" />
          </div>
          <div>
            <label className="etiquette">Fournisseur</label>
            <input className="champ bg-gray-50" value={commande.fournisseur_nom} disabled />
          </div>
          <div>
            <label className="etiquette">Date de facture</label>
            <input name="facture_date" type="date" defaultValue={dateJour} className="champ" />
          </div>
        </div>
      </div>

      <div className="carte p-4">
        <div className="mb-3 text-sm font-semibold text-gray-700">Articles à réceptionner</div>
        <div className="space-y-4">
          {lignes.map((l) => {
            const e = etat[l.id];
            const reste = Math.max(l.quantite - l.quantite_recue, 0);
            return (
              <div key={l.id} className="rounded-md border border-gray-100 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <span className="font-medium">{l.designation}</span>
                    <span className="ml-2 font-mono text-xs text-gray-400">{l.reference}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Commandé {nombre(l.quantite)} · déjà reçu {nombre(l.quantite_recue)} · reste {nombre(reste)}
                  </div>
                </div>
                {l.serialise ? (
                  <div>
                    <label className="etiquette">
                      N° de série (scan douchette ou saisie) — {nombre(e.series.length)} saisi(s)
                    </label>
                    <ScanSeries series={e.series} onChange={(s) => maj(l.id, { series: s })} />
                  </div>
                ) : (
                  <div className="w-40">
                    <label className="etiquette">Quantité reçue</label>
                    <input
                      type="number" min="0" step="1"
                      value={e.quantite_recue}
                      onChange={(ev) => maj(l.id, { quantite_recue: Number(ev.target.value) })}
                      className="champ text-right"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <button type="submit" className="btn-primaire">Valider la réception</button>
    </form>
  );
}
