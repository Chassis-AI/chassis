/**
 * Client Supabase du cockpit.
 *
 * La bascule démo/réel se décide ici et nulle part ailleurs :
 * sans VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY, `supabase` est null
 * et tout le cockpit tourne en mode démo (données seedées, étiquetées).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** ?demo=1 force le mode démo (lien « voir la démo » de la landing),
 *  mémorisé pour la session ; ?demo=0 rebascule en réel. */
function demoRequested(): boolean {
  const param = new URLSearchParams(window.location.search).get("demo");
  if (param === "1") sessionStorage.setItem("chassis.demo", "1");
  if (param === "0") sessionStorage.removeItem("chassis.demo");
  return sessionStorage.getItem("chassis.demo") === "1";
}

export const supabase: SupabaseClient | null =
  url && anonKey && !demoRequested() ? createClient(url, anonKey) : null;

export const isLive = supabase !== null;
