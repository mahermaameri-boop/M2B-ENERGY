"use client";

import { useState } from "react";
import { enregistrerRetour } from "./actions";

interface Opt { id: string; label: string }

export function RetourForm({
  bons,
  commandes,
  articles,
  dateJour,
}: {
  bons: Opt[];
  commandes: Opt[];
  articles: { id: string; reference: string; designation: string }[];
  dateJour: string;
}) {
  const [type, setType] = useState<"chantier_non_installe" | "defectueux_sav" | "commande">("chantier_non_installe");

  const selArticle = (
    <div>
      <label className="etiquette">Article</label>
      <select name="article_id" className="champ">
        <option value="">— (déduit de la série si scannée) —</option>
        {articles.map((a) => <option key={a.id} value={a.id}>{a.reference} — {a.designation}</option>)}
      </select>
    </div>
  );
  const champSerie = (obligatoire?: boolean) => (
    <div>
      <label className="etiquette">N° de série {obligatoire ? "" : "(optionnel)"}</label>
      <input name="numero_serie" className="champ" placeholder="Scanner ou saisir" />
    </div>
  );
  const champQuantite = (
    <div>
      <label className="etiquette">Quantité (si non sérialisé)</label>
      <input name="quantite" type="number" min="1" defaultValue={1} className="champ" />
    </div>
  );
  const champMotif = (
    <div className="sm:col-span-2">
      <label className="etiquette">Motif</label>
      <input name="motif" className="champ" placeholder="Contrainte technique, défaut constaté…" />
    </div>
  );

  return (
    <form action={enregistrerRetour} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className="etiquette">Type de retour</label>
        <select name="type" value={type} onChange={(e) => setType(e.target.value as any)} className="champ">
          <option value="chantier_non_installe">Retour chantier (non installé) → réintégration stock</option>
          <option value="defectueux_sav">Défectueux / SAV → renvoi fournisseur (garantie)</option>
          <option value="commande">Annulation / retour de commande → avoir</option>
        </select>
      </div>
      <div>
        <label className="etiquette">Date</label>
        <input name="date" type="date" defaultValue={dateJour} className="champ" />
      </div>

      {type === "chantier_non_installe" && (
        <>
          <div>
            <label className="etiquette">Bon de sortie d'origine</label>
            <select name="bon_de_sortie_id" className="champ">
              <option value="">—</option>
              {bons.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </div>
          {champSerie()}
          {selArticle}
          {champQuantite}
          {champMotif}
        </>
      )}

      {type === "defectueux_sav" && (
        <>
          {champSerie(true)}
          {selArticle}
          {champQuantite}
          {champMotif}
        </>
      )}

      {type === "commande" && (
        <>
          <div>
            <label className="etiquette">Commande concernée</label>
            <select name="commande_id" className="champ">
              <option value="">—</option>
              {commandes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          {selArticle}
          {champQuantite}
          <div>
            <label className="etiquette">Montant de l'avoir (€)</label>
            <input name="avoir_montant" type="number" step="0.01" min="0" className="champ" />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="marchandise_renvoyee" className="h-4 w-4" />
            Marchandise déjà reçue puis renvoyée au fournisseur (sortie de stock)
          </label>
          {champMotif}
        </>
      )}

      <div className="sm:col-span-2">
        <button type="submit" className="btn-primaire">Enregistrer le retour</button>
      </div>
    </form>
  );
}
