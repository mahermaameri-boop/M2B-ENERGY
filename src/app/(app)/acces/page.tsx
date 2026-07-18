import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EnTetePage, Carte, Badge, Vide } from "@/components/ui";
import { dateFr } from "@/lib/format";
import { LABEL_ROLE, type Profil, type Role } from "@/lib/types";
import { changerRole, inviterCollaborateur } from "./actions";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["admin", "operationnel", "bureau"];

export default async function AccesPage() {
  await requireRole(["admin"]);
  const supabase = createClient();

  const { data: profilsData } = await supabase
    .from("profils")
    .select("id, nom, role, cree_le")
    .order("cree_le", { ascending: true });
  const profils = (profilsData as Profil[] | null) ?? [];

  // Fusion des e-mails via le client service_role. Peut être indisponible.
  const emails = new Map<string, string>();
  let serviceRoleDisponible = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (serviceRoleDisponible) {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.auth.admin.listUsers();
      if (error) throw error;
      for (const u of data.users) {
        if (u.email) emails.set(u.id, u.email);
      }
    } catch {
      serviceRoleDisponible = false;
    }
  }

  return (
    <>
      <EnTetePage
        titre="Rôles & accès"
        description="Gérez les collaborateurs, leurs rôles et invitez de nouveaux comptes."
      />

      {!serviceRoleDisponible && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          La clé service_role n'est pas configurée : l'invitation de comptes et
          l'affichage des e-mails sont indisponibles.
        </div>
      )}

      <div className="mb-6 rounded-md border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600">
        Le collaborateur invité reçoit un e-mail contenant un lien d'invitation
        pour définir son mot de passe. Le premier compte administrateur doit être
        créé manuellement dans Supabase (voir le README).
      </div>

      <Carte titre="Collaborateurs">
        <details className="mb-4">
          <summary className="btn-primaire w-fit cursor-pointer">
            + Inviter un collaborateur
          </summary>
          <form
            action={inviterCollaborateur}
            className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            <div>
              <label className="etiquette">E-mail</label>
              <input name="email" type="email" required className="champ" />
            </div>
            <div>
              <label className="etiquette">Nom</label>
              <input name="nom" className="champ" />
            </div>
            <div>
              <label className="etiquette">Rôle</label>
              <select name="role" className="champ" defaultValue="operationnel">
                {ROLES.map((r) => (
                  <option key={r} value={r}>{LABEL_ROLE[r]}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <button className="btn-primaire" disabled={!serviceRoleDisponible}>
                Envoyer l'invitation
              </button>
            </div>
          </form>
        </details>

        {profils.length === 0 ? (
          <Vide message="Aucun collaborateur." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>E-mail</th>
                  <th>Rôle</th>
                  <th>Créé le</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {profils.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.nom || "—"}</td>
                    <td className="text-gray-500">{emails.get(p.id) ?? "—"}</td>
                    <td><Badge couleur="bleu">{LABEL_ROLE[p.role]}</Badge></td>
                    <td className="text-gray-500">{dateFr(p.cree_le)}</td>
                    <td className="text-right">
                      <details>
                        <summary className="cursor-pointer text-xs text-brand-600">
                          Modifier le rôle
                        </summary>
                        <form action={changerRole} className="mt-2 grid gap-2 text-left">
                          <input type="hidden" name="id" value={p.id} />
                          <select name="role" defaultValue={p.role} className="champ">
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{LABEL_ROLE[r]}</option>
                            ))}
                          </select>
                          <button className="btn-primaire">Mettre à jour</button>
                        </form>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
    </>
  );
}
