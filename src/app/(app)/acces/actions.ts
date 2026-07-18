"use server";

import { revalidatePath } from "next/cache";
import { getProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_SERVICE_KEY } from "@/lib/supabase/env";
import type { Role } from "@/lib/types";

async function assertAdmin() {
  const profil = await getProfil();
  if (profil?.role !== "admin") throw new Error("Accès refusé");
}

const ROLES: Role[] = ["admin", "operationnel", "bureau"];

function lireRole(formData: FormData): Role {
  const r = String(formData.get("role") || "");
  return (ROLES as string[]).includes(r) ? (r as Role) : "operationnel";
}

export async function changerRole(formData: FormData) {
  await assertAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const role = lireRole(formData);
  await supabase.from("profils").update({ role }).eq("id", id);
  revalidatePath("/acces");
}

export async function inviterCollaborateur(formData: FormData) {
  await assertAdmin();
  if (!SUPABASE_SERVICE_KEY) {
    throw new Error(
      "La clé service_role n'est pas configurée : l'invitation de comptes est indisponible.",
    );
  }
  const email = String(formData.get("email") || "").trim();
  const nom = String(formData.get("nom") || "").trim();
  const role = lireRole(formData);
  if (!email) throw new Error("L'adresse e-mail est obligatoire.");

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { nom, role },
  });
  if (error) throw new Error(error.message);
  // Le déclencheur handle_new_user crée le profil à partir des métadonnées.
  revalidatePath("/acces");
}
