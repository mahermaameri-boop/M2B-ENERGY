"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfil } from "@/lib/auth";
import { decomposer, genererAppro } from "@/lib/appro";

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

// Ajoute une ligne de matériel à poser au chantier, puis génère
// automatiquement l'appro (réservations sur stock + besoins à commander).
export async function ajouterLigneChantier(formData: FormData) {
  const supabase = createClient();
  const chantier_id = String(formData.get("chantier_id"));
  const article_id = String(formData.get("article_id"));
  const quantite = Math.max(1, Number(formData.get("quantite") || 1));

  // composition_id optionnel = null pour l'instant (les variantes viennent plus tard).
  await supabase.from("chantier_lignes").insert({
    chantier_id,
    article_id,
    composition_id: null,
    quantite,
  });

  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const comps = await decomposer(supabase, article_id, quantite, null);
  await genererAppro(supabase, chantier_id, comps, { cree_par: uid });

  revalidatePath("/clients");
  revalidatePath("/a-commander");
  revalidatePath("/stock");
  revalidatePath("/planning");
}

// Supprime une ligne de matériel. Ne touche pas aux réservations déjà créées.
export async function supprimerLigneChantier(formData: FormData) {
  const supabase = createClient();
  await supabase.from("chantier_lignes").delete().eq("id", String(formData.get("id")));
  revalidatePath("/clients");
}
