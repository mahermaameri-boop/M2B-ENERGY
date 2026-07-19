import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, CarteStat, CarteAction, Badge, Vide } from "@/components/ui";
import { euro, pourcentage, dateISO, dateFr } from "@/lib/format";
import { etapeChantier, LABEL_ETAPE, COULEUR_ETAPE } from "@/lib/chantier-statut";
import { RelanceSousTraitance, type ChantierACompleter } from "./relance";

export const dynamic = "force-dynamic";

interface LignePrev {
  article_id: string;
  previsionnel: number;
}

interface ChantierPose {
  id: string;
  libelle: string;
  statut: string;
  prepare_le: string | null;
  cout_sous_traitance: number | null;
  date_prevue: string | null;
  clients: { nom: string } | null;
}

// aaaa-mm-jj à partir d'une date locale (évite les décalages UTC de toISOString).
function isoLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default async function TableauDeBord() {
  const profil = await requireProfil();
  const admin = profil.role === "admin";
  const supabase = createClient();
  const aujourdhui = dateISO();

  // Bornes du mois courant et de la semaine courante (lundi -> dimanche).
  const now = new Date();
  const debutMois = isoLocal(new Date(now.getFullYear(), now.getMonth(), 1));
  const finMois = isoLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const decalLundi = (now.getDay() + 6) % 7; // 0 = lundi
  const lundi = isoLocal(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - decalLundi),
  );
  const dimanche = isoLocal(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - decalLundi + 6),
  );

  // --- Données opérationnelles (visibles par tous) + financières (admin) ---
  const [
    { data: articles },
    { data: prev },
    { data: besoinsACommander },
    { data: chantiersAPreparer },
    { count: receptionsAttendues },
    { data: posesData },
    adminRes,
  ] = await Promise.all([
    supabase
      .from("articles")
      .select("id, reference, designation, seuil_manuel")
      .eq("actif", true)
      .eq("compose", false),
    supabase.rpc("fn_stock_previsionnel", { d_cible: aujourdhui }),
    supabase
      .from("besoins_appro")
      .select("chantier_id")
      .eq("statut", "a_commander"),
    supabase
      .from("chantiers")
      .select("id")
      .eq("statut", "planifie")
      .is("prepare_le", null),
    supabase
      .from("commandes")
      .select("id", { count: "exact", head: true })
      .in("statut", ["en_transit", "livree_partiel"]),
    supabase
      .from("chantiers")
      .select("id, libelle, statut, prepare_le, cout_sous_traitance, date_prevue, clients(nom)")
      .gte("date_prevue", lundi)
      .lte("date_prevue", dimanche)
      .order("date_prevue"),
    admin
      ? Promise.all([
          supabase.from("vue_marge_chantier").select("chantier_id, ca, marge"),
          supabase
            .from("chantiers")
            .select("id")
            .eq("statut", "realise")
            .gte("date_prevue", debutMois)
            .lte("date_prevue", finMois),
          supabase.from("vue_stock_actuel").select("article_id, stock"),
          supabase.from("vue_dernier_prix").select("article_id, dernier_prix"),
          supabase
            .from("chantiers")
            .select("id, libelle, date_prevue, clients(nom)")
            .eq("statut", "realise")
            .is("cout_sous_traitance", null)
            .order("date_prevue"),
        ])
      : Promise.resolve(null),
  ]);

  // --- Compteurs « À traiter » ---
  const chantiersAvecACommander = new Set(
    ((besoinsACommander as { chantier_id: string }[] | null) ?? []).map((b) => b.chantier_id),
  );
  const nbACommander = chantiersAvecACommander.size;
  // À préparer : planifié, non préparé, dont tout le matériel est disponible.
  const nbAPreparer = ((chantiersAPreparer as { id: string }[] | null) ?? []).filter(
    (c) => !chantiersAvecACommander.has(c.id),
  ).length;

  // --- Poses de la semaine + étape (besoins des chantiers concernés) ---
  const poses = (posesData as unknown as ChantierPose[] | null) ?? [];
  const posesIds = poses.map((p) => p.id);
  let besoinsSemaine: { chantier_id: string; statut: string }[] = [];
  if (posesIds.length > 0) {
    const { data } = await supabase
      .from("besoins_appro")
      .select("chantier_id, statut")
      .in("chantier_id", posesIds);
    besoinsSemaine = (data as { chantier_id: string; statut: string }[] | null) ?? [];
  }
  const statutsParChantier = new Map<string, string[]>();
  for (const b of besoinsSemaine) {
    const arr = statutsParChantier.get(b.chantier_id) ?? [];
    arr.push(b.statut);
    statutsParChantier.set(b.chantier_id, arr);
  }

  // --- Alertes stock (visibles par tous) ---
  const prevMap = new Map(
    (prev as LignePrev[] | null)?.map((p) => [p.article_id, p.previsionnel]) ?? [],
  );
  const alertes = (articles ?? [])
    .map((a) => ({ ...a, previsionnel: prevMap.get(a.id) ?? 0 }))
    .filter((a) => a.previsionnel <= a.seuil_manuel)
    .sort((a, b) => a.previsionnel - b.previsionnel);

  // --- KPIs financiers (admin uniquement) ---
  let caMois = 0;
  let margeMois = 0;
  let valeurStock = 0;
  let aCompleter: ChantierACompleter[] = [];

  if (adminRes) {
    const [
      { data: margeChantier },
      { data: chantiersMois },
      { data: stock },
      { data: prix },
      { data: relanceData },
    ] = adminRes;

    const idsMois = new Set(
      ((chantiersMois as { id: string }[] | null) ?? []).map((c) => c.id),
    );
    for (const m of (margeChantier as { chantier_id: string; ca: number; marge: number }[] | null) ??
      []) {
      if (idsMois.has(m.chantier_id)) {
        caMois += Number(m.ca) || 0;
        margeMois += Number(m.marge) || 0;
      }
    }

    const stockMap = new Map(
      ((stock as { article_id: string; stock: number }[] | null) ?? []).map((s) => [
        s.article_id,
        Number(s.stock) || 0,
      ]),
    );
    const prixMap = new Map(
      ((prix as { article_id: string; dernier_prix: number }[] | null) ?? []).map((p) => [
        p.article_id,
        Number(p.dernier_prix) || 0,
      ]),
    );
    valeurStock = (articles ?? []).reduce(
      (s, a) => s + (stockMap.get(a.id) ?? 0) * (prixMap.get(a.id) ?? 0),
      0,
    );

    aCompleter = ((relanceData as unknown as ChantierPose[] | null) ?? []).map((c) => ({
      id: c.id,
      libelle: c.libelle,
      client: c.clients?.nom ?? "—",
      date_prevue: c.date_prevue,
    }));
  }

  const margePctMois = caMois > 0 ? (margeMois / caMois) * 100 : null;
  const nbRelance = aCompleter.length;

  return (
    <>
      <EnTetePage
        titre="Tableau de bord"
        description={profil.nom ? `Bonjour ${profil.nom}.` : "Bonjour."}
      />

      {admin && <RelanceSousTraitance chantiers={aCompleter} />}

      {/* KPIs financiers — Admin uniquement */}
      {admin && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CarteStat libelle="CA du mois" valeur={euro(caMois)} accent="bleu" />
          <CarteStat
            libelle="Marge du mois"
            valeur={euro(margeMois)}
            accent={margeMois >= 0 ? "vert" : "rouge"}
          />
          <CarteStat libelle="Marge %" valeur={pourcentage(margePctMois)} accent="neutre" />
          <CarteStat libelle="Valeur du stock" valeur={euro(valeurStock)} accent="neutre" />
        </div>
      )}

      {/* À traiter — compteurs cliquables */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CarteAction libelle="À commander" compteur={nbACommander} href="/a-commander" couleur="orange" />
        <CarteAction libelle="À préparer" compteur={nbAPreparer} href="/a-preparer" couleur="bleu" />
        <CarteAction
          libelle="Réceptions attendues"
          compteur={receptionsAttendues ?? 0}
          href="/receptions"
          couleur="bleu"
        />
        {admin && (
          <CarteAction
            libelle="Relance sous-traitant"
            compteur={nbRelance}
            href="/chantiers"
            couleur="rouge"
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Poses de la semaine */}
        <Carte titre="Poses de la semaine">
          {poses.length === 0 ? (
            <Vide message="Aucune pose planifiée cette semaine." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {poses.map((c) => {
                const etape = etapeChantier(
                  {
                    statut: c.statut,
                    prepare_le: c.prepare_le,
                    cout_sous_traitance: c.cout_sous_traitance,
                  },
                  statutsParChantier.get(c.id) ?? [],
                );
                return (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-800">{c.libelle}</div>
                      <div className="truncate text-xs text-gray-400">{c.clients?.nom ?? "—"}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-gray-500">{dateFr(c.date_prevue)}</span>
                      <Badge couleur={COULEUR_ETAPE[etape]}>{LABEL_ETAPE[etape]}</Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Carte>

        {/* Alertes stock */}
        <Carte titre="Alertes stock">
          {alertes.length === 0 ? (
            <Vide message="Aucune alerte. Le stock prévisionnel est suffisant." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {alertes.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-800">{a.designation}</div>
                    <div className="truncate font-mono text-xs text-gray-400">{a.reference}</div>
                  </div>
                  <Badge couleur={a.previsionnel <= 0 ? "rouge" : "orange"}>
                    {a.previsionnel <= 0 ? "Rupture" : "Bas"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Carte>
      </div>
    </>
  );
}
