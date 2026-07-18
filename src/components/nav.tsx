"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LABEL_ROLE, type Role } from "@/lib/types";

interface Item {
  href: string;
  libelle: string;
  roles: Role[];
}

const TOUS: Role[] = ["admin", "collaborateur"];
const ADMIN: Role[] = ["admin"];

const ITEMS: Item[] = [
  { href: "/tableau-de-bord", libelle: "Tableau de bord",          roles: TOUS },
  { href: "/stock",           libelle: "Stock",                    roles: TOUS },
  { href: "/catalogue",       libelle: "Catalogue & compositions", roles: TOUS },
  { href: "/a-commander",     libelle: "À commander",              roles: TOUS },
  { href: "/commandes",       libelle: "Commandes",                roles: TOUS },
  { href: "/receptions",      libelle: "Réceptions",               roles: TOUS },
  { href: "/fournisseurs",    libelle: "Fournisseurs & prix",      roles: ADMIN },
  { href: "/sorties",         libelle: "Sorties & bons",           roles: TOUS },
  { href: "/retours",         libelle: "Retours",                  roles: TOUS },
  { href: "/clients",         libelle: "Clients & chantiers",      roles: TOUS },
  { href: "/historique",      libelle: "Historique",               roles: TOUS },
  { href: "/marges",          libelle: "Marges",                   roles: ADMIN },
  { href: "/tracabilite",     libelle: "Traçabilité",              roles: TOUS },
  { href: "/acces",           libelle: "Rôles & accès",            roles: ADMIN },
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
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {items.map((item) => {
          const actif = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm ${
                actif
                  ? "bg-brand-50 font-medium text-brand-700"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {item.libelle}
            </Link>
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
