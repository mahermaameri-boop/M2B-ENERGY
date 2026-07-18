import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from "./env";

// Client "service_role / secret" — À N'UTILISER QUE CÔTÉ SERVEUR.
// Contourne la RLS : réservé à l'administration des comptes (module Accès).
export function createAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
