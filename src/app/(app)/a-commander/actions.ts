"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { decomposer } from "@/lib/appro";

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
  // Variante choisie (produit composé multi-variantes) ; null => 1re variante.
  const composition_id = String(formData.get("composition_id") || "").trim() || null;
  if (!chantier_id || !article_id || quantite <= 0) throw new Error("Champs manquants.");

  // Décompose le produit composé selon la variante ; sinon l'article lui-même.
  const lignes = await decomposer(supabase, article_id, quantite, composition_id);

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
      reservations.push({ chantier_id, article_id: l.article_id, quantite: aReserver, date_prevue: date_besoin, statut: "reserve", composition_id });
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

  // Livraison prévue = date de commande + délai du fournisseur ; statut « en transit ».
  const { data: fdata } = await supabase.from("fournisseurs")
    .select("delai_livraison_jours").eq("id", fournisseur_id).maybeSingle();
  const dLiv = new Date();
  dLiv.setDate(dLiv.getDate() + Number(fdata?.delai_livraison_jours ?? 7));
  const dateLivraison = dLiv.toISOString().slice(0, 10);

  const { data: commande } = await supabase
    .from("commandes")
    .insert({ numero, fournisseur_id, date_commande: today(), date_livraison_prevue: dateLivraison,
      statut: "en_transit", notes: "Créée depuis « À commander »" })
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

// Vue consolidée par article : crée UNE commande par fournisseur à partir d'une
// sélection d'articles (tous chantiers confondus).
//   formData.lignes = JSON [{ article_id, fournisseur_id }]
//     fournisseur_id = fournisseur conseillé résolu côté page (Admin) ; si vide,
//     on prend le rang 1 de vue_reassort côté serveur (le moins cher).
export async function creerCommandesGroupees(formData: FormData) {
  const supabase = createClient();

  let demande: { article_id: string; fournisseur_id?: string }[];
  try {
    demande = JSON.parse(String(formData.get("lignes") || "[]"));
  } catch {
    throw new Error("Sélection invalide.");
  }
  demande = (demande ?? []).filter((d) => d && d.article_id);
  if (demande.length === 0) throw new Error("Aucun article sélectionné.");

  const articleIds = [...new Set(demande.map((d) => d.article_id))];

  // Besoins « à commander » des articles sélectionnés + stock actuel + dernier prix
  const [{ data: besoinsData }, { data: stock }, { data: prix }] = await Promise.all([
    supabase.from("besoins_appro")
      .select("id, article_id, quantite")
      .eq("statut", "a_commander")
      .in("article_id", articleIds),
    supabase.from("vue_stock_actuel").select("article_id, stock").in("article_id", articleIds),
    supabase.from("vue_dernier_prix").select("article_id, dernier_prix").in("article_id", articleIds),
  ]);
  const besoins = (besoinsData as { id: string; article_id: string; quantite: number }[]) ?? [];
  if (besoins.length === 0) throw new Error("Aucun besoin à commander pour cette sélection.");

  const stockMap = new Map(((stock as any[]) ?? []).map((s) => [s.article_id, Number(s.stock)]));
  const prixMap = new Map(((prix as any[]) ?? []).map((p) => [p.article_id, Number(p.dernier_prix)]));

  // Fournisseur conseillé par article : d'abord celui fourni par la page, sinon
  // le rang 1 de vue_reassort (le moins cher) résolu ici.
  const fournisseurParArticle = new Map<string, string>();
  for (const d of demande) if (d.fournisseur_id) fournisseurParArticle.set(d.article_id, d.fournisseur_id);
  const aResoudre = articleIds.filter((id) => !fournisseurParArticle.has(id));
  if (aResoudre.length > 0) {
    const { data: reassort } = await supabase
      .from("vue_reassort")
      .select("article_id, fournisseur_id, rang")
      .eq("rang", 1)
      .in("article_id", aResoudre);
    for (const r of (reassort as any[]) ?? []) fournisseurParArticle.set(r.article_id, r.fournisseur_id);
  }

  // Manquants par article = Σ max(quantite - stock_actuel, 0) sur ses besoins
  const manquantParArticle = new Map<string, number>();
  const besoinsParArticle = new Map<string, string[]>();
  for (const b of besoins) {
    const manque = Math.max(Number(b.quantite) - (stockMap.get(b.article_id) ?? 0), 0);
    if (manque <= 0) continue;
    manquantParArticle.set(b.article_id, (manquantParArticle.get(b.article_id) ?? 0) + manque);
    const arr = besoinsParArticle.get(b.article_id) ?? [];
    arr.push(b.id);
    besoinsParArticle.set(b.article_id, arr);
  }

  // On ne retient que les articles à manquant > 0 dont le fournisseur est connu
  const parFournisseur = new Map<string, string[]>();
  for (const article_id of manquantParArticle.keys()) {
    const fournisseur_id = fournisseurParArticle.get(article_id);
    if (!fournisseur_id) continue;
    const arr = parFournisseur.get(fournisseur_id) ?? [];
    arr.push(article_id);
    parFournisseur.set(fournisseur_id, arr);
  }
  if (parFournisseur.size === 0) {
    throw new Error("Rien à commander : tout est en stock ou aucun fournisseur n'est connu pour ces articles.");
  }

  // Délai par fournisseur → date de livraison prévue
  const { data: fs } = await supabase.from("fournisseurs")
    .select("id, delai_livraison_jours").in("id", [...parFournisseur.keys()]);
  const delaiMap = new Map(((fs as any[]) ?? []).map((f) => [f.id, Number(f.delai_livraison_jours ?? 7)]));

  // Numérotation continue (même schéma que marquerCommande), incrémentée par commande créée
  const annee = new Date().getFullYear();
  const { count } = await supabase.from("commandes").select("id", { count: "exact", head: true });
  let seq = count ?? 0;

  // Une commande par fournisseur, une ligne par article
  for (const [fournisseur_id, arts] of parFournisseur) {
    seq += 1;
    const numero = `CMD-${annee}-${String(seq).padStart(4, "0")}`;
    const dLiv = new Date();
    dLiv.setDate(dLiv.getDate() + (delaiMap.get(fournisseur_id) ?? 7));

    const { data: commande } = await supabase
      .from("commandes")
      .insert({ numero, fournisseur_id, date_commande: today(),
        date_livraison_prevue: dLiv.toISOString().slice(0, 10), statut: "en_transit",
        notes: "Créée depuis « À commander » (consolidé par article)" })
      .select("id").single();
    if (!commande) throw new Error("Création de la commande impossible.");

    await supabase.from("commande_lignes").insert(
      arts.map((article_id) => ({
        commande_id: commande.id,
        article_id,
        quantite: manquantParArticle.get(article_id) ?? 0,
        prix_unitaire: prixMap.get(article_id) ?? 0,
      })),
    );

    const besoinIds = arts.flatMap((a) => besoinsParArticle.get(a) ?? []);
    if (besoinIds.length > 0) {
      await supabase.from("besoins_appro")
        .update({ statut: "commande", commande_id: commande.id })
        .in("id", besoinIds);
    }
  }

  revalidatePath("/a-commander");
  revalidatePath("/commandes");
  revalidatePath("/stock");
}
