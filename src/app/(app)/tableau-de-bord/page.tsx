import { requireProfil, peutVoirCa, peutVoirMarge } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, CarteStat, Vide, Badge } from "@/components/ui";
import { euro, nombre, pourcentage } from "@/lib/format";
import { dateISO } from "@/lib/format";

export const dynamic = "force-dynamic";

interface LignePrev {
  article_id: string;
  previsionnel: number;
}

export default async function TableauDeBord() {
  const profil = await requireProfil();
  const voitCa = peutVoirCa(profil.role);
  const voitMarge = peutVoirMarge(profil.role);
  const supabase = createClient();

  const [{ data: articles }, { data: prev }] = await Promise.all([
    supabase.from("articles").select("id, reference, designation, seuil_manuel").eq("actif", true),
    supabase.rpc("fn_stock_previsionnel", { d_cible: dateISO() }),
  ]);

  const prevMap = new Map((prev as LignePrev[] | null)?.map((p) => [p.article_id, p.previsionnel]) ?? []);
  const alertes = (articles ?? [])
    .map((a) => ({ ...a, previsionnel: prevMap.get(a.id) ?? 0 }))
    .filter((a) => a.previsionnel <= a.seuil_manuel);
  const ruptures = alertes.filter((a) => a.previsionnel <= 0);

  // Marges (admin) / CA (admin + bureau)
  let margeClient: { client_id: string; nom: string; ca: number; marge: number; marge_pct: number | null }[] = [];
  let caTotal = 0;
  let margeTotal = 0;

  if (voitMarge) {
    const { data } = await supabase
      .from("vue_marge_client")
      .select("client_id, nom, ca, marge, marge_pct")
      .order("marge", { ascending: false });
    margeClient = (data as typeof margeClient) ?? [];
    caTotal = margeClient.reduce((s, c) => s + Number(c.ca), 0);
    margeTotal = margeClient.reduce((s, c) => s + Number(c.marge), 0);
  } else if (voitCa) {
    const { data } = await supabase.from("chantiers").select("client_id, ca, clients(nom)");
    const parClient = new Map<string, { nom: string; ca: number }>();
    for (const ch of (data as any[]) ?? []) {
      const nom = ch.clients?.nom ?? "—";
      const cur = parClient.get(ch.client_id) ?? { nom, ca: 0 };
      cur.ca += Number(ch.ca);
      parClient.set(ch.client_id, cur);
    }
    margeClient = [...parClient.entries()].map(([client_id, v]) => ({
      client_id, nom: v.nom, ca: v.ca, marge: 0, marge_pct: null,
    }));
    caTotal = margeClient.reduce((s, c) => s + c.ca, 0);
  }

  const margePct = caTotal > 0 ? (margeTotal / caTotal) * 100 : null;

  return (
    <>
      <EnTetePage titre="Tableau de bord" description={`Bienvenue, ${profil.nom || "collaborateur"}.`} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {voitCa && <CarteStat libelle="Chiffre d'affaires (chantiers)" valeur={euro(caTotal)} accent="bleu" />}
        {voitMarge && <CarteStat libelle="Marge totale" valeur={euro(margeTotal)} accent={margeTotal >= 0 ? "vert" : "rouge"} />}
        {voitMarge && <CarteStat libelle="Marge moyenne" valeur={pourcentage(margePct)} accent="neutre" />}
        <CarteStat libelle="Alertes stock" valeur={nombre(alertes.length)} accent={alertes.length ? "rouge" : "vert"} />
        {!voitCa && <CarteStat libelle="Ruptures" valeur={nombre(ruptures.length)} accent={ruptures.length ? "rouge" : "vert"} />}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {voitCa && (
          <Carte titre={voitMarge ? "Marge par client" : "Chiffre d'affaires par client"}>
            {margeClient.length === 0 ? (
              <Vide message="Aucun chantier enregistré." />
            ) : (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th className="text-right">CA</th>
                    {voitMarge && <th className="text-right">Marge</th>}
                    {voitMarge && <th className="text-right">Marge %</th>}
                  </tr>
                </thead>
                <tbody>
                  {margeClient.map((c) => (
                    <tr key={c.client_id}>
                      <td className="font-medium">{c.nom}</td>
                      <td className="text-right">{euro(c.ca)}</td>
                      {voitMarge && <td className="text-right">{euro(c.marge)}</td>}
                      {voitMarge && <td className="text-right">{pourcentage(c.marge_pct)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Carte>
        )}

        <Carte titre="Articles à réapprovisionner">
          {alertes.length === 0 ? (
            <Vide message="Aucune alerte. Le stock prévisionnel est suffisant." />
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Désignation</th>
                  <th className="text-right">Prévisionnel</th>
                  <th className="text-right">Seuil</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {alertes.map((a) => (
                  <tr key={a.id}>
                    <td className="font-mono text-xs">{a.reference}</td>
                    <td className="font-medium">{a.designation}</td>
                    <td className="text-right">{nombre(a.previsionnel)}</td>
                    <td className="text-right text-gray-500">{nombre(a.seuil_manuel)}</td>
                    <td>
                      <Badge couleur={a.previsionnel <= 0 ? "rouge" : "orange"}>
                        {a.previsionnel <= 0 ? "Rupture" : "Bas"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Carte>
      </div>
    </>
  );
}
