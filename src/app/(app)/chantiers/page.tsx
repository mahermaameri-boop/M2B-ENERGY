import Link from "next/link";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EnTetePage, Carte, Badge, Vide } from "@/components/ui";
import { SousOnglets } from "@/components/sous-onglets";
import { ongletsUnivers } from "@/lib/navigation";
import { dateFr } from "@/lib/format";
import { etapeChantier, LABEL_ETAPE, COULEUR_ETAPE } from "@/lib/chantier-statut";

export const dynamic = "force-dynamic";

export default async function ChantiersPage() {
  const profil = await requireProfil();
  const supabase = createClient();

  const [{ data: chantiers }, { data: besoins }] = await Promise.all([
    supabase.from("chantiers")
      .select("id, libelle, date_prevue, statut, prepare_le, cout_sous_traitance, clients(nom)")
      .order("date_prevue", { ascending: false }),
    supabase.from("besoins_appro").select("chantier_id, statut"),
  ]);

  const besoinsParChantier = new Map<string, string[]>();
  for (const b of (besoins as any[]) ?? []) {
    const arr = besoinsParChantier.get(b.chantier_id) ?? [];
    arr.push(b.statut);
    besoinsParChantier.set(b.chantier_id, arr);
  }

  const lignes = ((chantiers as any[]) ?? []).map((c) => ({
    c,
    etape: etapeChantier(
      { statut: c.statut, prepare_le: c.prepare_le, cout_sous_traitance: c.cout_sous_traitance ?? null },
      besoinsParChantier.get(c.id) ?? [],
    ),
  }));

  return (
    <>
      <SousOnglets onglets={ongletsUnivers("chantiers", profil.role)} />
      <EnTetePage
        titre="Chantiers"
        description="Le cœur de l'outil : chaque chantier porte son matériel, son planning et son pipeline."
        action={<Link href="/clients" className="btn-primaire">+ Nouveau chantier</Link>}
      />

      <Carte>
        {lignes.length === 0 ? (
          <Vide message="Aucun chantier. Créez un client et un chantier dans l'onglet Clients." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Chantier</th><th>Client</th><th>Date de pose</th><th>Étape</th><th></th>
                </tr>
              </thead>
              <tbody>
                {lignes.map(({ c, etape }) => (
                  <tr key={c.id}>
                    <td className="font-medium">
                      <Link href={`/chantiers/${c.id}`} className="lien">{c.libelle}</Link>
                    </td>
                    <td className="text-gray-600">{c.clients?.nom ?? "—"}</td>
                    <td>{dateFr(c.date_prevue)}</td>
                    <td><Badge couleur={COULEUR_ETAPE[etape]}>{LABEL_ETAPE[etape]}</Badge></td>
                    <td className="text-right">
                      <Link href={`/chantiers/${c.id}`} className="text-xs text-brand-600 hover:underline">Ouvrir →</Link>
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
