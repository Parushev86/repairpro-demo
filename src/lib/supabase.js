import { createClient } from "@supabase/supabase-js";

let _supabase = null;

export function getSupabase() {
  if (_supabase) return _supabase;
  // Try localStorage first (from Settings modal)
  let url = localStorage.getItem("sb_url");
  let key = localStorage.getItem("sb_key");
  // Fallback to Vite env variables (set in Vercel dashboard)
  if (!url) url = import.meta.env.VITE_SUPABASE_URL;
  if (!key) key = import.meta.env.VITE_SUPABASE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key);
  return _supabase;
}

export function resetSupabase() {
  _supabase = null;
}

// ── Orders ────────────────────────────────────────────────────────────────────
export async function fetchOrders() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from("orders").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function upsertOrder(order) {
  const sb = getSupabase();
  if (!sb) throw new Error("Не е конфигурирана Supabase");
  const { data, error } = await sb.from("orders").upsert(order, { onConflict: "id" }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteOrder(id) {
  const sb = getSupabase();
  if (!sb) throw new Error("Не е конфигурирана Supabase");
  const { error } = await sb.from("orders").delete().eq("id", id);
  if (error) throw error;
}

// ── Inventory ─────────────────────────────────────────────────────────────────
export async function fetchInventory() {
  const sb = getSupabase();
  if (!sb) return [];
  // Зареждаме всички записи с пагинация (Supabase лимит е 1000)
  let all = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await sb.from("inventory")
      .select("*")
      .order("name")
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = [...all, ...data];
    if (data.length < pageSize) break;
    page++;
  }
  return all;
}

export async function upsertInventory(item) {
  const sb = getSupabase();
  if (!sb) throw new Error("Не е конфигурирана Supabase");
  const { data, error } = await sb.from("inventory").upsert(item, { onConflict: "id" }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteInventory(id) {
  const sb = getSupabase();
  if (!sb) throw new Error("Не е конфигурирана Supabase");
  const { error } = await sb.from("inventory").delete().eq("id", id);
  if (error) throw error;
}

// ── Technicians ───────────────────────────────────────────────────────────────
export async function fetchTechnicians() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from("technicians").select("*").order("name");
  if (error) throw error;
  return data || [];
}

export async function upsertTechnician(tech) {
  const sb = getSupabase();
  if (!sb) throw new Error("Не е конфигурирана Supabase");
  const { data, error } = await sb.from("technicians").upsert(tech, { onConflict: "id" }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTechnician(id) {
  const sb = getSupabase();
  if (!sb) throw new Error("Не е конфигурирана Supabase");
  const { error } = await sb.from("technicians").delete().eq("id", id);
  if (error) throw error;
}

// ── Realtime subscriptions ────────────────────────────────────────────────────
export function subscribeOrders(callback) {
  const sb = getSupabase();
  if (!sb) return null;
  return sb.channel("orders-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, callback)
    .subscribe();
}

export function subscribeInventory(callback) {
  const sb = getSupabase();
  if (!sb) return null;
  return sb.channel("inventory-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, callback)
    .subscribe();
}
