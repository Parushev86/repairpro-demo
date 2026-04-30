import { createClient } from "@supabase/supabase-js";

let _supabase = null;

export function getSupabase() {
  if (_supabase) return _supabase;
  const url  = localStorage.getItem("sb_url");
  const key  = localStorage.getItem("sb_key");
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
  const { data, error } = await sb.from("inventory").select("*").order("name");
  if (error) throw error;
  return data || [];
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
