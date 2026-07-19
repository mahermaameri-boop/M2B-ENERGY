import type { createClient } from "@/lib/supabase/server";

type SB = ReturnType<typeof createClient>;

const today = () => new Date().toISOString().slice(0, 10);

// Décompose un article (produit composé -> composants via nomenclature/variante,
// sinon l'article lui-même) en lignes {article_id, quantite}.
export async function decomposer(
  supabase: SB, articleId: string, quantite: number, compositionId?: string | null,
): Promise<{ article_id: string; quantite: number }[]> {
  const { data: article } = await supabase
    .from("articles").select("id, compose").eq("id", articleId).single();

  if (!article?.compose) return [{ article_id: articleId, quantite }];

  // Variante choisie, sinon 1re composition (Standard) du produit
  let compoId = compositionId ?? null;
  if (!compoId) {
    const { data: compo } = await supabase
      .from("compositions").select("id, nom_variante")
      .eq("article_fini_id", articleId)
      .order("nom_variante").limit(1).maybeSingle();
    compoId = compo?.id ?? null;
  }
  if (!compoId) return [{ article_id: articleId, quantite }];

  const { data: lignes } = await supabase
    .from("composition_lignes")
    .select("article_composant_id, quantite")
    .eq("composition_id", compoId);
  const arr = (lignes as any[]) ?? [];
  if (arr.length === 0) return [{ article_id: articleId, quantite }];
  return arr.map((l) => ({ article_id: l.article_composant_id, quantite: Number(l.quantite) * quantite }));
}

// À partir de composants requis : réserve ce qui est en stock pour le chantier,
// et crée un besoin « à commander » pour les manquants.
export async function genererAppro(
  supabase: SB,
  chantierId: string,
  composants: { article_id: string; quantite: number }[],
  opts?: { cree_par?: string | null; composition_id?: string | null; date?: string },
) {
  if (composants.length === 0) return;

  // Date de référence = date du chantier si connue
  const { data: chantier } = await supabase
    .from("chantiers").select("date_prevue").eq("id", chantierId).maybeSingle();
  const date = opts?.date ?? chantier?.date_prevue ?? today();

  const artIds = [...new Set(composants.map((c) => c.article_id))];
  const [{ data: stock }, { data: resa }] = await Promise.all([
    supabase.from("vue_stock_actuel").select("article_id, stock").in("article_id", artIds),
    supabase.from("reservations").select("article_id, quantite").eq("statut", "reserve").in("article_id", artIds),
  ]);
  const stockMap = new Map(((stock as any[]) ?? []).map((s) => [s.article_id, Number(s.stock)]));
  const resaMap = new Map<string, number>();
  for (const r of (resa as any[]) ?? []) {
    resaMap.set(r.article_id, (resaMap.get(r.article_id) ?? 0) + Number(r.quantite));
  }

  const reservations: any[] = [];
  const besoins: any[] = [];
  for (const c of composants) {
    const dispo = Math.max((stockMap.get(c.article_id) ?? 0) - (resaMap.get(c.article_id) ?? 0), 0);
    const aReserver = Math.min(c.quantite, dispo);
    const manque = c.quantite - aReserver;
    // met à jour la carte des réservations pour les composants suivants du même lot
    resaMap.set(c.article_id, (resaMap.get(c.article_id) ?? 0) + aReserver);
    if (aReserver > 0) {
      reservations.push({
        chantier_id: chantierId, article_id: c.article_id, quantite: aReserver,
        date_prevue: date, statut: "reserve", composition_id: opts?.composition_id ?? null,
      });
    }
    if (manque > 0) {
      besoins.push({
        chantier_id: chantierId, article_id: c.article_id, quantite: manque,
        date_besoin: date, statut: "a_commander", cree_par: opts?.cree_par ?? null,
      });
    }
  }
  if (reservations.length > 0) await supabase.from("reservations").insert(reservations);
  if (besoins.length > 0) await supabase.from("besoins_appro").insert(besoins);
}
