// Stockage des salles : Supabase en production (fonctions protégées par HM_SECRET), mémoire en local.
import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.SUPABASE_URL || "https://wympdgzjhsrmdkcpvouw.supabase.co";
export const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_KBs-rT5siZVy4mt3rObQVQ_vLXvdaBr";

function supabaseStore(secret) {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const call = async (fn, args) => {
    const { data, error } = await sb.rpc(fn, { p_secret: secret, ...args });
    if (error) throw new Error(`${fn} : ${error.message}`);
    return data;
  };
  return {
    get: (code) => call("hm_room_get", { p_code: code }), // { data, version } | null
    create: (code, data) => call("hm_room_create", { p_code: code, p_data: data }), // true | false (code déjà pris)
    put: (code, version, data) => call("hm_room_put", { p_code: code, p_version: version, p_data: data }), // nouvelle version | null (conflit)
  };
}

function memoryStore() {
  const rooms = new Map();
  const listeners = new Set();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  return {
    get: async (code) => (rooms.has(code) ? clone(rooms.get(code)) : null),
    create: async (code, data) => { if (rooms.has(code)) return false; rooms.set(code, { data: clone(data), version: 1 }); listeners.forEach((f) => f(code, 1)); return true; },
    put: async (code, version, data) => {
      const r = rooms.get(code);
      if (!r || r.version !== version) return null;
      rooms.set(code, { data: clone(data), version: version + 1 });
      listeners.forEach((f) => f(code, version + 1));
      return version + 1;
    },
    onChange: (f) => listeners.add(f),
  };
}

let store = null;
export function getStore() {
  if (store) return store;
  const secret = process.env.HM_SECRET;
  store = secret ? supabaseStore(secret) : memoryStore();
  store.kind = secret ? "supabase" : "memory";
  return store;
}
