"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface Onglet { href: string; libelle: string }

// Barre de sous-onglets à l'intérieur d'un univers.
export function SousOnglets({ onglets }: { onglets: Onglet[] }) {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex flex-wrap gap-1 border-b border-gray-200">
      {onglets.map((o) => {
        const actif = pathname === o.href || pathname.startsWith(o.href + "/");
        return (
          <Link
            key={o.href}
            href={o.href}
            prefetch={false}
            className={`-mb-px border-b-2 px-3.5 py-2 text-sm transition-colors ${
              actif
                ? "border-brand-600 font-medium text-brand-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {o.libelle}
          </Link>
        );
      })}
    </div>
  );
}
