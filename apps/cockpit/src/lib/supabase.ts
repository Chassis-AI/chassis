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

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const isLive = supabase !== null;
