"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const today = () => new Date().toISOString().slice(0, 10);

async function userId(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function coutSerie(supabase: ReturnType<typeof createClient>, serieId: string) {
  const { data } = await supabase.from("mouvements_stock")
    .select("prix_achat").eq("numero_serie_id", serieId)
    .in("type", ["reception", "entree_manuelle"]).order("date", { ascending: false }).limit(1).maybeSingle();
  return Number(data?.prix_achat ?? 0);
}
async function coutArticle(supabase: ReturnType<typeof createClient>, articleId: string) {
  const { data } = await supabase.from("mouvements_stock")
    .select("prix_achat").eq("article_id", articleId).in("type", ["reception", "entree_manuelle"])
    .not("prix_achat", "is", null).order("date", { ascending: false }).limit(1).maybeSingle();
  return Number(data?.prix_achat ?? 0);
}

export async function enregistrerRetour(formData: FormData) {
  const supabase = createClient();
  const uid = await userId(supabase);
  const type = String(formData.get("type"));
  const article_id = String(formData.get("article_id") || "") || null;
  const numero_serie = String(formData.get("numero_serie") || "").trim();
  const quantite = Number(formData.get("quantite") || 1);
  const motif = String(formData.get("motif") || "").trim() || null;
  const dateRetour = String(formData.get("date") || today());

  // Résolution éventuelle de la série
  let serie: { id: string; article_id: string } | null = null;
  if (numero_serie) {
    const { data } = await supabase.from("numeros_serie")
      .select("id, article_id").eq("numero_serie", numero_serie).limit(1).maybeSingle();
    serie = data ?? null;
  }
  const articleEffectif = serie?.article_id ?? article_id;

  // -------------------------------------------------------------------------
  // Type 1 — Retour chantier (non installé) : réintégration en stock
  // -------------------------------------------------------------------------
  if (type === "chantier_non_installe") {
    const bon_id = String(formData.get("bon_de_sortie_id") || "") || null;
    let chantier_id: string | null = null;
    if (bon_id) {
      const { data: bon } = await supabase.from("bons_de_sortie").select("chantier_id").eq("id", bon_id).single();
      chantier_id = bon?.chantier_id ?? null;
    }
    if (serie) {
      const cogs = await coutSerie(supabase, serie.id);
      await supabase.from("numeros_serie").update({
        statut: "en_stock", client_id: null, date_sortie: null,
      }).eq("id", serie.id);
      await supabase.from("mouvements_stock").insert({
        article_id: serie.article_id, type: "retour_chantier", quantite: 1,
        reference: bon_id, numero_serie_id: serie.id, chantier_id, prix_achat: cogs,
        motif: motif ?? "Retour chantier (non installé)", utilisateur_id: uid, date: dateRetour,
      });
    } else if (articleEffectif) {
      const cogs = await coutArticle(supabase, articleEffectif);
      await supabase.from("mouvements_stock").insert({
        article_id: articleEffectif, type: "retour_chantier", quantite: Math.abs(quantite),
        reference: bon_id, chantier_id, prix_achat: cogs,
        motif: motif ?? "Retour chantier (non installé)", utilisateur_id: uid, date: dateRetour,
      });
    }
    await supabase.from("retours").insert({
      type, reference: bon_id, article_id: articleEffectif, numero_serie_id: serie?.id ?? null,
      quantite: serie ? 1 : Math.abs(quantite), motif, decision: "Réintégré en stock", date: dateRetour,
    });
  }

  // -------------------------------------------------------------------------
  // Type 2 — Défectueux / SAV : renvoi fournisseur, pas de retour en stock dispo
  // -------------------------------------------------------------------------
  else if (type === "defectueux_sav") {
    if (serie) {
      await supabase.from("numeros_serie").update({ statut: "renvoye_fournisseur" }).eq("id", serie.id);
    }
    await supabase.from("retours").insert({
      type, reference: null, article_id: articleEffectif, numero_serie_id: serie?.id ?? null,
      quantite: serie ? 1 : Math.abs(quantite), motif, decision: "Renvoyé au fournisseur (garantie)", date: dateRetour,
    });
  }

  // -------------------------------------------------------------------------
  // Type 3 — Annulation / retour de commande : commande annulée (+ avoir)
  // -------------------------------------------------------------------------
  else if (type === "commande") {
    const commande_id = String(formData.get("commande_id") || "") || null;
    const marchandiseRenvoyee = formData.get("marchandise_renvoyee") === "on";
    const avoir_montant = formData.get("avoir_montant") ? Number(formData.get("avoir_montant")) : null;
    if (commande_id) {
      await supabase.from("commandes").update({ statut: "annulee" }).eq("id", commande_id);
    }
    if (marchandiseRenvoyee && articleEffectif) {
      const cogs = await coutArticle(supabase, articleEffectif);
      await supabase.from("mouvements_stock").insert({
        article_id: articleEffectif, type: "retour_fournisseur", quantite: -Math.abs(quantite),
        reference: commande_id, numero_serie_id: serie?.id ?? null, prix_achat: cogs,
        motif: motif ?? "Retour fournisseur (annulation commande)", utilisateur_id: uid, date: dateRetour,
      });
      if (serie) await supabase.from("numeros_serie").update({ statut: "renvoye_fournisseur" }).eq("id", serie.id);
    }
    await supabase.from("retours").insert({
      type, reference: commande_id, article_id: articleEffectif, numero_serie_id: serie?.id ?? null,
      quantite: Math.abs(quantite), motif,
      decision: marchandiseRenvoyee ? "Commande annulée + marchandise renvoyée" : "Commande annulée",
      avoir_montant, date: dateRetour,
    });
  }

  revalidatePath("/retours");
  revalidatePath("/stock");
}
