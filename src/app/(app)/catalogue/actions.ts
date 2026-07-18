"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function creerArticle(formData: FormData) {
  const supabase = createClient();
  await supabase.from("articles").insert({
    reference: String(formData.get("reference") || "").trim(),
    designation: String(formData.get("designation") || "").trim(),
    categorie: String(formData.get("categorie") || "accessoire"),
    unite: String(formData.get("unite") || "").trim() || "pièce",
    serialise: formData.get("serialise") === "on",
    seuil_manuel: Math.max(0, Number(formData.get("seuil_manuel") || 0)),
    actif: formData.get("actif") === "on",
  });
  revalidatePath("/catalogue");
}

export async function modifierArticle(formData: FormData) {
  const supabase = createClient();
  const id = String(formData.get("id"));
  await supabase.from("articles").update({
    reference: String(formData.get("reference") || "").trim(),
    designation: String(formData.get("designation") || "").trim(),
    categorie: String(formData.get("categorie") || "accessoire"),
    unite: String(formData.get("unite") || "").trim() || "pièce",
    serialise: formData.get("serialise") === "on",
    seuil_manuel: Math.max(0, Number(formData.get("seuil_manuel") || 0)),
    actif: formData.get("actif") === "on",
  }).eq("id", id);
  revalidatePath("/catalogue");
}

export async function supprimerArticle(formData: FormData) {
  const supabase = createClient();
  await supabase.from("articles").delete().eq("id", String(formData.get("id")));
  revalidatePath("/catalogue");
}

export async function creerComposition(formData: FormData) {
  const supabase = createClient();
  await supabase.from("compositions").insert({
    article_fini_id: String(formData.get("article_fini_id")),
  });
  revalidatePath("/catalogue");
}

export async function ajouterLigneComposition(formData: FormData) {
  const supabase = createClient();
  await supabase.from("composition_lignes").insert({
    composition_id: String(formData.get("composition_id")),
    article_composant_id: String(formData.get("article_composant_id")),
    quantite: Math.max(1, Number(formData.get("quantite") || 1)),
  });
  revalidatePath("/catalogue");
}

export async function supprimerLigneComposition(formData: FormData) {
  const supabase = createClient();
  await supabase.from("composition_lignes").delete().eq("id", String(formData.get("id")));
  revalidatePath("/catalogue");
}

export async function supprimerComposition(formData: FormData) {
  const supabase = createClient();
  await supabase.from("compositions").delete().eq("id", String(formData.get("id")));
  revalidatePath("/catalogue");
}
