import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, CarteStat, Vide, Badge } from "@/components/ui";
import { euro, nombre, pourcentage, dateISO, dateFr } from "@/lib/format";
import { RelanceSousTraitance, type ChantierACompleter } from "./relance";

export const dynamic = "force-dynamic";

interface LignePrev {
  article_id: string;
  previsionnel: number;
}

interface MargeClient {
  client_id: string;
  nom: string;
  ca: number;
  marge: number;
  marge_pct: number | null;
}

export default async function TableauDeBord() {
  const profil = await requireProfil();
  const estAdmin = profil.role === "admin";
  const supabase = createClient();
  const aujourdhui = dateISO();

  // Données opérationnelles (visibles par tous)
  const [
    { data: articles },
    { data: prev },
    { count: chantiersPlanifies },
    { count: commandesAReceptionner },
  ] = await Promise.all([
    supabase
      .from("articles")
      .select("id, reference, designation, seuil_manuel")
      .eq("actif", true)
      .eq("compose", false),
    supabase.rpc("fn_stock_previsionnel", { d_cible: aujourdhui }),
    supabase
      .from("chantiers")
      .select("id", { count: "exact", head: true })
      .or(`statut.eq.en_cours,date_prevue.gte.${aujourdhui}`),
    supabase
      .from("commandes")
      .select("id", { count: "exact", head: true })
      .in("statut", ["brouillon", "en_transit", "livree_partiel"]),
  ]);

  const prevMap = new Map(
    (prev as LignePrev[] | null)?.map((p) => [p.article_id, p.previsionnel]) ?? [],
  );
  const alertes = (articles ?? [])
    .map((a) => ({ ...a, previsionnel: prevMap.get(a.id) ?? 0 }))
    .filter((a) => a.previsionnel <= a.seuil_manuel)
    .sort((a, b) => a.previsionnel - b.previsionnel);
  const ruptures = alertes.filter((a) => a.previsionnel <= 0);

  // Données financières (Admin uniquement)
  let margeClient: MargeClient[] = [];
  let caTotal = 0;
  let margeTotal = 0;

  let aCompleter: ChantierACompleter[] = [];

  if (estAdmin) {
    const [{ data }, { data: chantiersData }] = await Promise.all([
      supabase.from("vue_marge_client")
        .select("client_id, nom, ca, marge, marge_pct")
        .order("marge", { ascending: false }),
      // Chantiers passés (date < aujourd'hui) dont le coût sous-traitance n'est pas saisi
      supabase.from("chantiers")
        .select("id, libelle, date_prevue, clients(nom)")
        .is("cout_sous_traitance", null)
        .lt("date_prevue", aujourdhui)
        .order("date_prevue"),
    ]);
    margeClient = (data as MargeClient[]) ?? [];
    caTotal = margeClient.reduce((s, c) => s + Number(c.ca), 0);
    margeTotal = margeClient.reduce((s, c) => s + Number(c.marge), 0);
    aCompleter = ((chantiersData as any[]) ?? []).map((c) => ({
      id: c.id, libelle: c.libelle, client: c.clients?.nom ?? "—", date_prevue: c.date_prevue,
    }));
  }

  const margePct = caTotal > 0 ? (margeTotal / caTotal) * 100 : null;

  return (
    <>
      <EnTetePage
        titre="Tableau de bord"
        description={`Bienvenue, ${profil.nom || "collaborateur"}.`}
      />

      {estAdmin && <RelanceSousTraitance chantiers={aCompleter} />}

      {estAdmin && aCompleter.length > 0 && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 text-sm font-semibold text-amber-800">
            À compléter — coût de sous-traitance ({aCompleter.length})
          </div>
          <ul className="space-y-1 text-sm text-amber-900">
            {aCompleter.map((c) => (
              <li key={c.id} className="flex justify-between">
                <span>{c.libelle} — {c.client}</span>
                <span className="text-amber-600">{dateFr(c.date_prevue)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-700">
            Renseignez le coût du sous-traitant (fenêtre ci-dessus ou module Clients &amp; chantiers) pour compléter la marge.
          </p>
        </div>
      )}

      {/* Cartes opérationnelles — visibles par tous */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CarteStat
          libelle="Chantiers planifiés"
          valeur={nombre(chantiersPlanifies ?? 0)}
          accent="bleu"
        />
        <CarteStat
          libelle="Commandes à réceptionner"
          valeur={nombre(commandesAReceptionner ?? 0)}
          accent="neutre"
        />
        <CarteStat
          libelle="Alertes stock"
          valeur={nombre(alertes.length)}
          accent={alertes.length ? "rouge" : "vert"}
        />
        <CarteStat
          libelle="Ruptures"
          valeur={nombre(ruptures.length)}
          accent={ruptures.length ? "rouge" : "vert"}
        />
      </div>

      {/* Cartes financières — Admin uniquement */}
      {estAdmin && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CarteStat libelle="Chiffre d'affaires" valeur={euro(caTotal)} accent="bleu" />
          <CarteStat
            libelle="Marge totale"
            valeur={euro(margeTotal)}
            accent={margeTotal >= 0 ? "vert" : "rouge"}
          />
          <CarteStat
            libelle="Marge moyenne %"
            valeur={pourcentage(margePct)}
            accent="neutre"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Marge par client — Admin uniquement */}
        {estAdmin && (
          <Carte titre="Marge par client">
            {margeClient.length === 0 ? (
              <Vide message="Aucun chantier enregistré." />
            ) : (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th className="text-right">CA</th>
                    <th className="text-right">Marge</th>
                    <th className="text-right">Marge %</th>
                  </tr>
                </thead>
                <tbody>
                  {margeClient.map((c) => (
                    <tr key={c.client_id}>
                      <td className="font-medium">{c.nom}</td>
                      <td className="text-right">{euro(Number(c.ca))}</td>
                      <td className="text-right">{euro(Number(c.marge))}</td>
                      <td className="text-right">{pourcentage(c.marge_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Carte>
        )}

        {/* Articles à réapprovisionner — visibles par tous */}
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
