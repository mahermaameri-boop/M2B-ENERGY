import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profil, Role } from "@/lib/types";

// Récupère le profil de l'utilisateur connecté, ou null.
export async function getProfil(): Promise<Profil | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profils")
    .select("id, nom, role, cree_le")
    .eq("id", user.id)
    .single();
  return (data as Profil) ?? null;
}

// Exige un utilisateur connecté ; sinon redirige vers /login.
export async function requireProfil(): Promise<Profil> {
  const profil = await getProfil();
  if (!profil) redirect("/login");
  return profil;
}

// Exige un rôle parmi la liste ; sinon redirige vers le tableau de bord.
export async function requireRole(roles: Role[]): Promise<Profil> {
  const profil = await requireProfil();
  if (!roles.includes(profil.role)) redirect("/tableau-de-bord");
  return profil;
}

// Modèle à 2 rôles : tout le financier est réservé à l'Admin.
export const peutVoirCa = (r: Role) => r === "admin";
export const peutVoirPrix = (r: Role) => r === "admin";
export const peutVoirMarge = (r: Role) => r === "admin";
export const estAdmin = (r: Role) => r === "admin";
