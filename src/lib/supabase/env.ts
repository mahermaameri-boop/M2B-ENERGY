// Résolution des variables d'environnement Supabase.
// Compatible avec l'ancien nommage (anon / service_role) ET le nouveau
// (publishable / secret), pour éviter toute erreur de configuration.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export const SUPABASE_ANON_KEY =
  (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!;

// Clé serveur (secrète) — utilisée uniquement côté serveur (module admin).
export const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
