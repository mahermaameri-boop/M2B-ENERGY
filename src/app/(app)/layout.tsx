import { requireProfil } from "@/lib/auth";
import { BarreLaterale } from "@/components/nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profil = await requireProfil();

  return (
    <div className="flex h-screen overflow-hidden">
      <BarreLaterale role={profil.role} nom={profil.nom} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-6">{children}</div>
      </main>
    </div>
  );
}
