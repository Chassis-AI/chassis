/**
 * Écrans hors-cockpit du mode live : connexion magic link,
 * bootstrap d'instance, chargement, erreur. Tous traduits (i18n).
 */

import { useState, type FormEvent } from "react";
import { LangSwitcher, useI18n } from "./lib/i18n";
import { supabase } from "./lib/supabase";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="gate">
      <div className="gate-box">
        <div className="gate-top">
          <div className="logo gate-logo">
            CHASSIS<span className="tick">_</span>
          </div>
          <LangSwitcher />
        </div>
        {children}
      </div>
    </div>
  );
}

export function Loading() {
  const { t } = useI18n();
  return (
    <Shell>
      <p className="gate-sub">{t("gate.loading")}</p>
    </Shell>
  );
}

export function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <Shell>
      <p className="gate-sub">{t("gate.errorTitle")}</p>
      <p className="gate-err">{message}</p>
      <button className="batch-btn gate-btn" onClick={onRetry}>
        {t("gate.retry")}
      </button>
    </Shell>
  );
}

export function SignIn() {
  const { t } = useI18n();
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
      <p className="gate-sub">{t("gate.signinSub")}</p>
      {state === "sent" ? (
        <p className="gate-ok">{t("gate.sent", { email })}</p>
      ) : (
        <form className="gate-form" onSubmit={submit}>
          <input
            className="gate-input"
            type="email"
            required
            autoFocus
            placeholder={t("gate.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="batch-btn gate-btn" disabled={state === "sending"}>
            {state === "sending" ? t("gate.sending") : t("gate.receiveLink")}
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
  const { t } = useI18n();
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
        {t("gate.connected")}
        {userEmail ? ` (${userEmail})` : ""} — {t("gate.noInstance")}
      </p>
      <form className="gate-form" onSubmit={submit}>
        <input
          className="gate-input"
          required
          placeholder={t("gate.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="gate-input"
          required
          placeholder={t("gate.domainPlaceholder")}
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        />
        <button className="batch-btn gate-btn" disabled={state === "creating"}>
          {state === "creating" ? t("gate.creating") : t("gate.createInstance")}
        </button>
        {state === "error" && <p className="gate-err">{error}</p>}
      </form>
      <button className="gate-link" onClick={onSignOut}>
        {t("gate.signoutLink")}
      </button>
    </Shell>
  );
}
