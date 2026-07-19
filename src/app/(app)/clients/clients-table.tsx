"use client";

import { useMemo, useState } from "react";
import { Badge, Vide } from "@/components/ui";
import { euro, dateFr, nombre } from "@/lib/format";
import type { Client } from "@/lib/types";

type Action = (formData: FormData) => Promise<void>;

// Types locaux tolérants au rôle : ca / cout_sous_traitance ne sont pas
// récupérés pour un collaborateur, ils peuvent donc être absents.
type ChantierLite = {
  id: string;
  client_id: string;
  libelle: string;
  date_prevue: string | null;
  statut: string;
  ca?: number | null;
  cout_sous_traitance?: number | null;
};

type LigneChantier = {
  id: string;
  chantier_id: string;
  article_id: string;
  quantite: number;
};

type ArticleLite = { id: string; reference: string; designation: string };

type CompositionLite = { id: string; article_fini_id: string; nom_variante: string };

const STATUTS: { valeur: string; label: string }[] = [
  { valeur: "planifie", label: "Planifié" },
  { valeur: "realise", label: "Réalisé" },
];

const LABEL_STATUT: Record<string, string> = {
  planifie: "Planifié",
  realise: "Réalisé",
};

const COULEUR_STATUT: Record<string, "vert" | "rouge" | "orange" | "gris" | "bleu"> = {
  planifie: "bleu",
  realise: "vert",
};

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function ClientsTable({
  clients,
  chantiers,
  lignes,
  articles,
  compositions,
  voitCa,
  creerClient,
  modifierClient,
  supprimerClient,
  creerChantier,
  modifierChantier,
  supprimerChantier,
  ajouterLigneChantier,
  supprimerLigneChantier,
}: {
  clients: Client[];
  chantiers: ChantierLite[];
  lignes: LigneChantier[];
  articles: ArticleLite[];
  compositions: CompositionLite[];
  voitCa: boolean;
  creerClient: Action;
  modifierClient: Action;
  supprimerClient: Action;
  creerChantier: Action;
  modifierChantier: Action;
  supprimerChantier: Action;
  ajouterLigneChantier: Action;
  supprimerLigneChantier: Action;
}) {
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [editionClientId, setEditionClientId] = useState<string | null>(null);
  const [clientsDeplies, setClientsDeplies] = useState<Set<string>>(new Set());
  const [creationChantierPour, setCreationChantierPour] = useState<Set<string>>(new Set());
  const [editionChantierId, setEditionChantierId] = useState<string | null>(null);
  const [chantiersDeplies, setChantiersDeplies] = useState<Set<string>>(new Set());

  // Regroupements dérivés des données plates.
  const chantiersParClient = useMemo(() => {
    const m = new Map<string, ChantierLite[]>();
    for (const ch of chantiers) {
      const arr = m.get(ch.client_id) ?? [];
      arr.push(ch);
      m.set(ch.client_id, arr);
    }
    return m;
  }, [chantiers]);

  const lignesParChantier = useMemo(() => {
    const m = new Map<string, LigneChantier[]>();
    for (const l of lignes) {
      const arr = m.get(l.chantier_id) ?? [];
      arr.push(l);
      m.set(l.chantier_id, arr);
    }
    return m;
  }, [lignes]);

  const articleParId = useMemo(() => {
    const m = new Map<string, ArticleLite>();
    for (const a of articles) m.set(a.id, a);
    return m;
  }, [articles]);

  // Variantes de composition regroupées par produit fini (pour l'encodage).
  const variantesParFini = useMemo(() => {
    const m = new Map<string, CompositionLite[]>();
    for (const c of compositions) {
      const arr = m.get(c.article_fini_id) ?? [];
      arr.push(c);
      m.set(c.article_fini_id, arr);
    }
    return m;
  }, [compositions]);

  // Wrappers : appellent la Server Action puis referment l'UI concernée.
  async function envoyerCreationClient(formData: FormData) {
    await creerClient(formData);
    setCreationOuverte(false);
  }
  async function envoyerModificationClient(formData: FormData) {
    await modifierClient(formData);
    setEditionClientId(null);
  }
  async function envoyerCreationChantier(formData: FormData) {
    const clientId = String(formData.get("client_id"));
    await creerChantier(formData);
    setCreationChantierPour((s) => {
      const next = new Set(s);
      next.delete(clientId);
      return next;
    });
  }
  async function envoyerModificationChantier(formData: FormData) {
    await modifierChantier(formData);
    setEditionChantierId(null);
  }

  // Nombre de colonnes du tableau chantiers (pour le colSpan des sous-lignes).
  const colsChantier = voitCa ? 6 : 4;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {clients.length} client{clients.length > 1 ? "s" : ""}
        </p>
        <button
          type="button"
          className="btn-primaire w-fit"
          onClick={() => setCreationOuverte((v) => !v)}
        >
          {creationOuverte ? "Fermer" : "+ Nouveau client"}
        </button>
      </div>

      {creationOuverte && (
        <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-4">
          <form action={envoyerCreationClient} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="etiquette">Nom</label>
              <input name="nom" required className="champ" />
            </div>
            <div>
              <label className="etiquette">Contact</label>
              <input name="contact" className="champ" />
            </div>
            <div className="sm:col-span-2">
              <label className="etiquette">Adresse</label>
              <input name="adresse" className="champ" />
            </div>
            <div className="sm:col-span-2">
              <label className="etiquette">Notes</label>
              <input name="notes" className="champ" />
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

      {clients.length === 0 ? (
        <Vide message="Aucun client." />
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Contact</th>
                {voitCa && <th className="text-right">CA total</th>}
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const lignesClient = chantiersParClient.get(client.id) ?? [];
                const totalCa = lignesClient.reduce((s, ch) => s + Number(ch.ca ?? 0), 0);
                const deplie = clientsDeplies.has(client.id);
                const enEdition = editionClientId === client.id;
                const formId = `edit-client-${client.id}`;
                const colsClient = voitCa ? 4 : 3;

                if (enEdition) {
                  return (
                    <tr key={client.id} className="bg-brand-50/40 align-top">
                      <td>
                        <form id={formId} action={envoyerModificationClient}>
                          <input type="hidden" name="id" value={client.id} />
                        </form>
                        <input name="nom" form={formId} defaultValue={client.nom} className="champ" placeholder="Nom" />
                      </td>
                      <td>
                        <input name="contact" form={formId} defaultValue={client.contact ?? ""} className="champ" placeholder="Contact" />
                      </td>
                      {voitCa && <td className="text-right text-gray-400">—</td>}
                      <td>
                        <div className="flex flex-col items-end gap-2">
                          <div className="grid w-full gap-2">
                            <input name="adresse" form={formId} defaultValue={client.adresse ?? ""} className="champ" placeholder="Adresse" />
                            <input name="notes" form={formId} defaultValue={client.notes ?? ""} className="champ" placeholder="Notes" />
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="submit" form={formId} className="btn-primaire text-xs">Enregistrer</button>
                            <button type="button" className="btn-secondaire text-xs" onClick={() => setEditionClientId(null)}>Annuler</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <ClientRows
                    key={client.id}
                    client={client}
                    chantiers={lignesClient}
                    totalCa={totalCa}
                    deplie={deplie}
                    voitCa={voitCa}
                    colsClient={colsClient}
                    colsChantier={colsChantier}
                    articles={articles}
                    articleParId={articleParId}
                    variantesParFini={variantesParFini}
                    lignesParChantier={lignesParChantier}
                    creationChantierOuverte={creationChantierPour.has(client.id)}
                    editionChantierId={editionChantierId}
                    chantiersDeplies={chantiersDeplies}
                    onToggleClient={() => setClientsDeplies((s) => toggle(s, client.id))}
                    onEditerClient={() => setEditionClientId(client.id)}
                    onToggleCreationChantier={() => setCreationChantierPour((s) => toggle(s, client.id))}
                    onEditerChantier={setEditionChantierId}
                    onToggleChantier={(id) => setChantiersDeplies((s) => toggle(s, id))}
                    supprimerClient={supprimerClient}
                    supprimerChantier={supprimerChantier}
                    supprimerLigneChantier={supprimerLigneChantier}
                    ajouterLigneChantier={ajouterLigneChantier}
                    envoyerCreationChantier={envoyerCreationChantier}
                    envoyerModificationChantier={envoyerModificationChantier}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ClientRows({
  client,
  chantiers,
  totalCa,
  deplie,
  voitCa,
  colsClient,
  colsChantier,
  articles,
  articleParId,
  variantesParFini,
  lignesParChantier,
  creationChantierOuverte,
  editionChantierId,
  chantiersDeplies,
  onToggleClient,
  onEditerClient,
  onToggleCreationChantier,
  onEditerChantier,
  onToggleChantier,
  supprimerClient,
  supprimerChantier,
  supprimerLigneChantier,
  ajouterLigneChantier,
  envoyerCreationChantier,
  envoyerModificationChantier,
}: {
  client: Client;
  chantiers: ChantierLite[];
  totalCa: number;
  deplie: boolean;
  voitCa: boolean;
  colsClient: number;
  colsChantier: number;
  articles: ArticleLite[];
  articleParId: Map<string, ArticleLite>;
  variantesParFini: Map<string, CompositionLite[]>;
  lignesParChantier: Map<string, LigneChantier[]>;
  creationChantierOuverte: boolean;
  editionChantierId: string | null;
  chantiersDeplies: Set<string>;
  onToggleClient: () => void;
  onEditerClient: () => void;
  onToggleCreationChantier: () => void;
  onEditerChantier: (id: string | null) => void;
  onToggleChantier: (id: string) => void;
  supprimerClient: Action;
  supprimerChantier: Action;
  supprimerLigneChantier: Action;
  ajouterLigneChantier: Action;
  envoyerCreationChantier: Action;
  envoyerModificationChantier: Action;
}) {
  return (
    <>
      <tr>
        <td className="font-medium">
          <button type="button" className="text-left text-brand-600 hover:underline" onClick={onToggleClient}>
            {deplie ? "▾ " : "▸ "}{client.nom}
          </button>
        </td>
        <td className="text-gray-500">{client.contact ?? "—"}</td>
        {voitCa && <td className="text-right font-semibold">{euro(totalCa)}</td>}
        <td className="text-right">
          <div className="flex items-center justify-end gap-2">
            <button type="button" className="btn-secondaire text-xs" onClick={onToggleClient}>
              {chantiers.length} chantier{chantiers.length > 1 ? "s" : ""}
            </button>
            <button type="button" className="btn-secondaire text-xs" onClick={onEditerClient}>Modifier</button>
            <form action={supprimerClient}>
              <input type="hidden" name="id" value={client.id} />
              <button className="btn-danger text-xs">Supprimer</button>
            </form>
          </div>
        </td>
      </tr>

      {deplie && (
        <tr>
          <td colSpan={colsClient} className="bg-gray-50/60">
            <div className="space-y-3 p-2">
              {(client.adresse || client.notes) && (
                <div className="text-sm text-gray-500">
                  {client.adresse && <div>{client.adresse}</div>}
                  {client.notes && <div className="text-gray-400">{client.notes}</div>}
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-gray-700">Chantiers</span>
                <button type="button" className="btn-secondaire text-xs" onClick={onToggleCreationChantier}>
                  {creationChantierOuverte ? "Fermer" : "+ Ajouter un chantier"}
                </button>
              </div>

              {creationChantierOuverte && (
                <div className="rounded-md border border-gray-200 bg-white p-3">
                  <form action={envoyerCreationChantier} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input type="hidden" name="client_id" value={client.id} />
                    <div>
                      <label className="etiquette">Référence du chantier</label>
                      <input name="libelle" required className="champ" />
                    </div>
                    <div>
                      <label className="etiquette">Date prévue</label>
                      <input name="date_prevue" type="date" className="champ" />
                    </div>
                    <div>
                      <label className="etiquette">Statut</label>
                      <select name="statut" className="champ" defaultValue="planifie">
                        {STATUTS.map((s) => <option key={s.valeur} value={s.valeur}>{s.label}</option>)}
                      </select>
                    </div>
                    {voitCa && (
                      <>
                        <div>
                          <label className="etiquette">Chiffre d&apos;affaires (€)</label>
                          <input name="ca" type="number" step="0.01" min="0" defaultValue={0} className="champ" />
                        </div>
                        <div>
                          <label className="etiquette">Coût sous-traitance (€)</label>
                          <input name="cout_sous_traitance" type="number" step="0.01" min="0" className="champ" />
                        </div>
                      </>
                    )}
                    <div className="sm:col-span-2">
                      <button className="btn-primaire">Enregistrer le chantier</button>
                    </div>
                  </form>
                </div>
              )}

              {chantiers.length === 0 ? (
                <Vide message="Aucun chantier pour ce client." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Référence</th>
                        <th>Date prévue</th>
                        <th>Statut</th>
                        {voitCa && <th className="text-right">CA</th>}
                        {voitCa && <th className="text-right">Sous-traitance</th>}
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chantiers.map((ch) => (
                        <ChantierRows
                          key={ch.id}
                          chantier={ch}
                          voitCa={voitCa}
                          colsChantier={colsChantier}
                          articles={articles}
                          articleParId={articleParId}
                          variantesParFini={variantesParFini}
                          lignes={lignesParChantier.get(ch.id) ?? []}
                          enEdition={editionChantierId === ch.id}
                          deplie={chantiersDeplies.has(ch.id)}
                          onEditer={() => onEditerChantier(ch.id)}
                          onAnnulerEdition={() => onEditerChantier(null)}
                          onToggle={() => onToggleChantier(ch.id)}
                          supprimerChantier={supprimerChantier}
                          supprimerLigneChantier={supprimerLigneChantier}
                          ajouterLigneChantier={ajouterLigneChantier}
                          envoyerModificationChantier={envoyerModificationChantier}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ChantierRows({
  chantier,
  voitCa,
  colsChantier,
  articles,
  articleParId,
  variantesParFini,
  lignes,
  enEdition,
  deplie,
  onEditer,
  onAnnulerEdition,
  onToggle,
  supprimerChantier,
  supprimerLigneChantier,
  ajouterLigneChantier,
  envoyerModificationChantier,
}: {
  chantier: ChantierLite;
  voitCa: boolean;
  colsChantier: number;
  articles: ArticleLite[];
  articleParId: Map<string, ArticleLite>;
  variantesParFini: Map<string, CompositionLite[]>;
  lignes: LigneChantier[];
  enEdition: boolean;
  deplie: boolean;
  onEditer: () => void;
  onAnnulerEdition: () => void;
  onToggle: () => void;
  supprimerChantier: Action;
  supprimerLigneChantier: Action;
  ajouterLigneChantier: Action;
  envoyerModificationChantier: Action;
}) {
  const ch = chantier;
  const formId = `edit-chantier-${ch.id}`;

  // Article sélectionné dans le formulaire d'ajout de matériel (pour proposer
  // la variante quand le produit composé en a plusieurs).
  const [articleSel, setArticleSel] = useState<string>(articles[0]?.id ?? "");
  const variantes = variantesParFini.get(articleSel) ?? [];

  if (enEdition) {
    return (
      <tr className="bg-brand-50/40 align-top">
        <td>
          <form id={formId} action={envoyerModificationChantier}>
            <input type="hidden" name="id" value={ch.id} />
          </form>
          <input name="libelle" form={formId} defaultValue={ch.libelle} className="champ" placeholder="Référence" />
        </td>
        <td>
          <input name="date_prevue" type="date" form={formId} defaultValue={ch.date_prevue ?? ""} className="champ" />
        </td>
        <td>
          <select name="statut" form={formId} defaultValue={ch.statut} className="champ">
            {STATUTS.map((s) => <option key={s.valeur} value={s.valeur}>{s.label}</option>)}
          </select>
        </td>
        {voitCa && (
          <td>
            <input name="ca" type="number" step="0.01" min="0" form={formId} defaultValue={Number(ch.ca ?? 0)} className="champ text-right" placeholder="CA (€)" />
          </td>
        )}
        {voitCa && (
          <td>
            <input name="cout_sous_traitance" type="number" step="0.01" min="0" form={formId} defaultValue={ch.cout_sous_traitance ?? ""} className="champ text-right" placeholder="Sous-traitance (€)" />
          </td>
        )}
        <td>
          <div className="flex items-center justify-end gap-2">
            <button type="submit" form={formId} className="btn-primaire text-xs">Enregistrer</button>
            <button type="button" className="btn-secondaire text-xs" onClick={onAnnulerEdition}>Annuler</button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr>
        <td className="font-medium">
          <button type="button" className="text-left text-brand-600 hover:underline" onClick={onToggle}>
            {deplie ? "▾ " : "▸ "}{ch.libelle}
          </button>
        </td>
        <td className="text-gray-500">{dateFr(ch.date_prevue)}</td>
        <td><Badge couleur={COULEUR_STATUT[ch.statut] ?? "gris"}>{LABEL_STATUT[ch.statut] ?? ch.statut}</Badge></td>
        {voitCa && <td className="text-right font-semibold">{euro(ch.ca ?? 0)}</td>}
        {voitCa && <td className="text-right">{euro(ch.cout_sous_traitance)}</td>}
        <td className="text-right">
          <div className="flex items-center justify-end gap-2">
            <button type="button" className="btn-secondaire text-xs" onClick={onToggle}>
              Matériel ({lignes.length})
            </button>
            <button type="button" className="btn-secondaire text-xs" onClick={onEditer}>Modifier</button>
            <form action={supprimerChantier}>
              <input type="hidden" name="id" value={ch.id} />
              <button className="btn-danger text-xs">Supprimer</button>
            </form>
          </div>
        </td>
      </tr>

      {deplie && (
        <tr>
          <td colSpan={colsChantier} className="bg-white">
            <div className="space-y-3 p-2">
              <span className="text-sm font-semibold text-gray-700">Matériel à poser</span>

              {lignes.length === 0 ? (
                <Vide message="Aucun matériel pour ce chantier." />
              ) : (
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Désignation</th>
                      <th className="text-right">Quantité</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) => {
                      const art = articleParId.get(l.article_id);
                      return (
                        <tr key={l.id}>
                          <td className="font-medium">
                            {art?.designation ?? "Article inconnu"}
                            {art && <span className="ml-2 font-mono text-xs text-gray-400">{art.reference}</span>}
                          </td>
                          <td className="text-right">{nombre(l.quantite)}</td>
                          <td className="text-right">
                            <form action={supprimerLigneChantier}>
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

              <form action={ajouterLigneChantier} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <input type="hidden" name="chantier_id" value={ch.id} />
                <div className="sm:col-span-2">
                  <label className="etiquette">Article</label>
                  <select
                    name="article_id"
                    required
                    className="champ"
                    value={articleSel}
                    onChange={(e) => setArticleSel(e.target.value)}
                  >
                    {articles.map((a) => (
                      <option key={a.id} value={a.id}>{a.reference} — {a.designation}</option>
                    ))}
                  </select>
                  {variantes.length >= 2 && (
                    <div className="mt-2">
                      <label className="etiquette">Variante</label>
                      <select name="composition_id" className="champ">
                        {variantes.map((v) => (
                          <option key={v.id} value={v.id}>{v.nom_variante}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <label className="etiquette">Quantité</label>
                  <input name="quantite" type="number" min="1" step="1" defaultValue={1} className="champ" />
                </div>
                <div className="flex items-end">
                  <button className="btn-secondaire w-full">Ajouter</button>
                </div>
              </form>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
