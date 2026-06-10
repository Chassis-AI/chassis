/**
 * Écrans hors-cockpit du mode live : connexion magic link,
 * bootstrap d'instance, chargement, erreur.
 */

import { useState, type FormEvent } from "react";
import { supabase } from "./lib/supabase";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="gate">
      <div className="gate-box">
        <div className="logo gate-logo">
          CHASSIS<span className="tick">_</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Loading() {
  return (
    <Shell>
      <p className="gate-sub">Chargement…</p>
    </Shell>
  );
}

export function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Shell>
      <p className="gate-sub">Erreur de chargement</p>
      <p className="gate-err">{message}</p>
      <button className="batch-btn gate-btn" onClick={onRetry}>
        Réessayer
      </button>
    </Shell>
  );
}

export function SignIn() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase || !email) return;
    setState("sending");
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href },
    });
    if (err) {
      setError(err.message);
      setState("error");
    } else {
      setState("sent");
    }
  };

  return (
    <Shell>
      <p className="gate-sub">
        Connexion par lien magique — saisissez votre email, ouvrez le lien reçu.
      </p>
      {state === "sent" ? (
        <p className="gate-ok">
          Lien envoyé à <b>{email}</b>. Ouvrez-le sur cet appareil.
        </p>
      ) : (
        <form className="gate-form" onSubmit={submit}>
          <input
            className="gate-input"
            type="email"
            required
            autoFocus
            placeholder="vous@cabinet.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="batch-btn gate-btn" disabled={state === "sending"}>
            {state === "sending" ? "Envoi…" : "Recevoir le lien"}
          </button>
          {state === "error" && <p className="gate-err">{error}</p>}
        </form>
      )}
    </Shell>
  );
}

export function NoInstance({
  onCreate,
  onSignOut,
  userEmail,
}: {
  onCreate: (name: string, domain: string) => Promise<void>;
  onSignOut: () => void;
  userEmail: string | null;
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [state, setState] = useState<"idle" | "creating" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("creating");
    try {
      await onCreate(name.trim(), domain.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  };

  return (
    <Shell>
      <p className="gate-sub">
        Connecté{userEmail ? ` (${userEmail})` : ""} — aucune instance.
        <br />
        Instanciez votre vertical : nom + domaine métier.
      </p>
      <form className="gate-form" onSubmit={submit}>
        <input
          className="gate-input"
          required
          placeholder="Nom de l'instance (ex. Cabinet Méridien)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="gate-input"
          required
          placeholder="Domaine (ex. Pôle social — Paie & déclaratif)"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        />
        <button className="batch-btn gate-btn" disabled={state === "creating"}>
          {state === "creating" ? "Création…" : "Créer l'instance"}
        </button>
        {state === "error" && <p className="gate-err">{error}</p>}
      </form>
      <button className="gate-link" onClick={onSignOut}>
        Se déconnecter
      </button>
    </Shell>
  );
}
