import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Carte, EnTetePage } from "@/components/ui";
import type { Client, Chantier } from "@/lib/types";
import { ClientsTable } from "./clients-table";
import {
  creerClient, modifierClient, supprimerClient,
  creerChantier, modifierChantier, supprimerChantier,
  ajouterLigneChantier, supprimerLigneChantier,
} from "./actions";

export const dynamic = "force-dynamic";

interface LigneChantier {
  id: string;
  chantier_id: string;
  article_id: string;
  quantite: number;
}

interface ArticleLite {
  id: string;
  reference: string;
  designation: string;
}

export default async function ClientsPage() {
  const profil = await requireProfil();
  const voitCa = profil.role === "admin";
  const supabase = createClient();

  // Sélection dépendante du rôle : les colonnes financières (ca,
  // cout_sous_traitance) ne sont même pas récupérées pour un non-admin.
  const champsChantier = voitCa
    ? "id, client_id, libelle, date_prevue, statut, ca, cout_sous_traitance"
    : "id, client_id, libelle, date_prevue, statut";

  const [{ data: clients }, { data: chantiers }, { data: lignes }, { data: articles }] =
    await Promise.all([
      supabase.from("clients").select("*").order("nom"),
      supabase.from("chantiers").select(champsChantier).order("date_prevue"),
      supabase.from("chantier_lignes").select("id, chantier_id, article_id, quantite").order("cree_le"),
      supabase
        .from("articles")
        .select("id, reference, designation")
        .eq("actif", true)
        .order("designation"),
    ]);

  const listeClients = (clients as Client[] | null) ?? [];
  const listeChantiers = (chantiers as Chantier[] | null) ?? [];
  const listeLignes = (lignes as LigneChantier[] | null) ?? [];
  const listeArticles = (articles as ArticleLite[] | null) ?? [];

  return (
    <>
      <EnTetePage
        titre={voitCa ? "Clients & chantiers" : "Clients"}
        description={
          voitCa
            ? "Fiches clients, chantiers, matériel à poser et chiffre d'affaires."
            : "Fiches clients, chantiers et matériel à poser."
        }
      />

      <Carte titre="Clients">
        <ClientsTable
          clients={listeClients}
          chantiers={listeChantiers}
          lignes={listeLignes}
          articles={listeArticles}
          voitCa={voitCa}
          creerClient={creerClient}
          modifierClient={modifierClient}
          supprimerClient={supprimerClient}
          creerChantier={creerChantier}
          modifierChantier={modifierChantier}
          supprimerChantier={supprimerChantier}
          ajouterLigneChantier={ajouterLigneChantier}
          supprimerLigneChantier={supprimerLigneChantier}
        />
      </Carte>
    </>
  );
}
