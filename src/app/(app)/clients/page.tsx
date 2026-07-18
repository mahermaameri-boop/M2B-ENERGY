import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Carte, Badge, Vide, EnTetePage } from "@/components/ui";
import { euro, dateFr } from "@/lib/format";
import type { Client, Chantier } from "@/lib/types";
import {
  creerClient, modifierClient, supprimerClient,
  creerChantier, modifierChantier, supprimerChantier,
} from "./actions";

export const dynamic = "force-dynamic";

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

export default async function ClientsPage() {
  const profil = await requireProfil();
  const voitCa = profil.role === "admin";
  const supabase = createClient();

  // Sélection dépendante du rôle : les colonnes financières (ca,
  // cout_sous_traitance) ne sont même pas récupérées pour un non-admin.
  const champsChantier = voitCa
    ? "id, client_id, libelle, date_prevue, statut, ca, cout_sous_traitance"
    : "id, client_id, libelle, date_prevue, statut";

  const [{ data: clients }, { data: chantiers }] = await Promise.all([
    supabase.from("clients").select("*").order("nom"),
    supabase.from("chantiers").select(champsChantier).order("date_prevue"),
  ]);

  const parClient = new Map<string, Chantier[]>();
  for (const c of (chantiers as Chantier[] | null) ?? []) {
    const l = parClient.get(c.client_id) ?? [];
    l.push(c);
    parClient.set(c.client_id, l);
  }

  const listeClients = (clients as Client[] | null) ?? [];

  return (
    <>
      <EnTetePage
        titre={voitCa ? "Clients & CA" : "Clients"}
        description={
          voitCa
            ? "Fiches clients, chantiers et chiffre d'affaires saisi par chantier."
            : "Fiches clients et chantiers."
        }
      />

      <Carte titre="Clients">
        <details className="mb-4">
          <summary className="btn-primaire w-fit cursor-pointer">+ Nouveau client</summary>
          <form action={creerClient} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="etiquette">Nom</label><input name="nom" required className="champ" /></div>
            <div><label className="etiquette">Contact</label><input name="contact" className="champ" /></div>
            <div className="sm:col-span-2"><label className="etiquette">Adresse</label><input name="adresse" className="champ" /></div>
            <div className="sm:col-span-2"><label className="etiquette">Notes</label><input name="notes" className="champ" /></div>
            <div className="sm:col-span-2"><button className="btn-primaire">Enregistrer</button></div>
          </form>
        </details>

        {listeClients.length === 0 ? (
          <Vide message="Aucun client." />
        ) : (
          <div className="space-y-4">
            {listeClients.map((client) => {
              const lignes = parClient.get(client.id) ?? [];
              const totalCa = lignes.reduce((s, ch) => s + Number(ch.ca ?? 0), 0);
              return (
                <div key={client.id} className="rounded-md border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-semibold text-gray-900">{client.nom}</span>
                        {voitCa && <Badge couleur="bleu">CA {euro(totalCa)}</Badge>}
                      </div>
                      <div className="mt-1 space-y-0.5 text-sm text-gray-500">
                        {client.contact && <div>{client.contact}</div>}
                        {client.adresse && <div>{client.adresse}</div>}
                        {client.notes && <div className="text-gray-400">{client.notes}</div>}
                      </div>
                    </div>
                    <details>
                      <summary className="cursor-pointer text-xs text-brand-600">Modifier</summary>
                      <form action={modifierClient} className="mt-2 grid gap-2 text-left">
                        <input type="hidden" name="id" value={client.id} />
                        <input name="nom" defaultValue={client.nom} className="champ" placeholder="Nom" />
                        <input name="contact" defaultValue={client.contact ?? ""} className="champ" placeholder="Contact" />
                        <input name="adresse" defaultValue={client.adresse ?? ""} className="champ" placeholder="Adresse" />
                        <input name="notes" defaultValue={client.notes ?? ""} className="champ" placeholder="Notes" />
                        <button className="btn-primaire">Mettre à jour</button>
                      </form>
                      <form action={supprimerClient} className="mt-2">
                        <input type="hidden" name="id" value={client.id} />
                        <button className="btn-danger w-full text-xs">Supprimer</button>
                      </form>
                    </details>
                  </div>

                  <div className="mt-4">
                    <details className="mb-3">
                      <summary className="btn-secondaire w-fit cursor-pointer text-xs">+ Ajouter un chantier</summary>
                      <form action={creerChantier} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <input type="hidden" name="client_id" value={client.id} />
                        <div><label className="etiquette">Référence du chantier</label><input name="libelle" required className="champ" /></div>
                        <div><label className="etiquette">Date prévue</label><input name="date_prevue" type="date" className="champ" /></div>
                        <div>
                          <label className="etiquette">Statut</label>
                          <select name="statut" className="champ" defaultValue="en_cours">
                            {STATUTS.map((s) => <option key={s.valeur} value={s.valeur}>{s.label}</option>)}
                          </select>
                        </div>
                        {voitCa && (
                          <>
                            <div><label className="etiquette">Chiffre d&apos;affaires (€)</label><input name="ca" type="number" step="0.01" min="0" defaultValue={0} className="champ" /></div>
                            <div><label className="etiquette">Coût sous-traitance (€)</label><input name="cout_sous_traitance" type="number" step="0.01" min="0" defaultValue={0} className="champ" /></div>
                          </>
                        )}
                        <div className="sm:col-span-2"><button className="btn-primaire">Enregistrer</button></div>
                      </form>
                    </details>

                    {lignes.length === 0 ? (
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
                              {voitCa && <th className="text-right">Coût sous-traitance</th>}
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {lignes.map((ch) => (
                              <tr key={ch.id}>
                                <td className="font-medium">{ch.libelle}</td>
                                <td className="text-gray-500">{dateFr(ch.date_prevue)}</td>
                                <td><Badge couleur={COULEUR_STATUT[ch.statut] ?? "gris"}>{LABEL_STATUT[ch.statut] ?? ch.statut}</Badge></td>
                                {voitCa && <td className="text-right font-semibold">{euro(ch.ca)}</td>}
                                {voitCa && <td className="text-right">{euro(ch.cout_sous_traitance)}</td>}
                                <td className="text-right">
                                  <details>
                                    <summary className="cursor-pointer text-xs text-brand-600">Modifier</summary>
                                    <form action={modifierChantier} className="mt-2 grid gap-2 text-left">
                                      <input type="hidden" name="id" value={ch.id} />
                                      <input name="libelle" defaultValue={ch.libelle} className="champ" placeholder="Référence" />
                                      <input name="date_prevue" type="date" defaultValue={ch.date_prevue ?? ""} className="champ" />
                                      <select name="statut" className="champ" defaultValue={ch.statut}>
                                        {STATUTS.map((s) => <option key={s.valeur} value={s.valeur}>{s.label}</option>)}
                                      </select>
                                      {voitCa && (
                                        <>
                                          <input name="ca" type="number" step="0.01" min="0" defaultValue={ch.ca} className="champ" placeholder="CA (€)" />
                                          <input name="cout_sous_traitance" type="number" step="0.01" min="0" defaultValue={ch.cout_sous_traitance ?? ""} className="champ" placeholder="Coût sous-traitance (€)" />
                                        </>
                                      )}
                                      <button className="btn-primaire">Mettre à jour</button>
                                    </form>
                                    <form action={supprimerChantier} className="mt-2">
                                      <input type="hidden" name="id" value={ch.id} />
                                      <button className="btn-danger w-full text-xs">Supprimer</button>
                                    </form>
                                  </details>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Carte>
    </>
  );
}
