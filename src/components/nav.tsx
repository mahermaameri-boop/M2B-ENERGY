"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LABEL_ROLE, type Role } from "@/lib/types";

type Groupe = "Pilotage" | "Approvisionnement" | "Chantiers" | "Réglages";

interface Item {
  href: string;
  libelle: string;
  roles: Role[];
  groupe: Groupe;
}

const TOUS: Role[] = ["admin", "collaborateur"];
const ADMIN: Role[] = ["admin"];

const GROUPES: Groupe[] = ["Pilotage", "Approvisionnement", "Chantiers", "Réglages"];

const ITEMS: Item[] = [
  { href: "/tableau-de-bord", libelle: "Tableau de bord",          roles: TOUS,  groupe: "Pilotage" },
  { href: "/planning",        libelle: "Planning",                 roles: TOUS,  groupe: "Pilotage" },
  { href: "/historique",      libelle: "Historique",               roles: TOUS,  groupe: "Pilotage" },
  { href: "/marges",          libelle: "Marges",                   roles: ADMIN, groupe: "Pilotage" },

  { href: "/stock",           libelle: "Stock",                    roles: TOUS,  groupe: "Approvisionnement" },
  { href: "/a-commander",     libelle: "À commander",              roles: TOUS,  groupe: "Approvisionnement" },
  { href: "/commandes",       libelle: "Commandes",                roles: TOUS,  groupe: "Approvisionnement" },
  { href: "/receptions",      libelle: "Réceptions",               roles: TOUS,  groupe: "Approvisionnement" },
  { href: "/fournisseurs",    libelle: "Fournisseurs & prix",      roles: ADMIN, groupe: "Approvisionnement" },

  { href: "/clients",         libelle: "Clients & chantiers",      roles: TOUS,  groupe: "Chantiers" },
  { href: "/sorties",         libelle: "Sorties & bons",           roles: TOUS,  groupe: "Chantiers" },
  { href: "/retours",         libelle: "Retours",                  roles: TOUS,  groupe: "Chantiers" },
  { href: "/tracabilite",     libelle: "Traçabilité",              roles: TOUS,  groupe: "Chantiers" },

  { href: "/catalogue",       libelle: "Catalogue & compositions", roles: TOUS,  groupe: "Réglages" },
  { href: "/acces",           libelle: "Rôles & accès",            roles: ADMIN, groupe: "Réglages" },
];

export function BarreLaterale({ role, nom }: { role: Role; nom: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = ITEMS.filter((i) => i.roles.includes(role));

  async function deconnexion() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-4">
        <div className="text-lg font-bold text-brand-700">M2B ENERGY</div>
        <div className="text-xs text-gray-400">Outil opérationnel</div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        {GROUPES.map((groupe) => {
          const groupeItems = items.filter((i) => i.groupe === groupe);
          if (groupeItems.length === 0) return null;
          return (
            <div key={groupe} className="mb-4">
              <div className="px-2 pb-1.5 text-[0.68rem] font-semibold uppercase tracking-wider text-gray-400">
                {groupe}
              </div>
              <div className="space-y-0.5">
                {groupeItems.map((item) => {
                  const actif = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      className={`flex items-center rounded-lg px-3 py-1.5 text-sm transition-colors ${
                        actif
                          ? "bg-brand-50 font-medium text-brand-700 ring-1 ring-inset ring-brand-100"
                          : "text-gray-600 hover:bg-gray-100/70 hover:text-gray-900"
                      }`}
                    >
                      {item.libelle}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-gray-200 p-3">
        <div className="mb-2 px-1">
          <div className="truncate text-sm font-medium text-gray-700">{nom || "Utilisateur"}</div>
          <div className="text-xs text-gray-400">{LABEL_ROLE[role]}</div>
        </div>
        <button onClick={deconnexion} className="btn-secondaire w-full">
          Se déconnecter
        </button>
      </div>
    </aside>
  );
}
