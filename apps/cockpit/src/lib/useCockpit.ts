/**
 * État global du cockpit : auth (magic link) + chargement des données.
 *
 * Machine d'états :
 *  demo                       — pas de .env → données seedées, pas d'auth
 *  loading                    — session ou données en cours de chargement
 *  signin                     — live, pas de session → écran magic link
 *  no-instance                — connecté, aucune instance → bootstrap
 *  ready                      — données affichables (démo ou live)
 *  error                      — erreur de chargement (live uniquement)
 */

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isLive, supabase } from "./supabase";
import {
  applyIntentions,
  createInstance,
  loadDemoData,
  loadLiveData,
  NoInstanceError,
  submitIntention,
  type CockpitData,
} from "./data";
import {
  depositPayload,
  depositRuleIds,
  depositTitle,
  judgeInBrowser,
  type DepositInput,
} from "./demoLoop";

export type CockpitPhase =
  | "loading"
  | "signin"
  | "recovery"
  | "no-instance"
  | "ready"
  | "error";

export interface CockpitState {
  phase: CockpitPhase;
  mode: "demo" | "live";
  data: CockpitData | null;
  userEmail: string | null;
  error: string | null;
  /** Marque le lot conforme comme appliqué (écrit en base en mode live). */
  applyBatch: (ids: string[]) => Promise<void>;
  /**
   * Dépose un dossier. Démo : jugé dans le navigateur, retourne l'id à
   * sélectionner. Live : inséré en file ('queued'), le daemon le juge —
   * retourne null et recharge (immédiatement puis après le verdict).
   */
  deposit: (input: DepositInput, categoryId: string, categoryLabel: string) => Promise<string | null>;
  /** Bootstrap : crée l'instance de l'utilisateur puis recharge. */
  bootstrap: (name: string, domain: string) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

export function useCockpit(): CockpitState {
  const [phase, setPhase] = useState<CockpitPhase>(isLive ? "loading" : "ready");
  const [data, setData] = useState<CockpitData | null>(isLive ? null : loadDemoData());
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isLive) {
      setData(loadDemoData());
      setPhase("ready");
      return;
    }
    setPhase("loading");
    try {
      setData(await loadLiveData());
      setPhase("ready");
      setError(null);
    } catch (err) {
      if (err instanceof NoInstanceError) {
        setPhase("no-instance");
      } else {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    }
  }, []);

  // Session magic link : état initial + abonnement aux changements.
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (!s) setPhase("signin");
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") {
        setPhase("recovery"); // arrivée depuis le lien « mot de passe oublié »
      } else if (!s) {
        setData(null);
        setPhase("signin");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Session établie → charger les données réelles (sauf en réinitialisation
  // de mot de passe, où l'écran Recovery doit rester affiché).
  useEffect(() => {
    if (isLive && session && phase !== "recovery") void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, reload]);

  const applyBatch = useCallback(
    async (ids: string[]) => {
      if (isLive) {
        await applyIntentions(ids);
        await reload();
      } else {
        // Démo : bascule locale, rien n'est persisté (et c'est affiché comme tel).
        setData((prev) =>
          prev
            ? {
                ...prev,
                intents: prev.intents.map((i) =>
                  ids.includes(i.id) ? { ...i, applied: true } : i,
                ),
              }
            : prev,
        );
      }
    },
    [reload],
  );

  const deposit = useCallback(
    async (input: DepositInput, categoryId: string, categoryLabel: string) => {
      if (!isLive) {
        const intent = await judgeInBrowser(input, categoryLabel);
        setData((prev) =>
          prev ? { ...prev, intents: [intent, ...prev.intents] } : prev,
        );
        return intent.id;
      }
      const instanceId = data?.instance.id;
      if (!instanceId) throw new Error("Instance inconnue.");
      await submitIntention({
        instanceId,
        categoryId,
        title: depositTitle(input),
        payload: depositPayload(input),
        ruleIds: depositRuleIds(input),
      });
      await reload(); // la ligne apparaît "en file"
      // Le daemon revendique la file toutes les ~2 s : on recharge après le verdict.
      setTimeout(() => void reload(), 4000);
      setTimeout(() => void reload(), 9000);
      return null;
    },
    [data, reload],
  );

  const bootstrap = useCallback(
    async (name: string, domain: string) => {
      await createInstance(name, domain);
      await reload();
    },
    [reload],
  );

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
  }, []);

  return {
    phase,
    mode: isLive ? "live" : "demo",
    data,
    userEmail: session?.user?.email ?? null,
    error,
    applyBatch,
    deposit,
    bootstrap,
    signOut,
    reload,
  };
}
