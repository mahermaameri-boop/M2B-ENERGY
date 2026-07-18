"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const today = () => new Date().toISOString().slice(0, 10);

async function userId(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// Encodage d'un besoin (planning). Si l'article est composé, on décompose la
// nomenclature en composants ; sinon un seul besoin est créé.
export async function creerBesoin(formData: FormData) {
  const supabase = createClient();
  const uid = await userId(supabase);
  const chantier_id = String(formData.get("chantier_id"));
  const article_id = String(formData.get("article_id"));
  const quantite = Number(formData.get("quantite") || 1);
  const date_besoin = String(formData.get("date_besoin") || today());
  const notes = String(formData.get("notes") || "").trim() || null;
  if (!chantier_id || !article_id || quantite <= 0) throw new Error("Champs manquants.");

  const { data: article } = await supabase
    .from("articles").select("id, compose").eq("id", article_id).single();

  let lignes: { article_id: string; quantite: number }[] = [];
  if (article?.compose) {
    const { data: compo } = await supabase
      .from("compositions").select("id").eq("article_fini_id", article_id).maybeSingle();
    if (compo) {
      const { data: cl } = await supabase
        .from("composition_lignes")
        .select("article_composant_id, quantite")
        .eq("composition_id", compo.id);
      lignes = ((cl as any[]) ?? []).map((l) => ({
        article_id: l.article_composant_id, quantite: Number(l.quantite) * quantite,
      }));
    }
  }
  if (lignes.length === 0) lignes = [{ article_id, quantite }];

  // Disponible = stock actuel − réservations déjà en cours (par article)
  const artIds = lignes.map((l) => l.article_id);
  const [{ data: stock }, { data: resa }] = await Promise.all([
    supabase.from("vue_stock_actuel").select("article_id, stock").in("article_id", artIds),
    supabase.from("reservations").select("article_id, quantite").eq("statut", "reserve").in("article_id", artIds),
  ]);
  const stockMap = new Map(((stock as any[]) ?? []).map((s) => [s.article_id, Number(s.stock)]));
  const resaMap = new Map<string, number>();
  for (const r of (resa as any[]) ?? []) {
    resaMap.set(r.article_id, (resaMap.get(r.article_id) ?? 0) + Number(r.quantite));
  }

  const besoins: any[] = [];
  const reservations: any[] = [];
  for (const l of lignes) {
    const dispo = Math.max((stockMap.get(l.article_id) ?? 0) - (resaMap.get(l.article_id) ?? 0), 0);
    const aReserver = Math.min(l.quantite, dispo);        // composant en stock → réservé
    const manque = l.quantite - aReserver;                // composant manquant → à commander
    if (aReserver > 0) {
      reservations.push({ chantier_id, article_id: l.article_id, quantite: aReserver, date_prevue: date_besoin, statut: "reserve" });
    }
    if (manque > 0) {
      besoins.push({ chantier_id, article_id: l.article_id, quantite: manque, date_besoin, statut: "a_commander", cree_par: uid, notes });
    }
  }

  if (reservations.length > 0) await supabase.from("reservations").insert(reservations);
  if (besoins.length > 0) await supabase.from("besoins_appro").insert(besoins);

  revalidatePath("/a-commander");
  revalidatePath("/sorties");
  revalidatePath("/stock");
}

export async function supprimerBesoin(formData: FormData) {
  const supabase = createClient();
  await supabase.from("besoins_appro").delete().eq("id", String(formData.get("id")));
  revalidatePath("/a-commander");
}

// Marque les besoins « à commander » d'un chantier comme commandés :
// crée une commande fournisseur pré-remplie des quantités manquantes (stock déduit).
export async function marquerCommande(formData: FormData) {
  const supabase = createClient();
  const chantier_id = String(formData.get("chantier_id"));
  const fournisseur_id = String(formData.get("fournisseur_id"));
  if (!fournisseur_id) throw new Error("Choisissez un fournisseur.");

  const { data: besoins } = await supabase
    .from("besoins_appro")
    .select("id, article_id, quantite")
    .eq("chantier_id", chantier_id)
    .eq("statut", "a_commander");
  const liste = (besoins as { id: string; article_id: string; quantite: number }[]) ?? [];
  if (liste.length === 0) throw new Error("Aucun besoin à commander pour ce chantier.");

  // Manquants = besoin − stock actuel
  const { data: stock } = await supabase.from("vue_stock_actuel").select("article_id, stock");
  const stockMap = new Map(((stock as any[]) ?? []).map((s) => [s.article_id, Number(s.stock)]));

  const lignes = liste
    .map((b) => ({ b, manque: Math.max(Number(b.quantite) - (stockMap.get(b.article_id) ?? 0), 0) }))
    .filter((x) => x.manque > 0);

  if (lignes.length === 0) {
    throw new Error("Tout est disponible en stock : rien à commander (réservez via Sorties).");
  }

  // Numéro de commande
  const annee = new Date().getFullYear();
  const { count } = await supabase.from("commandes").select("id", { count: "exact", head: true });
  const numero = `CMD-${annee}-${String((count ?? 0) + 1).padStart(4, "0")}`;

  const { data: commande } = await supabase
    .from("commandes")
    .insert({ numero, fournisseur_id, date_commande: today(), statut: "brouillon",
      notes: "Créée depuis « À commander »" })
    .select("id").single();
  if (!commande) throw new Error("Création de la commande impossible.");

  await supabase.from("commande_lignes").insert(
    lignes.map((x) => ({
      commande_id: commande.id, article_id: x.b.article_id, quantite: x.manque, prix_unitaire: 0,
    })),
  );

  // Les besoins concernés passent en « commandé » et pointent vers la commande
  await supabase.from("besoins_appro")
    .update({ statut: "commande", commande_id: commande.id })
    .in("id", lignes.map((x) => x.b.id));

  revalidatePath("/a-commander");
  revalidatePath("/commandes");
  revalidatePath("/stock");
}
