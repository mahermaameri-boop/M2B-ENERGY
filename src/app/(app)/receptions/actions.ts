"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const today = () => new Date().toISOString().slice(0, 10);

interface LigneReception {
  ligne_id: string;
  article_id: string;
  serialise: boolean;
  quantite_recue: number;
  series: string[];
  prix_unitaire: number;
}

async function userId(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function receptionnerCommande(formData: FormData) {
  const supabase = createClient();
  const commande_id = String(formData.get("commande_id"));
  const factureNumero = String(formData.get("facture_numero") || "").trim();
  const factureDate = String(formData.get("facture_date") || today());
  const lignes: LigneReception[] = JSON.parse(String(formData.get("lignes") || "[]"));
  const uid = await userId(supabase);

  const { data: commande } = await supabase
    .from("commandes").select("id, fournisseur_id").eq("id", commande_id).single();
  if (!commande) throw new Error("Commande introuvable");

  // Facture d'achat (obligatoire pour rattacher les séries à l'origine)
  let factureId: string | null = null;
  if (factureNumero) {
    const { data: facture } = await supabase
      .from("factures_achat")
      .insert({ numero: factureNumero, fournisseur_id: commande.fournisseur_id, date: factureDate })
      .select("id").single();
    factureId = facture?.id ?? null;
  }

  for (const l of lignes) {
    const nbSerie = l.series.filter((s) => s.trim()).length;
    const qte = l.serialise ? nbSerie : l.quantite_recue;
    if (qte <= 0) continue;

    if (l.serialise) {
      for (const ns of l.series.map((s) => s.trim()).filter(Boolean)) {
        const { data: serie } = await supabase
          .from("numeros_serie")
          .insert({
            article_id: l.article_id,
            numero_serie: ns,
            facture_achat_id: factureId,
            statut: "en_stock",
            date_entree: factureDate,
          })
          .select("id").single();
        await supabase.from("mouvements_stock").insert({
          article_id: l.article_id,
          type: "reception",
          quantite: 1,
          reference: commande_id,
          numero_serie_id: serie?.id ?? null,
          facture_achat_id: factureId,
          prix_achat: l.prix_unitaire,
          motif: "Réception commande",
          utilisateur_id: uid,
        });
      }
    } else {
      await supabase.from("mouvements_stock").insert({
        article_id: l.article_id,
        type: "reception",
        quantite: qte,
        reference: commande_id,
        facture_achat_id: factureId,
        prix_achat: l.prix_unitaire,
        motif: "Réception commande",
        utilisateur_id: uid,
      });
    }

    // Mise à jour de la quantité reçue cumulée
    const { data: cl } = await supabase
      .from("commande_lignes").select("quantite_recue").eq("id", l.ligne_id).single();
    await supabase.from("commande_lignes")
      .update({ quantite_recue: Number(cl?.quantite_recue ?? 0) + qte })
      .eq("id", l.ligne_id);
  }

  // Recalcul du statut de la commande
  const { data: toutes } = await supabase
    .from("commande_lignes").select("quantite, quantite_recue").eq("commande_id", commande_id);
  const lignesArr = (toutes as { quantite: number; quantite_recue: number }[]) ?? [];
  const totalRecu = lignesArr.every((x) => Number(x.quantite_recue) >= Number(x.quantite));
  const partiel = lignesArr.some((x) => Number(x.quantite_recue) > 0);
  await supabase.from("commandes")
    .update({ statut: totalRecu ? "livree" : partiel ? "livree_partiel" : "en_transit" })
    .eq("id", commande_id);

  // Passerelle « À commander » : les besoins liés à cette commande passent en reçu
  if (totalRecu) {
    await supabase.from("besoins_appro").update({ statut: "recu" }).eq("commande_id", commande_id);
  }

  revalidatePath("/receptions");
  revalidatePath("/a-commander");
  revalidatePath("/stock");
  revalidatePath(`/commandes/${commande_id}`);
  redirect(`/commandes/${commande_id}`);
}

export async function entreeManuelle(formData: FormData) {
  const supabase = createClient();
  const uid = await userId(supabase);
  // Le prix d'achat est financier : capturé uniquement si l'utilisateur est Admin.
  const { data: profil } = await supabase.from("profils").select("role").eq("id", uid ?? "").maybeSingle();
  const estAdmin = profil?.role === "admin";
  const article_id = String(formData.get("article_id"));
  const quantite = Number(formData.get("quantite") || 0);
  const prix_achat = estAdmin ? Number(formData.get("prix_achat") || 0) : 0;
  const fournisseur_id = String(formData.get("fournisseur_id") || "") || null;
  const numero_facture = String(formData.get("numero_facture") || "").trim();
  const motif = String(formData.get("motif") || "").trim() || "Entrée manuelle";
  const dateMouv = String(formData.get("date") || today());
  const series = String(formData.get("series") || "")
    .split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);

  if (quantite <= 0 && series.length === 0) throw new Error("Quantité requise.");

  let factureId: string | null = null;
  if (numero_facture && fournisseur_id) {
    const { data: facture } = await supabase
      .from("factures_achat")
      .insert({ numero: numero_facture, fournisseur_id, date: dateMouv })
      .select("id").single();
    factureId = facture?.id ?? null;
  }

  if (series.length > 0) {
    for (const ns of series) {
      const { data: serie } = await supabase
        .from("numeros_serie")
        .insert({ article_id, numero_serie: ns, facture_achat_id: factureId, statut: "en_stock", date_entree: dateMouv })
        .select("id").single();
      await supabase.from("mouvements_stock").insert({
        article_id, type: "entree_manuelle", quantite: 1,
        numero_serie_id: serie?.id ?? null, facture_achat_id: factureId,
        prix_achat, motif, utilisateur_id: uid, date: dateMouv,
      });
    }
  } else {
    await supabase.from("mouvements_stock").insert({
      article_id, type: "entree_manuelle", quantite,
      facture_achat_id: factureId, prix_achat, motif, utilisateur_id: uid, date: dateMouv,
    });
  }

  revalidatePath("/receptions");
  revalidatePath("/stock");
}
