import Link from "next/link";
import { requireProfil, peutVoirPrix } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Badge, Vide } from "@/components/ui";
import { SousOnglets } from "@/components/sous-onglets";
import { ongletsUnivers } from "@/lib/navigation";
import { dateFr, dateISO } from "@/lib/format";
import { LABEL_STATUT_COMMANDE, type StatutCommande } from "@/lib/types";
import { EntreeManuelleForm } from "./entree-manuelle-form";

export const dynamic = "force-dynamic";

export default async function ReceptionsPage() {
  const profil = await requireProfil();
  const voitPrix = peutVoirPrix(profil.role);
  const supabase = createClient();

  const [{ data: commandes }, { data: passees }, { data: articles }, { data: fournisseurs }] = await Promise.all([
    supabase.from("commandes")
      .select("id, numero, date_livraison_prevue, statut, fournisseurs(nom)")
      .in("statut", ["en_transit", "livree_partiel"])
      .order("date_livraison_prevue"),
    supabase.from("commandes")
      .select("id, numero, statut, fournisseurs(nom)")
      .in("statut", ["livree_partiel", "livree"])
      .order("date_commande", { ascending: false }).limit(50),
    supabase.from("articles").select("id, reference, designation, serialise").eq("actif", true).eq("compose", false).order("designation"),
    supabase.from("fournisseurs").select("id, nom").order("nom"),
  ]);

  // Facture + date de réception pour les commandes passées (dernier mouvement reçu)
  const idsPassees = ((passees as any[]) ?? []).map((c) => c.id);
  const infoReception = new Map<string, { date: string; facture: string | null }>();
  if (idsPassees.length > 0) {
    const { data: mouv } = await supabase
      .from("mouvements_stock")
      .select("reference, date, factures_achat(numero)")
      .eq("type", "reception")
      .in("reference", idsPassees)
      .order("date", { ascending: false });
    for (const m of (mouv as any[]) ?? []) {
      if (!infoReception.has(m.reference)) {
        infoReception.set(m.reference, { date: m.date, facture: m.factures_achat?.numero ?? null });
      }
    }
  }

  return (
    <>
      <SousOnglets onglets={ongletsUnivers("achats", profil.role)} />
      <EnTetePage
        titre="Réceptions"
        description="Réceptionner une commande (totale ou partielle) ou enregistrer une entrée de stock manuelle."
      />

      <div className="mb-6">
        <Carte titre="Commandes à réceptionner">
          {((commandes as any[]) ?? []).length === 0 ? (
            <Vide message="Aucune commande en attente de réception." />
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Numéro</th><th>Fournisseur</th><th>Livraison prévue</th><th>Statut</th><th></th>
                </tr>
              </thead>
              <tbody>
                {((commandes as any[]) ?? []).map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.numero}</td>
                    <td>{c.fournisseurs?.nom ?? "—"}</td>
                    <td>{dateFr(c.date_livraison_prevue)}</td>
                    <td><Badge couleur="bleu">{LABEL_STATUT_COMMANDE[c.statut as StatutCommande]}</Badge></td>
                    <td className="text-right">
                      <Link href={`/receptions/${c.id}`} className="btn-primaire text-xs">Réceptionner</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Carte>
      </div>

      <div className="mb-6">
        <Carte titre="Commandes réceptionnées / passées">
          {((passees as any[]) ?? []).length === 0 ? (
            <Vide message="Aucune commande réceptionnée." />
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Numéro</th><th>Fournisseur</th><th>Date de réception</th><th>N° facture</th><th>Statut</th><th></th>
                </tr>
              </thead>
              <tbody>
                {((passees as any[]) ?? []).map((c) => {
                  const info = infoReception.get(c.id);
                  return (
                    <tr key={c.id}>
                      <td className="font-medium">{c.numero}</td>
                      <td>{c.fournisseurs?.nom ?? "—"}</td>
                      <td>{dateFr(info?.date)}</td>
                      <td className="font-mono text-xs text-gray-500">{info?.facture ?? "—"}</td>
                      <td><Badge couleur={c.statut === "livree" ? "vert" : "orange"}>{LABEL_STATUT_COMMANDE[c.statut as StatutCommande]}</Badge></td>
                      <td className="text-right">
                        {c.statut === "livree_partiel" && (
                          <Link href={`/receptions/${c.id}`} className="text-xs text-brand-600 hover:underline">Compléter</Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Carte>
      </div>

      <Carte titre="Entrée de stock manuelle (réappro hors commande / ajustement)">
        <EntreeManuelleForm
          articles={(articles as any) ?? []}
          fournisseurs={(fournisseurs as any) ?? []}
          voitPrix={voitPrix}
          dateJour={dateISO()}
        />
      </Carte>
    </>
  );
}
