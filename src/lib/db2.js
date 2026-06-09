import { getSupabase } from "./supabase.js";

async function fetchTable(table, order = "created_at") {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from(table).select("*").order(order, { ascending: false });
  if (error) throw error;
  return data || [];
}
async function upsertRow(table, row) {
  const sb = getSupabase();
  if (!sb) throw new Error("Не е конфигурирана Supabase");
  const { data, error } = await sb.from(table).upsert(row, { onConflict: "id" }).select().single();
  if (error) throw error;
  return data;
}
async function deleteRow(table, id) {
  const sb = getSupabase();
  if (!sb) throw new Error("Не е конфигурирана Supabase");
  const { error } = await sb.from(table).delete().eq("id", id);
  if (error) throw error;
}

export const fetchExpenses       = () => fetchTable("expenses",       "created_at");
export const upsertExpense       = (r) => upsertRow("expenses",       r);
export const deleteExpense       = (id)=> deleteRow("expenses",       id);

export const fetchCashRegister   = () => fetchTable("cash_register",  "date");
export const upsertCashRegister  = (r) => upsertRow("cash_register",  r);

export const fetchAccessorySales = () => fetchTable("accessory_sales","created_at");
export const upsertAccessorySale = (r) => upsertRow("accessory_sales",r);
export const deleteAccessorySale = (id)=> deleteRow("accessory_sales",id);

export const fetchBuybacks       = () => fetchTable("buybacks",       "created_at");
export const upsertBuyback       = (r) => upsertRow("buybacks",       r);
export const deleteBuyback       = (id)=> deleteRow("buybacks",       id);

export const fetchPartsSales     = () => fetchTable("parts_sales",    "created_at");
export const upsertPartsSale     = (r) => upsertRow("parts_sales",    r);
export const deletePartsSale     = (id)=> deleteRow("parts_sales",    id);

export const fetchPhoneSales     = () => fetchTable("phone_sales",    "created_at");
export const upsertPhoneSale     = (r) => upsertRow("phone_sales",    r);
export const deletePhoneSale     = (id)=> deleteRow("phone_sales",    id);

export const fetchStockOrders    = () => fetchTable("stock_orders",   "created_at");
export const upsertStockOrder    = (r) => upsertRow("stock_orders",   r);
export const deleteStockOrder    = (id)=> deleteRow("stock_orders",   id);

export const fetchSupplierDebts  = () => fetchTable("supplier_debts", "created_at");
export const upsertSupplierDebt  = (r) => upsertRow("supplier_debts", r);
export const deleteSupplierDebt  = (id)=> deleteRow("supplier_debts", id);

export const fetchDismantle      = () => fetchTable("dismantle",      "created_at");
export const upsertDismantle     = (r) => upsertRow("dismantle",      r);
export const deleteDismantle     = (id)=> deleteRow("dismantle",      id);

// ── Trash ──────────────────────────────────────────────────────────────────────
export async function moveToTrash(tableName, record) {
  const sb = getSupabase();
  if (!sb) return;
  const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  await sb.from("trash").insert({
    table_name:  tableName,
    record_id:   record.id,
    record_data: record,
    expires_at:  expiresAt,
  });
}

export async function fetchTrash() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from("trash").select("*").order("deleted_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function restoreFromTrash(item) {
  const sb = getSupabase();
  if (!sb) throw new Error("Не е конфигурирана Supabase");
  const { table_name, record_data } = item;
  const { error } = await sb.from(table_name).upsert(record_data, { onConflict: "id" });
  if (error) throw error;
  await sb.from("trash").delete().eq("id", item.id);
}

export async function deleteFromTrash(id) {
  const sb = getSupabase();
  if (!sb) throw new Error("Не е конфигурирана Supabase");
  const { error } = await sb.from("trash").delete().eq("id", id);
  if (error) throw error;
}

export async function cleanExpiredTrash() {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("trash").delete().lt("expires_at", new Date().toISOString());
}
export async function fetchMonthlyExpenses() {
  const sb = getSupabase();
  const { data } = await sb.from("monthly_expenses").select("*").order("created_at", { ascending: false });
  return data || [];
}
