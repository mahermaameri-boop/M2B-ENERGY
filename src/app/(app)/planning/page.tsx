import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Vide } from "@/components/ui";
import { SousOnglets } from "@/components/sous-onglets";
import { ongletsUnivers } from "@/lib/navigation";
import { dateFr } from "@/lib/format";
import { PlanningCalendar, type JourPlanning, type InterventionPlanning } from "./planning-calendar";

export const dynamic = "force-dynamic";

// Format aaaa-mm-jj à partir d'une Date, en heure LOCALE (évite le décalage
// de fuseau que provoquerait toISOString(), qui travaille en UTC).
function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${j}`;
}

const JOURS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

type StatutCalc = { libelle: string; couleur: "gris" | "orange" | "bleu" | "vert" };

export default async function PlanningPage({
  searchParams,
}: {
  searchParams?: { offset?: string };
}) {
  const profil = await requireProfil();
  const supabase = createClient();

  // --- Semaine affichée : lundi de la semaine courante + offset (en semaines) ---
  const offset = Number.parseInt(searchParams?.offset ?? "0", 10) || 0;
  const now = new Date();
  const diffLundi = (now.getDay() + 6) % 7; // 0 = lundi ... 6 = dimanche
  const lundi = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  lundi.setDate(lundi.getDate() - diffLundi + offset * 7);
  const dimanche = new Date(lundi);
  dimanche.setDate(lundi.getDate() + 6);

  const lundiISO = isoLocal(lundi);
  const dimancheISO = isoLocal(dimanche);
  const aujourdhuiISO = isoLocal(now);

  // Les 7 jours de la semaine (ISO local)
  const joursISO: string[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lundi);
    d.setDate(lundi.getDate() + i);
    return isoLocal(d);
  });

  // --- Chantiers de la semaine (borne sur date_prevue) ---
  const { data: chantiersData } = await supabase
    .from("chantiers")
    .select("id, libelle, statut, date_prevue, clients(nom)")
    .gte("date_prevue", lundiISO)
    .lte("date_prevue", dimancheISO)
    .order("date_prevue");

  const chantiers = ((chantiersData as any[]) ?? []).map((c) => ({
    id: c.id as string,
    libelle: c.libelle as string,
    statut: c.statut as string,
    date_prevue: c.date_prevue as string,
    client: c.clients?.nom ?? "—",
  }));

  const chantierIds = chantiers.map((c) => c.id);

  // --- Matériel (réservations + besoins) et statut, en parallèle ---
  const [{ data: resaData }, { data: besoinsData }] =
    chantierIds.length > 0
      ? await Promise.all([
          supabase
            .from("reservations")
            .select("chantier_id, quantite, articles(designation)")
            .in("chantier_id", chantierIds)
            .eq("statut", "reserve"),
          supabase
            .from("besoins_appro")
            .select("chantier_id, quantite, statut, articles(designation)")
            .in("chantier_id", chantierIds),
        ])
      : [{ data: [] }, { data: [] }];

  // Agrégation du matériel par chantier (désignation ×qté)
  const materielMap = new Map<string, string[]>();
  const pousserMateriel = (chantierId: string, designation: string | undefined, qte: number) => {
    if (!designation) return;
    const arr = materielMap.get(chantierId) ?? [];
    arr.push(`${designation} ×${qte}`);
    materielMap.set(chantierId, arr);
  };
  for (const r of (resaData as any[]) ?? []) {
    pousserMateriel(r.chantier_id, r.articles?.designation, Number(r.quantite));
  }
  for (const b of (besoinsData as any[]) ?? []) {
    pousserMateriel(b.chantier_id, b.articles?.designation, Number(b.quantite));
  }

  // Statut d'appro par chantier (d'après besoins_appro)
  const besoinsParChantier = new Map<string, string[]>();
  for (const b of (besoinsData as any[]) ?? []) {
    const arr = besoinsParChantier.get(b.chantier_id) ?? [];
    arr.push(b.statut as string);
    besoinsParChantier.set(b.chantier_id, arr);
  }

  function calculerStatut(chantierStatut: string, chantierId: string): StatutCalc {
    if (chantierStatut === "realise") return { libelle: "Réalisé", couleur: "gris" };
    const statuts = besoinsParChantier.get(chantierId) ?? [];
    if (statuts.includes("a_commander")) return { libelle: "À commander", couleur: "orange" };
    if (statuts.includes("commande")) return { libelle: "Commandé", couleur: "bleu" };
    return { libelle: "Prêt à poser", couleur: "vert" };
  }

  // Aperçu matériel : 2-3 items max + "…"
  function apercuMateriel(chantierId: string): string {
    const items = materielMap.get(chantierId) ?? [];
    if (items.length === 0) return "Aucun matériel encodé";
    const visibles = items.slice(0, 3);
    return visibles.join(", ") + (items.length > 3 ? " …" : "");
  }

  // --- Construction des colonnes-jour pour le calendrier ---
  const jours: JourPlanning[] = joursISO.map((iso, i) => {
    const interventions: InterventionPlanning[] = chantiers
      .filter((c) => c.date_prevue === iso)
      .map((c) => {
        const st = calculerStatut(c.statut, c.id);
        return {
          id: c.id,
          libelle: c.libelle,
          client: c.client,
          datePrevue: c.date_prevue,
          apercu: apercuMateriel(c.id),
          statutLibelle: st.libelle,
          statutCouleur: st.couleur,
        };
      });
    return {
      iso,
      nom: JOURS_FR[i],
      libelleDate: dateFr(iso),
      estAujourdhui: iso === aujourdhuiISO,
      interventions,
    };
  });

  const totalSemaine = jours.reduce((s, j) => s + j.interventions.length, 0);

  return (
    <>
      <SousOnglets onglets={ongletsUnivers("chantiers", profil.role)} />
      <EnTetePage
        titre="Planning"
        description="Agenda hebdomadaire des chantiers. Glissez une intervention d'un jour à l'autre pour la replanifier."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <a href={`/planning?offset=${offset - 1}`} className="btn-secondaire">
            ← Semaine précédente
          </a>
          {offset !== 0 && (
            <a href="/planning?offset=0" className="btn-secondaire">
              Aujourd'hui
            </a>
          )}
          <a href={`/planning?offset=${offset + 1}`} className="btn-secondaire">
            Semaine suivante →
          </a>
        </div>
        <div className="text-sm font-medium text-gray-700">
          {dateFr(lundiISO)} – {dateFr(dimancheISO)}
        </div>
      </div>

      {totalSemaine === 0 ? (
        <div className="carte">
          <Vide message="Aucun chantier planifié cette semaine. Utilisez la navigation ou déplacez un chantier ici." />
        </div>
      ) : null}

      <PlanningCalendar jours={jours} />
    </>
  );
}
