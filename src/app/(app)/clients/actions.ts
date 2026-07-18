"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfil } from "@/lib/auth";

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
  const profil = await getProfil();
  const estAdmin = profil?.role === "admin";

  const donnees: Record<string, unknown> = {
    client_id: String(formData.get("client_id")),
    libelle: String(formData.get("libelle") || "").trim(),
    date_prevue: String(formData.get("date_prevue") || "").trim() || null,
    statut: String(formData.get("statut") || "planifie"),
  };

  // Financier réservé à l'Admin : jamais écrit pour un collaborateur,
  // même via une requête forgée (contrôle côté serveur).
  if (estAdmin) {
    donnees.ca = Number(formData.get("ca") || 0);
    donnees.cout_sous_traitance = formData.get("cout_sous_traitance") ? Number(formData.get("cout_sous_traitance")) : null;
  }

  await supabase.from("chantiers").insert(donnees);
  revalidatePath("/clients");
}

export async function modifierChantier(formData: FormData) {
  const supabase = createClient();
  const id = String(formData.get("id"));
  const profil = await getProfil();
  const estAdmin = profil?.role === "admin";

  const donnees: Record<string, unknown> = {
    libelle: String(formData.get("libelle") || "").trim(),
    date_prevue: String(formData.get("date_prevue") || "").trim() || null,
    statut: String(formData.get("statut") || "planifie"),
  };

  // Financier réservé à l'Admin : jamais écrit pour un collaborateur,
  // même via une requête forgée (contrôle côté serveur).
  if (estAdmin) {
    donnees.ca = Number(formData.get("ca") || 0);
    donnees.cout_sous_traitance = formData.get("cout_sous_traitance") ? Number(formData.get("cout_sous_traitance")) : null;
  }

  await supabase.from("chantiers").update(donnees).eq("id", id);
  revalidatePath("/clients");
}

export async function supprimerChantier(formData: FormData) {
  const supabase = createClient();
  await supabase.from("chantiers").delete().eq("id", String(formData.get("id")));
  revalidatePath("/clients");
}
