"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function creerClient(formData: FormData) {
  const supabase = createClient();
  await supabase.from("clients").insert({
    nom: String(formData.get("nom") || "").trim(),
    adresse: String(formData.get("adresse") || "").trim() || null,
    contact: String(formData.get("contact") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
  });
  revalidatePath("/clients");
}

export async function modifierClient(formData: FormData) {
  const supabase = createClient();
  const id = String(formData.get("id"));
  await supabase.from("clients").update({
    nom: String(formData.get("nom") || "").trim(),
    adresse: String(formData.get("adresse") || "").trim() || null,
    contact: String(formData.get("contact") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
  }).eq("id", id);
  revalidatePath("/clients");
}

export async function supprimerClient(formData: FormData) {
  const supabase = createClient();
  await supabase.from("clients").delete().eq("id", String(formData.get("id")));
  revalidatePath("/clients");
}

export async function creerChantier(formData: FormData) {
  const supabase = createClient();
  await supabase.from("chantiers").insert({
    client_id: String(formData.get("client_id")),
    libelle: String(formData.get("libelle") || "").trim(),
    date_prevue: String(formData.get("date_prevue") || "").trim() || null,
    statut: String(formData.get("statut") || "en_cours"),
    ca: Number(formData.get("ca") || 0),
    cout_sous_traitance: Number(formData.get("cout_sous_traitance") || 0),
  });
  revalidatePath("/clients");
}

export async function modifierChantier(formData: FormData) {
  const supabase = createClient();
  const id = String(formData.get("id"));
  await supabase.from("chantiers").update({
    libelle: String(formData.get("libelle") || "").trim(),
    date_prevue: String(formData.get("date_prevue") || "").trim() || null,
    statut: String(formData.get("statut") || "en_cours"),
    ca: Number(formData.get("ca") || 0),
    cout_sous_traitance: Number(formData.get("cout_sous_traitance") || 0),
  }).eq("id", id);
  revalidatePath("/clients");
}

export async function supprimerChantier(formData: FormData) {
  const supabase = createClient();
  await supabase.from("chantiers").delete().eq("id", String(formData.get("id")));
  revalidatePath("/clients");
}
