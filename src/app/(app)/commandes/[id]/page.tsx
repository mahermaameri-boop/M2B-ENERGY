import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfil, peutVoirPrix } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Badge, Vide } from "@/components/ui";
import { euro, nombre, dateFr } from "@/lib/format";
import { LABEL_STATUT_COMMANDE, type StatutCommande } from "@/lib/types";
import { changerStatutCommande, supprimerCommande } from "../actions";

export const dynamic = "force-dynamic";

export default async function CommandeDetail({ params }: { params: { id: string } }) {
  const profil = await requireProfil();
  const voitPrix = peutVoirPrix(profil.role);
  const supabase = createClient();

  const { data: commande } = await supabase
    .from("commandes")
    .select("*, fournisseurs(nom)")
    .eq("id", params.id)
    .single();
  if (!commande) notFound();

  const { data: lignes } = await supabase
    .from("commande_lignes")
    .select("*, articles(reference, designation)")
    .eq("commande_id", params.id);

  const total = ((lignes as any[]) ?? []).reduce((s, l) => s + Number(l.quantite) * Number(l.prix_unitaire), 0);

  return (
    <>
      <EnTetePage
        titre={`Commande ${commande.numero}`}
        description={`${(commande as any).fournisseurs?.nom ?? ""} — commandée le ${dateFr(commande.date_commande)}`}
        action={
          <Badge couleur="bleu">{LABEL_STATUT_COMMANDE[commande.statut as StatutCommande]}</Badge>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Carte titre="Informations">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Livraison prévue</dt><dd>{dateFr(commande.date_livraison_prevue)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Statut</dt><dd>{LABEL_STATUT_COMMANDE[commande.statut as StatutCommande]}</dd></div>
            {voitPrix && <div className="flex justify-between"><dt className="text-gray-500">Montant total</dt><dd className="font-semibold">{euro(total)}</dd></div>}
            {commande.notes && <div className="pt-2 text-gray-600">{commande.notes}</div>}
          </dl>
        </Carte>

        <Carte titre="Actions">
          <form action={changerStatutCommande} className="flex items-end gap-2">
            <input type="hidden" name="id" value={commande.id} />
            <div className="flex-1">
              <label className="etiquette">Changer le statut</label>
              <select name="statut" defaultValue={commande.statut} className="champ">
                <option value="brouillon">Brouillon</option>
                <option value="en_transit">En transit</option>
                <option value="livree_partiel">Livrée partiellement</option>
                <option value="livree">Livrée</option>
                <option value="annulee">Annulée</option>
              </select>
            </div>
            <button className="btn-primaire">Appliquer</button>
          </form>
          <div className="mt-3 flex items-center gap-3">
            <Link href="/receptions" className="btn-secondaire">Réceptionner cette commande</Link>
            <form action={supprimerCommande}>
              <input type="hidden" name="id" value={commande.id} />
              <button className="btn-danger">Supprimer</button>
            </form>
          </div>
        </Carte>
      </div>

      <Carte titre="Lignes de commande">
        {((lignes as any[]) ?? []).length === 0 ? (
          <Vide message="Aucune ligne." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Article</th>
                  <th className="text-right">Commandé</th>
                  <th className="text-right">Reçu</th>
                  <th className="text-right">Reste</th>
                  {voitPrix && <th className="text-right">Prix unitaire</th>}
                  {voitPrix && <th className="text-right">Sous-total</th>}
                </tr>
              </thead>
              <tbody>
                {((lignes as any[]) ?? []).map((l) => (
                  <tr key={l.id}>
                    <td className="font-medium">{l.articles?.designation} <span className="font-mono text-xs text-gray-400">{l.articles?.reference}</span></td>
                    <td className="text-right">{nombre(l.quantite)}</td>
                    <td className="text-right">{nombre(l.quantite_recue)}</td>
                    <td className="text-right">{nombre(Math.max(Number(l.quantite) - Number(l.quantite_recue), 0))}</td>
                    {voitPrix && <td className="text-right">{euro(l.prix_unitaire)}</td>}
                    {voitPrix && <td className="text-right">{euro(Number(l.quantite) * Number(l.prix_unitaire))}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
    </>
  );
}
