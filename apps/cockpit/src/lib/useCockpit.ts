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
  type CockpitData,
} from "./data";

export type CockpitPhase = "loading" | "signin" | "no-instance" | "ready" | "error";

export interface CockpitState {
  phase: CockpitPhase;
  mode: "demo" | "live";
  data: CockpitData | null;
  userEmail: string | null;
  error: string | null;
  /** Marque le lot conforme comme appliqué (écrit en base en mode live). */
  applyBatch: (ids: string[]) => Promise<void>;
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
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setData(null);
        setPhase("signin");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Session établie → charger les données réelles.
  useEffect(() => {
    if (isLive && session) void reload();
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
    bootstrap,
    signOut,
    reload,
  };
}
