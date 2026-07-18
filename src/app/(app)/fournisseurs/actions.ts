"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function creerFournisseur(formData: FormData) {
  const supabase = createClient();
  await supabase.from("fournisseurs").insert({
    nom: String(formData.get("nom") || "").trim(),
    email: String(formData.get("email") || "").trim() || null,
    telephone: String(formData.get("telephone") || "").trim() || null,
    delai_livraison_jours: Number(formData.get("delai_livraison_jours") || 7),
    notes: String(formData.get("notes") || "").trim() || null,
  });
  revalidatePath("/fournisseurs");
}

export async function modifierFournisseur(formData: FormData) {
  const supabase = createClient();
  const id = String(formData.get("id"));
  await supabase.from("fournisseurs").update({
    nom: String(formData.get("nom") || "").trim(),
    email: String(formData.get("email") || "").trim() || null,
    telephone: String(formData.get("telephone") || "").trim() || null,
    delai_livraison_jours: Number(formData.get("delai_livraison_jours") || 7),
    notes: String(formData.get("notes") || "").trim() || null,
  }).eq("id", id);
  revalidatePath("/fournisseurs");
}

export async function supprimerFournisseur(formData: FormData) {
  const supabase = createClient();
  await supabase.from("fournisseurs").delete().eq("id", String(formData.get("id")));
  revalidatePath("/fournisseurs");
}

export async function ajouterPrix(formData: FormData) {
  const supabase = createClient();
  await supabase.from("prix_fournisseur").insert({
    article_id: String(formData.get("article_id")),
    fournisseur_id: String(formData.get("fournisseur_id")),
    prix: Number(formData.get("prix") || 0),
    date: String(formData.get("date") || new Date().toISOString().slice(0, 10)),
  });
  revalidatePath("/fournisseurs");
}
