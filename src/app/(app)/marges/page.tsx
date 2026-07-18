import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, CarteStat, Vide } from "@/components/ui";
import { euro, pourcentage } from "@/lib/format";

export const dynamic = "force-dynamic";

interface LigneMargeChantier {
  chantier_id: string;
  client_id: string;
  libelle: string;
  ca: number;
  cout_sous_traitance: number;
  cout_materiel: number;
  marge: number;
  marge_pct: number | null;
}

interface LigneMargeClient {
  client_id: string;
  nom: string;
  ca: number;
  cout_materiel: number;
  cout_sous_traitance: number;
  marge: number;
  marge_pct: number | null;
}

function Montant({ valeur }: { valeur: number }) {
  return (
    <span className={valeur < 0 ? "text-red-600" : "text-emerald-600"}>
      {euro(valeur)}
    </span>
  );
}

export default async function MargesPage() {
  await requireRole(["admin"]);
  const supabase = createClient();

  const [{ data: chantiersData }, { data: clientsData }, { data: clientsListe }] =
    await Promise.all([
      supabase
        .from("vue_marge_chantier")
        .select(
          "chantier_id, client_id, libelle, ca, cout_sous_traitance, cout_materiel, marge, marge_pct",
        )
        .order("marge", { ascending: false }),
      supabase
        .from("vue_marge_client")
        .select(
          "client_id, nom, ca, cout_materiel, cout_sous_traitance, marge, marge_pct",
        )
        .order("marge", { ascending: false }),
      supabase.from("clients").select("id, nom"),
    ]);

  const margeChantier = (chantiersData as LigneMargeChantier[] | null) ?? [];
  const margeClient = (clientsData as LigneMargeClient[] | null) ?? [];
  const nomsClients = new Map(
    ((clientsListe as { id: string; nom: string }[] | null) ?? []).map((c) => [
      c.id,
      c.nom,
    ]),
  );

  const caTotal = margeClient.reduce((s, c) => s + Number(c.ca), 0);
  const margeTotal = margeClient.reduce((s, c) => s + Number(c.marge), 0);
  const margePct = caTotal > 0 ? (margeTotal / caTotal) * 100 : null;

  return (
    <>
      <EnTetePage
        titre="Marges"
        description="Rentabilité par chantier et par client (accès administrateur)."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CarteStat
          libelle="Marge totale"
          valeur={euro(margeTotal)}
          accent={margeTotal >= 0 ? "vert" : "rouge"}
        />
        <CarteStat
          libelle="Marge moyenne"
          valeur={pourcentage(margePct)}
          accent="neutre"
        />
        <CarteStat
          libelle="Chiffre d'affaires total"
          valeur={euro(caTotal)}
          accent="bleu"
        />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Carte titre="Marge par chantier">
          {margeChantier.length === 0 ? (
            <Vide message="Aucun chantier enregistré." />
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Chantier</th>
                  <th>Client</th>
                  <th className="text-right">CA</th>
                  <th className="text-right">Coût matériel</th>
                  <th className="text-right">Sous-traitance</th>
                  <th className="text-right">Marge</th>
                  <th className="text-right">Marge %</th>
                </tr>
              </thead>
              <tbody>
                {margeChantier.map((c) => (
                  <tr key={c.chantier_id}>
                    <td className="font-medium">{c.libelle}</td>
                    <td>{nomsClients.get(c.client_id) ?? "—"}</td>
                    <td className="text-right">{euro(c.ca)}</td>
                    <td className="text-right">{euro(c.cout_materiel)}</td>
                    <td className="text-right">{euro(c.cout_sous_traitance)}</td>
                    <td className="text-right">
                      <Montant valeur={Number(c.marge)} />
                    </td>
                    <td className="text-right">{pourcentage(c.marge_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Carte>

        <Carte titre="Marge par client">
          {margeClient.length === 0 ? (
            <Vide message="Aucun client enregistré." />
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="text-right">CA</th>
                  <th className="text-right">Coût matériel</th>
                  <th className="text-right">Sous-traitance</th>
                  <th className="text-right">Marge</th>
                  <th className="text-right">Marge %</th>
                </tr>
              </thead>
              <tbody>
                {margeClient.map((c) => (
                  <tr key={c.client_id}>
                    <td className="font-medium">{c.nom}</td>
                    <td className="text-right">{euro(c.ca)}</td>
                    <td className="text-right">{euro(c.cout_materiel)}</td>
                    <td className="text-right">{euro(c.cout_sous_traitance)}</td>
                    <td className="text-right">
                      <Montant valeur={Number(c.marge)} />
                    </td>
                    <td className="text-right">{pourcentage(c.marge_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Carte>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Marge = CA − coût matériel (prix d&apos;achat réels des articles sortis) −
        sous-traitance.
      </p>
    </>
  );
}
