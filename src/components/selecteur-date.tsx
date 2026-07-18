"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function SelecteurDate({ param = "date", valeur }: { param?: string; valeur: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function change(v: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (v) params.set(param, v);
    else params.delete(param);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <input
      type="date"
      value={valeur}
      onChange={(e) => change(e.target.value)}
      className="champ w-auto"
    />
  );
}
