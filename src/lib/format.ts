// Formatage belge (fr-BE) : euros, nombres, dates

export function euro(montant: number | null | undefined): string {
  if (montant === null || montant === undefined || Number.isNaN(montant)) return "—";
  return new Intl.NumberFormat("fr-BE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(montant);
}

export function nombre(n: number | null | undefined, decimales = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("fr-BE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales,
  }).format(n);
}

export function pourcentage(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) return "—";
  return `${new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 1 }).format(p)} %`;
}

// Date au format jj/mm/aaaa
export function dateFr(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-BE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

// aaaa-mm-jj pour les <input type="date">
export function dateISO(d?: Date): string {
  const date = d ?? new Date();
  return date.toISOString().slice(0, 10);
}
