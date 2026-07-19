import { requireProfil, peutVoirPrix } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Badge, Vide } from "@/components/ui";
import { SelecteurDate } from "@/components/selecteur-date";
import { euro, nombre, dateFr, dateISO } from "@/lib/format";
import { ExportStock } from "./export-stock";

export const dynamic = "force-dynamic";

interface LignePrev {
  article_id: string;
  stock_actuel: number;
  entrees_attendues: number;
  sorties_reservees: number;
  previsionnel: number;
}

function etat(previsionnel: number, seuil: number): { libelle: string; couleur: "vert" | "orange" | "rouge" } {
  if (previsionnel <= 0) return { libelle: "Rupture", couleur: "rouge" };
  if (previsionnel <= seuil) return { libelle: "Bas", couleur: "orange" };
  return { libelle: "OK", couleur: "vert" };
}

export default async function StockPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const profil = await requireProfil();
  const voitPrix = peutVoirPrix(profil.role);
  const dateCible = searchParams.date || dateISO();
  const supabase = createClient();

  const [{ data: articles }, { data: prev }, { data: prix }] = await Promise.all([
    supabase.from("articles").select("*").eq("actif", true).eq("compose", false).order("categorie").order("designation"),
    supabase.rpc("fn_stock_previsionnel", { d_cible: dateCible }),
    voitPrix
      ? supabase.from("vue_dernier_prix").select("article_id, dernier_prix")
      : Promise.resolve({ data: [] as { article_id: string; dernier_prix: number }[] }),
  ]);

  const prevMap = new Map((prev as LignePrev[] | null)?.map((p) => [p.article_id, p]) ?? []);
  const prixMap = new Map((prix as { article_id: string; dernier_prix: number }[] | null)?.map((p) => [p.article_id, p.dernier_prix]) ?? []);

  let valeurTotale = 0;
  const lignes = (articles ?? []).map((a) => {
    const p = prevMap.get(a.id);
    const stock = p?.stock_actuel ?? 0;
    const prixU = prixMap.get(a.id) ?? null;
    const valeur = voitPrix && prixU != null ? stock * prixU : null;
    if (valeur != null) valeurTotale += valeur;
    return { a, p, stock, prixU, valeur };
  });

  return (
    <>
      <EnTetePage
        titre="Stock"
        description="Stock actuel, valorisation et prévisionnel. Les alertes se calculent sur le prévisionnel."
        action={
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Prévisionnel au</span>
            <SelecteurDate valeur={dateCible} />
          </div>
        }
      />

      {voitPrix && (
        <div className="mb-4">
          <Carte>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Valeur totale du stock (au dernier prix d'achat)</span>
              <span className="text-xl font-semibold text-gray-900">{euro(valeurTotale)}</span>
            </div>
          </Carte>
        </div>
      )}

      {voitPrix && (
        <div className="mb-4">
          <Carte titre="Export (valeur du stock)">
            <p className="mb-3 text-sm text-gray-500">
              Exporter l&apos;inventaire valorisé à une date donnée (stock, dernier prix
              d&apos;achat, valeur).
            </p>
            <ExportStock />
          </Carte>
        </div>
      )}

      <Carte>
        {lignes.length === 0 ? (
          <Vide message="Aucun article actif." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Désignation</th>
                  <th>Catégorie</th>
                  <th className="text-right">Stock actuel</th>
                  <th className="text-right">Entrées prévues</th>
                  <th className="text-right">Réservé</th>
                  <th className="text-right">Prévisionnel</th>
                  <th className="text-right">Seuil</th>
                  <th>État</th>
                  {voitPrix && <th className="text-right">Dernier prix</th>}
                  {voitPrix && <th className="text-right">Valeur</th>}
                </tr>
              </thead>
              <tbody>
                {lignes.map(({ a, p, stock, prixU, valeur }) => {
                  const previsionnel = p?.previsionnel ?? stock;
                  const e = etat(previsionnel, a.seuil_manuel);
                  return (
                    <tr key={a.id}>
                      <td className="font-mono text-xs">{a.reference}</td>
                      <td className="font-medium text-gray-800">{a.designation}</td>
                      <td className="capitalize text-gray-500">{a.categorie}</td>
                      <td className="text-right">{nombre(stock)}</td>
                      <td className="text-right text-gray-500">{nombre(p?.entrees_attendues ?? 0)}</td>
                      <td className="text-right text-gray-500">{nombre(p?.sorties_reservees ?? 0)}</td>
                      <td className="text-right font-semibold">{nombre(previsionnel)}</td>
                      <td className="text-right text-gray-500">{nombre(a.seuil_manuel)}</td>
                      <td><Badge couleur={e.couleur}>{e.libelle}</Badge></td>
                      {voitPrix && <td className="text-right text-gray-500">{euro(prixU ?? undefined)}</td>}
                      {voitPrix && <td className="text-right">{euro(valeur ?? undefined)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Carte>

      <p className="mt-3 text-xs text-gray-400">
        Prévisionnel au {dateFr(dateCible)} = stock actuel + entrées attendues (commandes non annulées
        livrables à cette date) − sorties réservées.
      </p>
    </>
  );
}
