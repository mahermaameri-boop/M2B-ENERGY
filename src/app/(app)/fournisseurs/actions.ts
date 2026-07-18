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

