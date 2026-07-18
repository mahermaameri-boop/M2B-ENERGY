"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [charge, setCharge] = useState(false);

  async function connexion(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setCharge(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
    setCharge(false);
    if (error) {
      setErreur("Identifiants incorrects ou compte inexistant.");
      return;
    }
    router.push("/tableau-de-bord");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-brand-700">M2B ENERGY</div>
          <div className="text-sm text-gray-500">Outil opérationnel interne</div>
        </div>
        <form onSubmit={connexion} className="carte space-y-4 p-6">
          <div>
            <label className="etiquette">Adresse e-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="champ"
              placeholder="prenom.nom@m2benergy.be"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="etiquette">Mot de passe</label>
            <input
              type="password"
              required
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              className="champ"
              autoComplete="current-password"
            />
          </div>
          {erreur && <p className="text-sm text-red-600">{erreur}</p>}
          <button type="submit" disabled={charge} className="btn-primaire w-full">
            {charge ? "Connexion…" : "Se connecter"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-gray-400">
          Accès réservé aux collaborateurs M2B ENERGY.
        </p>
      </div>
    </div>
  );
}
