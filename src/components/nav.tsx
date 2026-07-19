"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LABEL_ROLE, type Role } from "@/lib/types";
import { UNIVERS } from "@/lib/navigation";

export function BarreLaterale({ role, nom }: { role: Role; nom: string }) {
  const pathname = usePathname();
  const router = useRouter();

  // 7 univers ; chacun visible si au moins un sous-onglet est autorisé au rôle.
  const univers = UNIVERS.map((u) => {
    const onglets = u.onglets.filter((o) => o.roles.includes(role));
    return { ...u, onglets };
  }).filter((u) => u.onglets.length > 0);

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
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {univers.map((u) => {
          const href = u.onglets[0].href;
          const actif = u.onglets.some((o) => pathname === o.href || pathname.startsWith(o.href + "/"));
          return (
            <Link
              key={u.cle}
              href={href}
              prefetch={false}
              className={`flex items-center rounded-md px-3 py-2 text-sm transition-colors ${
                actif
                  ? "bg-brand-50 font-medium text-brand-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {u.libelle}
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
