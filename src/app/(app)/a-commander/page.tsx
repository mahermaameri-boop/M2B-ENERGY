import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Badge, Vide } from "@/components/ui";
import { SousOnglets } from "@/components/sous-onglets";
import { ongletsUnivers } from "@/lib/navigation";
import { nombre, dateFr } from "@/lib/format";
import { LABEL_STATUT_BESOIN, type StatutBesoin } from "@/lib/types";
import { supprimerBesoin, marquerCommande } from "./actions";

export const dynamic = "force-dynamic";

interface Besoin {
  id: string; chantier_id: string; article_id: string; quantite: number;
  date_besoin: string; statut: StatutBesoin; commande_id: string | null;
  articles: { reference: string; designation: string } | null;
  chantiers: { libelle: string; clients: { nom: string } | null } | null;
}

export default async function ACommanderPage() {
  const profil = await requireProfil();
  const supabase = createClient();

  const [{ data: besoinsData }, { data: stock }, { data: fournisseurs }] =
    await Promise.all([
      supabase.from("besoins_appro")
        .select("id, chantier_id, article_id, quantite, date_besoin, statut, commande_id, articles(reference, designation), chantiers(libelle, clients(nom))")
        .order("date_besoin"),
      supabase.from("vue_stock_actuel").select("article_id, stock"),
      supabase.from("fournisseurs").select("id, nom").order("nom"),
    ]);

  const besoins = (besoinsData as unknown as Besoin[]) ?? [];
  const stockMap = new Map(((stock as any[]) ?? []).map((s) => [s.article_id, Number(s.stock)]));

  // Regroupe les besoins « à commander » par chantier
  const aCommander = besoins.filter((b) => b.statut === "a_commander");
  const parChantier = new Map<string, { libelle: string; client: string; lignes: Besoin[] }>();
  for (const b of aCommander) {
    const cur = parChantier.get(b.chantier_id) ?? {
      libelle: b.chantiers?.libelle ?? "—", client: b.chantiers?.clients?.nom ?? "—", lignes: [],
    };
    cur.lignes.push(b);
    parChantier.set(b.chantier_id, cur);
  }
  const enCours = besoins.filter((b) => b.statut === "commande");

  return (
    <>
      <SousOnglets onglets={ongletsUnivers("achats", profil.role)} />
      <EnTetePage
        titre="À commander"
        description="Passerelle planning → achats : encoder les besoins matériel des chantiers, croiser avec le stock, et générer les commandes des manquants."
      />

      <p className="mb-6 rounded-md border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600">
        Les besoins proviennent du matériel déclaré sur les chantiers.
      </p>

      {/* Côté achats : besoins à commander groupés par chantier */}
      <div className="mb-6 space-y-4">
        {parChantier.size === 0 ? (
          <Carte><Vide message="Aucun besoin à commander." /></Carte>
        ) : (
          [...parChantier.entries()].map(([chantierId, grp]) => {
            const totalManque = grp.lignes.reduce(
              (s, b) => s + Math.max(Number(b.quantite) - (stockMap.get(b.article_id) ?? 0), 0), 0);
            return (
              <Carte key={chantierId} titre={`${grp.libelle} — ${grp.client}`}>
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Article</th><th className="text-right">Besoin</th>
                        <th className="text-right">En stock</th><th className="text-right">À commander</th>
                        <th>Date besoin</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {grp.lignes.map((b) => {
                        const stockDispo = stockMap.get(b.article_id) ?? 0;
                        const enStock = Math.min(Number(b.quantite), stockDispo);
                        const manque = Math.max(Number(b.quantite) - stockDispo, 0);
                        return (
                          <tr key={b.id}>
                            <td className="font-medium">{b.articles?.designation} <span className="font-mono text-xs text-gray-400">{b.articles?.reference}</span></td>
                            <td className="text-right">{nombre(b.quantite)}</td>
                            <td className="text-right text-emerald-600">{nombre(enStock)}</td>
                            <td className="text-right font-semibold">{manque > 0 ? <Badge couleur="orange">{nombre(manque)}</Badge> : <Badge couleur="vert">0</Badge>}</td>
                            <td>{dateFr(b.date_besoin)}</td>
                            <td className="text-right">
                              <form action={supprimerBesoin}>
                                <input type="hidden" name="id" value={b.id} />
                                <button className="text-xs text-red-600 hover:underline">Retirer</button>
                              </form>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <form action={marquerCommande} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="chantier_id" value={chantierId} />
                  <div>
                    <label className="etiquette">Fournisseur</label>
                    <select name="fournisseur_id" required className="champ">
                      <option value="">— Choisir —</option>
                      {((fournisseurs as any[]) ?? []).map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                    </select>
                  </div>
                  <button
                    className="btn inline-flex bg-emerald-600 text-white hover:bg-emerald-700"
                    disabled={totalManque === 0}
                    title={totalManque === 0 ? "Tout est en stock" : ""}
                  >
                    ✓ Marquer comme commandé ({nombre(totalManque)} à commander)
                  </button>
                </form>
              </Carte>
            );
          })
        )}
      </div>

      {/* Besoins déjà passés en commande */}
      {enCours.length > 0 && (
        <Carte titre="Besoins commandés (en attente de réception)">
          <table className="table-base">
            <thead>
              <tr><th>Chantier</th><th>Article</th><th className="text-right">Qté</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {enCours.map((b) => (
                <tr key={b.id}>
                  <td className="text-gray-500">{b.chantiers?.libelle}</td>
                  <td className="font-medium">{b.articles?.designation}</td>
                  <td className="text-right">{nombre(b.quantite)}</td>
                  <td><Badge couleur="bleu">{LABEL_STATUT_BESOIN[b.statut]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Carte>
      )}
    </>
  );
}
