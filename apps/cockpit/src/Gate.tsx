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

type AuthMode = "signin" | "signup" | "magic" | "forgot";

export function SignIn() {
  const { t } = useI18n();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [sentMsg, setSentMsg] = useState("");
  const [error, setError] = useState("");

  const fail = (message: string) => {
    setError(message);
    setState("error");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase || !email) return;
    setState("busy");
    setError("");
    if (mode === "signin") {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) fail(err.message); // session OK → useCockpit bascule tout seul
    } else if (mode === "signup") {
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.href,
          data: displayName.trim() ? { display_name: displayName.trim() } : undefined,
        },
      });
      if (err) fail(err.message);
      else {
        setSentMsg(t("auth.signupSent", { email }));
        setState("sent");
      }
    } else if (mode === "magic") {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href },
      });
      if (err) fail(err.message);
      else {
        setSentMsg(t("gate.sent", { email }));
        setState("sent");
      }
    } else {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href,
      });
      if (err) fail(err.message);
      else {
        setSentMsg(t("auth.forgotSent", { email }));
        setState("sent");
      }
    }
  };

  const switchMode = (m: AuthMode) => {
    setMode(m);
    setState("idle");
    setError("");
  };

  const buttonLabel =
    mode === "signin"
      ? t("auth.signinBtn")
      : mode === "signup"
        ? t("auth.signupBtn")
        : mode === "magic"
          ? t("gate.receiveLink")
          : t("auth.forgotBtn");

  return (
    <Shell>
      <div className="auth-tabs">
        {(["signin", "signup", "magic"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`auth-tab${mode === m ? " on" : ""}`}
            onClick={() => switchMode(m)}
          >
            {t(`auth.tab${m === "signin" ? "Signin" : m === "signup" ? "Signup" : "Magic"}`)}
          </button>
        ))}
      </div>

      {mode === "magic" && <p className="gate-sub">{t("gate.signinSub")}</p>}
      {mode === "forgot" && (
        <button className="gate-link gate-back" type="button" onClick={() => switchMode("signin")}>
          {t("auth.back")}
        </button>
      )}

      {state === "sent" ? (
        <p className="gate-ok">{sentMsg}</p>
      ) : (
        <form className="gate-form" onSubmit={submit}>
          <input
            className="gate-input"
            type="email"
            required
            autoFocus
            autoComplete="email"
            placeholder={t("gate.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {mode === "signup" && (
            <input
              className="gate-input"
              placeholder={t("auth.displayName")}
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          )}
          {(mode === "signin" || mode === "signup") && (
            <input
              className="gate-input"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={t("auth.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
          <button className="batch-btn gate-btn" disabled={state === "busy"}>
            {state === "busy" ? t("gate.sending") : buttonLabel}
          </button>
          {state === "error" && <p className="gate-err">{error}</p>}
        </form>
      )}

      {mode === "signin" && state !== "sent" && (
        <button className="gate-link" type="button" onClick={() => switchMode("forgot")}>
          {t("auth.forgot")}
        </button>
      )}
    </Shell>
  );
}

/** Arrivée depuis le lien « mot de passe oublié » : choisir le nouveau. */
export function Recovery({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setState("busy");
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(err.message);
      setState("error");
    } else {
      onDone();
    }
  };

  return (
    <Shell>
      <p className="gate-sub">{t("auth.recoveryTitle")}</p>
      <form className="gate-form" onSubmit={submit}>
        <input
          className="gate-input"
          type="password"
          required
          autoFocus
          minLength={6}
          autoComplete="new-password"
          placeholder={t("auth.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="batch-btn gate-btn" disabled={state === "busy"}>
          {state === "busy" ? t("gate.sending") : t("auth.recoveryBtn")}
        </button>
        {state === "error" && <p className="gate-err">{error}</p>}
      </form>
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
