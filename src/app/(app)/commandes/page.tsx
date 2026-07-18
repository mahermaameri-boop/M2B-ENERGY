import Link from "next/link";
import { requireProfil, peutVoirPrix } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Badge, Vide, LienBouton } from "@/components/ui";
import { euro, dateFr } from "@/lib/format";
import { LABEL_STATUT_COMMANDE, type StatutCommande } from "@/lib/types";

export const dynamic = "force-dynamic";

const COULEUR_STATUT: Record<StatutCommande, "gris" | "bleu" | "orange" | "vert" | "rouge"> = {
  brouillon: "gris",
  en_transit: "bleu",
  livree_partiel: "orange",
  livree: "vert",
  annulee: "rouge",
};

export default async function CommandesPage() {
  const profil = await requireProfil();
  const voitPrix = peutVoirPrix(profil.role);
  const supabase = createClient();

  // Masquage financier côté serveur : le prix n'est requêté que pour l'Admin.
  const selectCmd = voitPrix
    ? "id, numero, date_commande, date_livraison_prevue, statut, fournisseurs(nom), commande_lignes(quantite, prix_unitaire)"
    : "id, numero, date_commande, date_livraison_prevue, statut, fournisseurs(nom)";
  const { data: commandes } = await supabase
    .from("commandes")
    .select(selectCmd)
    .order("date_commande", { ascending: false });

  return (
    <>
      <EnTetePage
        titre="Commandes"
        description="Commandes fournisseurs et leur statut."
        action={<LienBouton href="/commandes/nouvelle">+ Nouvelle commande</LienBouton>}
      />
      <Carte>
        {((commandes as any[]) ?? []).length === 0 ? (
          <Vide message="Aucune commande." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Numéro</th>
                  <th>Fournisseur</th>
                  <th>Date</th>
                  <th>Livraison prévue</th>
                  {voitPrix && <th className="text-right">Montant</th>}
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {((commandes as any[]) ?? []).map((c) => {
                  const montant = (c.commande_lignes ?? []).reduce(
                    (s: number, l: any) => s + Number(l.quantite) * Number(l.prix_unitaire), 0);
                  return (
                    <tr key={c.id}>
                      <td className="font-medium">
                        <Link href={`/commandes/${c.id}`} className="text-brand-600 hover:underline">{c.numero}</Link>
                      </td>
                      <td>{c.fournisseurs?.nom ?? "—"}</td>
                      <td>{dateFr(c.date_commande)}</td>
                      <td>{dateFr(c.date_livraison_prevue)}</td>
                      {voitPrix && <td className="text-right">{euro(montant)}</td>}
                      <td><Badge couleur={COULEUR_STATUT[c.statut as StatutCommande]}>{LABEL_STATUT_COMMANDE[c.statut as StatutCommande]}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
    </>
  );
}
