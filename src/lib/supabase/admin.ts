import { createClient } from "@supabase/supabase-js";

// Client "service_role" — À N'UTILISER QUE CÔTÉ SERVEUR (jamais exposé au client).
// Contourne la RLS : réservé à l'administration des comptes (module Accès).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
