// ЧАСТ 1
import { useState, useEffect, useCallback, useRef, memo } from "react";
import { getSupabase, resetSupabase, fetchOrders, fetchInventory, fetchTechnicians, upsertOrder, deleteOrder as dbDeleteOrder, upsertInventory, deleteInventory as dbDeleteInv, upsertTechnician, deleteTechnician as dbDeleteTech, subscribeOrders, subscribeInventory } from "./lib/supabase.js";
import { genId, today, STATUSES, STATUS_COLOR, STATUS_BG, DEVICE_TYPES, PROBLEMS, PROBLEMS_BY_DEVICE, CATEGORIES, MONTHS_BG, fmtDate, fmtMoney, fmtDatetime } from "./lib/constants.js";
import { printProtocol, printLabel, downloadProtocolTXT, printWarranty } from "./lib/print.js";
import MonthlyReport from "./MonthlyReport.jsx";
import { sendReadyEmail } from "./lib/email.js";
import { exportOrders, exportInventory, exportTechReport, exportFullReport, parseExcelFile, mapRowsToOrders, mapRowsToInventory } from "./lib/excel.js";
import { exportDailyReport } from "./lib/excel_daily.js";
import { fetchExpenses, upsertExpense, deleteExpense, fetchCashRegister, upsertCashRegister, fetchAccessorySales, upsertAccessorySale, deleteAccessorySale, fetchBuybacks, upsertBuyback, deleteBuyback, fetchPartsSales, upsertPartsSale, deletePartsSale, fetchPhoneSales, upsertPhoneSale, deletePhoneSale, fetchStockOrders, upsertStockOrder, deleteStockOrder, fetchSupplierDebts, upsertSupplierDebt, deleteSupplierDebt, moveToTrash, fetchTrash, restoreFromTrash, deleteFromTrash, cleanExpiredTrash, fetchDismantle, upsertDismantle, deleteDismantle } from "./lib/db2.js";
import { ExpensesTab, AccessorySalesTab, BuybacksTab, PartsSalesTab, PhoneSalesTab, StockOrdersTab, SupplierDebtsTab, DismantleTab } from "./modules.jsx";

const isElectron = typeof window !== "undefined" && !!window.electronAPI;

// ── Small reusable UI ──────────────────────────────────────────────────────────
const Btn = ({ color = "#38bdf8", bg, onClick, title, children, style = {}, disabled = false }) => (
  <button onClick={onClick} title={title} disabled={disabled} style={{
    background: bg || (color + "22"), color, border: "none", borderRadius: 7,
    padding: "6px 10px", fontSize: 13, display: "flex", alignItems: "center",
    gap: 5, fontWeight: 600, ...style,
  }}>{children}</button>
);

const PrimaryBtn = ({ onClick, children, color, disabled, style = {} }) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: color || "linear-gradient(135deg,#38bdf8,#0ea5e9)", color: "#fff",
    border: "none", borderRadius: 9, padding: "9px 18px", fontWeight: 700, fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
    display: "flex", alignItems: "center", gap: 6, ...style,
  }}>{children}</button>
);

const Field = ({ label, children, style = {} }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
    <label style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: .4 }}>{label}</label>
    {children}
  </div>
);

const Badge = ({ status }) => (
  <span style={{
    background: STATUS_BG[status] || "#1e293b",
    color: STATUS_COLOR[status] || "#94a3b8",
    padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
  }}>{status}</span>
);

const Card = ({ children, style = {} }) => (
  <div style={{ background: "var(--bg2)", borderRadius: 12, padding: 20, ...style }}>{children}</div>
);

const Notif = ({ notif }) => notif ? (
  <div style={{
    position: "fixed", top: 16, right: 16, zIndex: 9999,
    background: notif.type === "error" ? "#dc2626" : notif.type === "warn" ? "#d97706" : notif.type === "info" ? "#2563eb" : "#059669",
    color: "#fff", padding: "12px 18px", borderRadius: 10,
    boxShadow: "0 8px 32px rgba(0,0,0,.5)", fontSize: 13, fontWeight: 600,
    animation: "slideIn .25s ease", maxWidth: 380,
  }}>{notif.msg}</div>
) : null;

// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [tab, setTab] = useState("dashboard");
  const [orderModal, setOrderModal] = useState(null);
  const [invModal, setInvModal] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importModal, setImportModal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [notif, setNotif] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("Всички");
  const [filterDevice, setFilterDevice] = useState("Всички");
  const [settings, setSettings] = useState({});
  const [realtimeOn, setRealtimeOn] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [cashReg, setCashReg] = useState([]);
  const [accSales, setAccSales] = useState([]);
  const [buybacks, setBuybacks] = useState([]);
  const [partsSales, setPartsSales] = useState([]);
  const [phoneSales, setPhoneSales] = useState([]);
  const [stockOrders, setStockOrders] = useState([]);
  const [supplierDebts, setSupplierDebts] = useState([]);
  const [trash, setTrash] = useState([]);
  const [dismantleRecs, setDismantleRecs] = useState([]);
  const subsRef = useRef([]);

  const notify = useCallback((msg, type = "success", dur = 3500) => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), dur);
  }, []);

  // ── Load settings ──────────────────────────────────────────────────────────
  useEffect(() => {
    const loadSettings = async () => {
      let s = {};
      if (isElectron) {
        try { s = await window.electronAPI.getSettings() || {}; } catch (e) { }
      }
      if (!s.sb_url || !s.sb_key) {
        try {
          const ls = JSON.parse(localStorage.getItem("rp_settings") || "{}");
          if (ls.sb_url) s = { ...ls, ...s };
        } catch (e) { }
      }
      if (!isElectron && (!s.sb_url || !s.sb_key)) {
        try { s = JSON.parse(localStorage.getItem("rp_settings") || "{}"); } catch (e) { }
      }
      setSettings(s);
      if (s.sb_url && s.sb_key) {
        localStorage.setItem("sb_url", s.sb_url);
        localStorage.setItem("sb_key", s.sb_key);
        localStorage.setItem("rp_settings", JSON.stringify(s));
        loadData(true);
      } else {
        setSettingsOpen(true);
      }
    };
    loadSettings();
  }, []);

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [o, inv, tech, exp, cash, acc, bb, ps, phs, so, sd, tr, dis] = await Promise.all([
        fetchOrders(), fetchInventory(), fetchTechnicians(),
        fetchExpenses(), fetchCashRegister(), fetchAccessorySales(),
        fetchBuybacks(), fetchPartsSales(), fetchPhoneSales(),
        fetchStockOrders(), fetchSupplierDebts(), fetchTrash(),
        fetchDismantle(),
      ]);
      setOrders(o);
      setTechnicians(tech);
      setExpenses(exp);
      setCashReg(cash);
      setAccSales(acc);
      setBuybacks(bb);
      setPartsSales(ps);
      setPhoneSales(phs);
      setStockOrders(so);
      setSupplierDebts(sd);
      setTrash(tr);
      setDismantleRecs(dis);

      // 🧹 Премахване на дубликати в склада (по име, case-insensitive)
      const seen = new Set();
      const uniqueInv = inv.filter(item => {
        const key = (item.name || "").trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const duplicateCount = inv.length - uniqueInv.length;
      if (duplicateCount > 0) {
        inv.forEach(item => {
          const key = (item.name || "").trim().toLowerCase();
          if (key && !uniqueInv.find(u => (u.name || "").trim().toLowerCase() === key)) {
            dbDeleteInv(item.id).catch(() => { });
          }
        });
        
        setInventory(uniqueInv);
      } else {
        setInventory(inv);
      }

      cleanExpiredTrash();
      setConnected(true);
    } catch (e) {
      notify("❌ Грешка при зареждане: " + e.message, "error");
      setConnected(false);
    }
    if (showLoading) setLoading(false);
  };

  // ── Realtime subscriptions ─────────────────────────────────────────────────
  useEffect(() => {
    if (!connected) return;
    subsRef.current.forEach(s => s?.unsubscribe?.());
    subsRef.current = [];

    const orderSub = subscribeOrders((payload) => {
      setOrders(prev => {
        if (payload.eventType === "INSERT") return [payload.new, ...prev];
        if (payload.eventType === "UPDATE") return prev.map(o => o.id === payload.new.id ? payload.new : o);
        if (payload.eventType === "DELETE") return prev.filter(o => o.id !== payload.old.id);
        return prev;
      });
    });
    const invSub = subscribeInventory((payload) => {
      setInventory(prev => {
        if (payload.eventType === "INSERT") return [...prev, payload.new];
        if (payload.eventType === "UPDATE") return prev.map(i => i.id === payload.new.id ? payload.new : i);
        if (payload.eventType === "DELETE") return prev.filter(i => i.id !== payload.old.id);
        return prev;
      });
    });

    if (orderSub && invSub) {
      subsRef.current = [orderSub, invSub];
      setRealtimeOn(true);
    }
    return () => { subsRef.current.forEach(s => s?.unsubscribe?.()); };
  }, [connected]);

  // ── Save settings ──────────────────────────────────────────────────────────
  const saveSettings = async (s) => {
    setSettings(s);
    if (isElectron) await window.electronAPI.setSettings(s);
    localStorage.setItem("rp_settings", JSON.stringify(s));
    localStorage.setItem("sb_url", s.sb_url || "");
    localStorage.setItem("sb_key", s.sb_key || "");
    resetSupabase();
    setSettingsOpen(false);
    notify("Настройките са запазени ✓");
    if (s.sb_url && s.sb_key) loadData();
  };

  // ── Import from Excel ─────────────────────────────────────────────────────
  const handleImport = async (rows, type) => {
    setSyncing(true);
    let ok = 0, fail = 0;
    try {
      if (type === "orders") {
        for (const row of rows) {
          try { await upsertOrder(row); ok++; } catch (e) { fail++; }
        }
        await loadData(false);
        notify(`✅ Импортирани ${ok} поръчки${fail > 0 ? " | ❌ " + fail + " грешки" : ""}`, ok > 0 ? "success" : "error");
      } else {
        for (const row of rows) {
          try { await upsertInventory(row); ok++; } catch (e) { fail++; }
        }
        await loadData(false);
        notify(`✅ Импортирани ${ok} артикула${fail > 0 ? " | ❌ " + fail + " грешки" : ""}`, ok > 0 ? "success" : "error");
      }
    } catch (e) { notify("❌ " + e.message, "error"); }
    setSyncing(false);
    setImportModal(false);
  };

  // ── Save order ─────────────────────────────────────────────────────────────
  const saveOrder = async (ord) => {
    if (syncing) return;
    const isNew = !ord.id;
    const cleaned = {
      ...ord,
      date_in: ord.date_in || today(),
      date_out: ord.date_out || null,
      price: ord.price || 0,
      deposit: ord.deposit || 0,
      labor_price: ord.labor_price || 0,
      total_price: ord.total_price || 0,
      external_service_price: ord.external_service_price || 0,
      external_service_note: ord.external_service_note || "",
    };
    const final = isNew ? { ...cleaned, id: genId() } : cleaned;
    setSyncing(true);
    try {
      const saved = await upsertOrder(final);
      if (!isNew) {
        const prev = orders.find(o => o.id === final.id);
        if (prev?.status !== "Готов" && final.status === "Готов" && final.email && !final.email_sent) {
          const res = await sendReadyEmail(final, settings);
          if (res.ok) {
            await upsertOrder({ ...saved, email_sent: true });
            notify(`📧 Имейл изпратен до ${final.client_name}!`, "info");
          }
        }
      }
      if (!realtimeOn) {
        if (isNew) setOrders(p => [saved, ...p]);
        else setOrders(p => p.map(o => o.id === saved.id ? saved : o));
      }
      notify(isNew ? "✅ Поръчката е добавена" : "✅ Поръчката е обновена");
      setOrderModal(null);
    } catch (e) {
      notify("❌ " + e.message, "error");
    }
    setSyncing(false);
  };

  const handleDeleteOrder = async (id) => {
    setSyncing(true);
    try {
      const ord = orders.find(o => o.id === id);
      if (ord) await moveToTrash("orders", ord);
      await dbDeleteOrder(id);
      if (!realtimeOn) setOrders(p => p.filter(o => o.id !== id));
      setTrash(p => [{ table_name: "orders", record_id: id, record_data: ord, deleted_at: new Date().toISOString(), expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() }, ...p]);
      notify("🗑️ Преместено в Кошче (5 дни)", "warn");
    } catch (e) { notify("❌ " + e.message, "error"); }
    setSyncing(false);
  };

  // ── Save inventory ─────────────────────────────────────────────────────────
  const saveInv = async (item) => {
    setSyncing(true);
    try {
      // ⛔ Проверка за дубликат по име (case-insensitive)
      const duplicate = inventory.find(
        i => i.name?.trim().toLowerCase() === item.name?.trim().toLowerCase() && i.id !== item.id
      );
      if (duplicate) {
        notify(`❌ Артикул "${item.name}" вече съществува в склада!`, "error");
        setSyncing(false);
        return;
      }

      if (Number(item.quantity) === 0 && item.id) {
        const confirmed = confirm(`Наличността е 0. Изтрий "${item.name}" от склада?`);
        if (confirmed) {
          await dbDeleteInv(item.id);
          setInventory(p => p.filter(i => i.id !== item.id));
          notify(`🗑️ "${item.name}" е изтрит (наличност 0)`, "warn");
          setInvModal(null);
          setSyncing(false);
          return;
        }
      }
      const saved = await upsertInventory(item);
      if (!realtimeOn) {
        if (!item.id) setInventory(p => [saved, ...p]);
        else setInventory(p => p.map(i => i.id === saved.id ? saved : i));
      }
      if (item.payment_status === "Не е платен") {
        try {
          const debt = {
            date_ordered: today(),
            date_arrived: null,
            supplier: item.supplier || "Неизвестен",
            part_name: item.name,
            category: item.category || "",
            model: "",
            quantity: Number(item.quantity) || 1,
            cost_price: Number(item.cost) || 0,
            total_amount: (Number(item.cost) || 0) * (Number(item.quantity) || 1),
            is_paid: false,
            paid_date: null,
            payment_method: null,
            notes: item.supplier_note || "",
          };
          const savedDebt = await upsertSupplierDebt(debt);
          setSupplierDebts(p => [savedDebt, ...p]);
          notify("✅ Добавен в склада + в Задължения!", "warn");
        } catch (e) {
          notify("⚠️ Склад ОК, но грешка Задължения: " + e.message, "warn");
        }
      }
      else if (item.payment_status === "Платен" && item.payment_method === "Платена от каса") {
        try {
          const totalCost = (Number(item.cost) || 0) * (Number(item.quantity) || 1);
          const expense = {
            date: today(),
            description: `Закупена стока: ${item.name}`,
            amount: totalCost,
            category: "Части",
            paid_to: item.supplier || "",
            notes: `Себестойност: €${Number(item.cost).toFixed(2)} × ${item.quantity} бр. — платено от каса`,
          };
          const savedExp = await upsertExpense(expense);
          setExpenses(p => [savedExp, ...p]);
          notify("✅ Добавен в склада + разход от каса €" + totalCost.toFixed(2), "info");
        } catch (e) {
          notify("⚠️ Склад ОК, но грешка Разходи: " + e.message, "warn");
        }
      } else {
        notify(item.id ? "✅ Артикулът е обновен" : "✅ Артикулът е добавен");
      }
      setInvModal(null);
    } catch (e) { notify("❌ " + e.message, "error"); }
    setSyncing(false);
  };

  const handleDeleteInv = async (id) => {
    setSyncing(true);
    try {
      const item = inventory.find(i => i.id === id);
      if (item) await moveToTrash("inventory", item);
      await dbDeleteInv(id);
      if (!realtimeOn) setInventory(p => p.filter(i => i.id !== id));
      setTrash(p => [{ table_name: "inventory", record_id: id, record_data: item, deleted_at: new Date().toISOString(), expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() }, ...p]);
      notify("🗑️ Преместено в Кошче (5 дни)", "warn");
    } catch (e) { notify("❌ " + e.message, "error"); }
    setSyncing(false);
  };

  // ── Save technician ────────────────────────────────────────────────────────
  const saveTech = async (tech) => {
    try {
      const saved = await upsertTechnician(tech);
      if (!tech.id) setTechnicians(p => [...p, saved]);
      else setTechnicians(p => p.map(t => t.id === saved.id ? saved : t));
      notify("✅ Техникът е запазен");
    } catch (e) { notify("❌ " + e.message, "error"); }
  };

  const handleDeleteTech = async (id) => {
    if (orders.some(o => o.technician_id === id)) { notify("Техникът има поръчки!", "warn"); return; }
    try {
      await dbDeleteTech(id);
      setTechnicians(p => p.filter(t => t.id !== id));
      notify("Техникът е премахнат", "error");
    } catch (e) { notify("❌ " + e.message, "error"); }
  };

  // ── Current user & role ──────────────────────────────────────────────────────
  const currentUser = (() => { try { return JSON.parse(sessionStorage.getItem("rp_user") || "{}"); } catch { return {}; } })();
  const isAdmin = currentUser.role === "Администратор" || currentUser.role === "admin";
  const ADMIN_TABS = ["dashboard", "reports", "technicians", "daily", "users", "trash"];
  useEffect(() => {
    if (!isAdmin && ADMIN_TABS.includes(tab)) setTab("orders");
  }, [isAdmin, tab]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const lowStock = inventory.filter(i => Number(i.quantity) <= Number(i.min_qty));
  const readyOrders = orders.filter(o => o.status === "Готов");
  const activeOrders = orders.filter(o => !["Издаден", "Отказан"].includes(o.status));

  const filteredOrders = orders.filter(o => {
    const q = search.toLowerCase();
    const ok = !q || [o.id, o.client_name, o.phone, o.email, o.problem, o.brand, o.model, o.technician, o.serial_number]
      .some(f => (f || "").toLowerCase().includes(q));
    return ok
      && (filterStatus === "Всички" || o.status === filterStatus)
      && (filterDevice === "Всички" || o.device_type === filterDevice);
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const auth = sessionStorage.getItem("rp_auth");
    if (auth === "1") setLoggedIn(true);
  }, []);

  if (!loggedIn) return <LoginScreen onLogin={() => { sessionStorage.setItem("rp_auth", "1"); setLoggedIn(true); }} />;

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 48 }}>🔧</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#38bdf8" }}>RepairPro</div>
      <div style={{ color: "#64748b" }}>Зареждане...</div>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Notif notif={notif} />

      {/* ── SIDEBAR ── */}
      <Sidebar tab={tab} setTab={(t) => { setTab(t); setSidebarOpen(false); }} readyOrders={readyOrders} lowStock={lowStock}
        activeOrders={activeOrders} orders={orders} connected={connected} realtimeOn={realtimeOn}
        syncing={syncing} onSettings={() => setSettingsOpen(true)} onRefresh={() => loadData(false)}
        onNewOrder={() => setOrderModal("new")} trash={trash} isAdmin={isAdmin} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
        dismantleCount={dismantleRecs.filter(r => r.status === "Чака разглобяване" || r.status === "В процес").length} />

      {/* ── MAIN ── */}
      <main style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        <div className="mobile-topbar" style={{ display: "none", background: "#0a1628", padding: "10px 16px", borderBottom: "1px solid #1e293b", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <button onClick={() => setSidebarOpen(p => !p)} style={{ background: "#1e293b", border: "none", color: "#94a3b8", borderRadius: 8, width: 36, height: 36, cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>☰</button>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#38bdf8" }}>🔧 RepairPro</span>
        </div>
        {sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 98 }} />}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {tab === "dashboard" && isAdmin && <Dashboard orders={orders} lowStock={lowStock} activeOrders={activeOrders} readyOrders={readyOrders} technicians={technicians} onNewOrder={() => setOrderModal("new")} onExport={() => exportFullReport(orders, inventory, technicians)} notify={notify} />}
          {tab === "dashboard" && !isAdmin && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 16 }}><div style={{ fontSize: 48 }}>🔒</div><div style={{ fontSize: 18, color: "#64748b" }}>Нямаш достъп до тази страница</div></div>}
          {tab === "orders" && <OrdersTab orders={filteredOrders} allOrders={orders} search={search} setSearch={setSearch} filterStatus={filterStatus} setFilterStatus={setFilterStatus} filterDevice={filterDevice} setFilterDevice={setFilterDevice} onNew={() => setOrderModal("new")} onEdit={setOrderModal} onDelete={handleDeleteOrder} onPrint={printProtocol} onLabel={printLabel} onDownloadTXT={downloadProtocolTXT} onWarranty={printWarranty} onExport={() => exportOrders(orders)} onImport={() => setImportModal("orders")} inventory={inventory} setInventory={setInventory} upsertOrder={upsertOrder} />}
          {tab === "inventory" && <InventoryTab inventory={inventory} lowStock={lowStock} onNew={() => setInvModal({})} onEdit={setInvModal} onDelete={handleDeleteInv} onExport={() => exportInventory(inventory)} onImport={() => setImportModal("inventory")} />}
          {tab === "reports" && isAdmin && <ReportsTab orders={orders} inventory={inventory} technicians={technicians} accSales={accSales} onExport={(t) => { if (t === "tech") exportTechReport(technicians, orders); else exportFullReport(orders, inventory, technicians); }} />}
          {tab === "technicians" && isAdmin && <TechniciansTab technicians={technicians} orders={orders} onSave={saveTech} onDelete={handleDeleteTech} onExport={() => exportTechReport(technicians, orders)} />}
          {tab === "daily" && isAdmin && <DailyReport orders={orders} inventory={inventory} expenses={expenses} accSales={accSales} partsSales={partsSales} phoneSales={phoneSales} cashReg={cashReg} />}
          {tab === "calculator" && <Calculator />}
          {tab === "pricing" && <PricingTab />}
          {tab === "expenses" && <ExpensesTab
  expenses={expenses} cashRegister={cashReg}
  orders={orders} accSales={accSales} partsSales={partsSales} phoneSales={phoneSales}
  onSaveExpense={async r => {
    const s = await upsertExpense(r);
    if (!r.id) setExpenses(p => [s, ...p]);
    else setExpenses(p => p.map(e => e.id === s.id ? s : e));
    notify("✅ Разходът е запазен");
  }}
  onDeleteExpense={async id => {
    const r = expenses.find(e => e.id === id);
    if (r) await moveToTrash("expenses", r);
    await deleteExpense(id);
    setExpenses(p => p.filter(e => e.id !== id));
    setTrash(p => [{ table_name: "expenses", record_id: id, record_data: r, id: crypto.randomUUID(), deleted_at: new Date().toISOString(), expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() }, ...p]);
    notify("🗑️ В кошчето", "warn");
  }}
  onSaveCash={async r => {
    const s = await upsertCashRegister(r);
    if (!r.id) setCashReg(p => [s, ...p]);
    else setCashReg(p => p.map(c => c.date === s.date ? s : c));
  }}
  notify={notify}
/>}
          {tab === "accsales" && <AccessorySalesTab
            sales={accSales} inventory={inventory} technicians={technicians}
            onSave={async (r, orig) => { const s = await upsertAccessorySale(r); if (!orig?.id) setAccSales(p => [s, ...p]); else setAccSales(p => p.map(x => x.id === s.id ? s : x)); if (!orig?.id && r.inventory_id) { const inv = inventory.find(i => i.id === r.inventory_id); if (inv) { const nq = Number(inv.quantity) - Number(r.quantity || 1); if (nq <= 0) { await dbDeleteInv(inv.id); setInventory(p => p.filter(i => i.id !== inv.id)); } else { const upd = await upsertInventory({ ...inv, quantity: nq }); setInventory(p => p.map(i => i.id === upd.id ? upd : i)); } } } notify("✅ Продажбата е записана"); }}
            onDelete={async id => { const r = accSales.find(x => x.id === id); if (r) await moveToTrash("accessory_sales", r); await deleteAccessorySale(id); setAccSales(p => p.filter(x => x.id !== id)); setTrash(p => [{ table_name: "accessory_sales", record_id: id, record_data: r, id: crypto.randomUUID(), deleted_at: new Date().toISOString(), expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() }, ...p]); notify("🗑️ В кошчето", "warn"); }}
            onUpdateInventory={setInventory}
            notify={notify}
          />}
          {tab === "buybacks" && <BuybacksTab
            buybacks={buybacks} inventory={inventory}
            onSave={async r => { const s = await upsertBuyback(r); if (!r.id) setBuybacks(p => [s, ...p]); else setBuybacks(p => p.map(x => x.id === s.id ? s : x)); notify("✅ Записът е запазен"); }}
            onDelete={async id => { const r = buybacks.find(x => x.id === id); if (r) await moveToTrash("buybacks", r); await deleteBuyback(id); setBuybacks(p => p.filter(x => x.id !== id)); setTrash(p => [{ table_name: "buybacks", record_id: id, record_data: r, id: crypto.randomUUID(), deleted_at: new Date().toISOString(), expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() }, ...p]); notify("🗑️ В кошчето", "warn"); }}
            onAddToInventory={async (b, target) => {
  if (target === "inventory") {
    // Заприхождаване в Склад (категория "Телефони")
    const item = {
      name: `${b.brand} ${b.model}`,
      category: "Телефони",
      quantity: 1, min_qty: 0,
      price: Number(b.price || 0),
      cost: Number(b.price || 0),
      supplier: "Изкупуване",
      notes: `IMEI: ${b.imei || "—"}`,
      phone_brand: b.brand,
      phone_model: b.model,
      phone_color: b.color || "",
      phone_imei: b.imei || "",
    };
    const saved = await upsertInventory(item);
    setInventory(p => [...p, saved]);
    await upsertBuyback({ ...b, added_to_stock: true, inventory_id: saved.id });
    setBuybacks(p => p.map(x => x.id === b.id ? { ...x, added_to_stock: true } : x));
    notify("📦 Заприходен в склада ✓");
  } else if (target === "dismantle") {
    // Заприхождаване за разглобяване
    const record = {
      date: today(),
      brand: b.brand || "",
      model: b.model || "",
      imei: b.imei || "",
      color: b.color || "",
      storage: "",
      purchase_price: Number(b.price || 0),
      status: "Чака разглобяване",
      parts_status: {},
      custom_parts: [],
      notes: `Изкупен от: ${b.seller_name || ""}`,
      photos: [],
    };
    const saved = await upsertDismantle(record);
    setDismantleRecs(p => [saved, ...p]);
    await upsertBuyback({ ...b, added_to_stock: true });
    setBuybacks(p => p.map(x => x.id === b.id ? { ...x, added_to_stock: true } : x));
    notify("🔨 Изпратен за разглобяване ✓");
  }
}}
            notify={notify}
          />}
          {tab === "dismantle" && <DismantleTab
            records={dismantleRecs}
            onSave={async r => {
              try {
                const { id, date, brand, model, imei, color, storage, purchase_price, status, parts_status, custom_parts, notes } = r;
                const toSave = {
                  date, brand, model, imei: imei || null, color: color || null, storage: storage || null,
                  purchase_price: Number(purchase_price || 0), status: status || "Чака разглобяване",
                  parts_status: parts_status || {}, custom_parts: custom_parts || [], notes: notes || null,
                  photos: [],
                };
                if (id) toSave.id = id;
                const saved = await upsertDismantle(toSave);
                const withPhotos = { ...saved, photos: r.photos || [] };
                if (!id) setDismantleRecs(p => [withPhotos, ...p]);
                else setDismantleRecs(p => p.map(x => x.id === saved.id ? withPhotos : x));
                notify("✅ Записът е запазен");
              } catch (e) { notify("❌ " + e.message, "error"); }
            }}
            onDelete={async id => {
              try {
                await deleteDismantle(id);
                setDismantleRecs(p => p.filter(x => x.id !== id));
                notify("🗑️ Изтрит", "warn");
              } catch (e) { notify("❌ " + e.message, "error"); }
            }}
            onAddPartToInventory={async r => {
              const PARTS_MAP = { display: "Дисплей", back_cover: "Заден капак", rear_camera: "Задна камера", power_block: "Блок захранване", frame: "Рамка / Среда", battery: "Батерия", front_camera: "Предна камера", mainboard: "Дънна платка", speaker: "Слушалка", sim_holder: "Сим държач", main_flex: "Главен лентов кабел", button_flex: "Лентов кабел бутони" };
              const customMap = Object.fromEntries((r.custom_parts || []).map(n => ["custom_" + n, n]));
              const allMap = { ...PARTS_MAP, ...customMap };
              const parts = r.parts_status || {};
              let added = 0;
              for (const [key, label] of Object.entries(allMap)) {
                if (parts[key] === "Работи") {
                  const item = { name: label + " " + r.brand + " " + r.model, category: "За разглобяване", quantity: 1, min_qty: 0, price: 0, cost: 0, supplier: "Разглобяване", notes: "IMEI: " + (r.imei || "—"), payment_status: "Платен", payment_method: "В брой" };
                  try { const saved = await upsertInventory(item); setInventory(p => [...p, saved]); added++; } catch (e) { console.warn(e); }
                }
              }
              try {
                const { id, date, brand, model, imei, color, storage, purchase_price, parts_status, custom_parts, notes } = r;
                const upd = await upsertDismantle({
                  id, date, brand, model, imei: imei || null, color: color || null, storage: storage || null,
                  purchase_price: Number(purchase_price || 0), status: "Разглобен",
                  parts_status: parts_status || {}, custom_parts: custom_parts || [], notes: notes || null, photos: []
                });
                setDismantleRecs(p => p.map(x => x.id === r.id ? { ...upd, photos: r.photos || [] } : x));
              } catch (e) { console.warn(e); }
              notify("📦 " + added + " части заприходени в Склада ✓");
            }}
            notify={notify}
          />}
          {tab === "partssales" && <PartsSalesTab
            sales={partsSales} inventory={inventory}
            onSave={async r => {
              try {
                const { items: _items, ...rest } = r;
                const clean = {
                  ...rest,
                  date_arrived: r.date_arrived || null,
                  tracking_number: r.tracking_number || null,
                  buyer_name: r.buyer_name || null,
                  buyer_phone: r.buyer_phone || null,
                  buyer_city: r.buyer_city || null,
                  buyer_address: r.buyer_address || null,
                  delivery_type: r.delivery_type || null,
                  notes: r.notes || null,
                  inventory_id: r.inventory_id || null,
                  cost_price: Number(r.cost_price || 0),
                  sale_price: Number(r.sale_price || 0),
                  quantity: Number(r.quantity || 1),
                };
                const s = await upsertPartsSale(clean);
                if (!r.id) {
                  setPartsSales(p => [s, ...p]);
                  const itemsToDeduct = r.items && r.items.length > 0
                    ? r.items
                    : r.inventory_id ? [{ inv_id: r.inventory_id, qty: Number(r.quantity || 1) }] : [];
                  for (const item of itemsToDeduct) {
                    const invId = item.inv_id || item.inventory_id;
                    if (!invId) continue;
                    const inv = inventory.find(i => i.id === invId);
                    if (inv) {
                      const nq = Number(inv.quantity) - Number(item.qty || item.quantity || 1);
                      if (nq <= 0) {
                        await dbDeleteInv(inv.id);
                        setInventory(p => p.filter(i => i.id !== inv.id));
                      } else {
                        const upd = await upsertInventory({ ...inv, quantity: nq });
                        setInventory(p => p.map(i => i.id === upd.id ? upd : i));
                      }
                    }
                  }
                } else {
                  setPartsSales(p => p.map(x => x.id === s.id ? s : x));
                }
                notify("✅ Продажбата е записана");
              } catch (e) { notify("❌ Грешка: " + e.message, "error"); }
            }}
            onDelete={async id => { const r = partsSales.find(x => x.id === id); if (r) await moveToTrash("parts_sales", r); await deletePartsSale(id); setPartsSales(p => p.filter(x => x.id !== id)); setTrash(p => [{ table_name: "parts_sales", record_id: id, record_data: r, id: crypto.randomUUID(), deleted_at: new Date().toISOString(), expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() }, ...p]); notify("🗑️ В кошчето", "warn"); }}
            onUpdateInventory={setInventory}
          />}
          {tab === "stockorders" && <StockOrdersTab
            orders={stockOrders}
            onSave={async r => { const s = await upsertStockOrder(r); if (!r.id) setStockOrders(p => [s, ...p]); else setStockOrders(p => p.map(x => x.id === s.id ? s : x)); notify("✅ Поръчката е запазена"); }}
            onDelete={async id => { const r = stockOrders.find(x => x.id === id); if (r) await moveToTrash("stock_orders", r); await deleteStockOrder(id); setStockOrders(p => p.filter(x => x.id !== id)); setTrash(p => [{ table_name: "stock_orders", record_id: id, record_data: r, id: crypto.randomUUID(), deleted_at: new Date().toISOString(), expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() }, ...p]); notify("🗑️ В кошчето", "warn"); }}
            notify={notify}
          />}
          {tab === "monthly" && isAdmin && <MonthlyReport
            getSupabase={getSupabase}
            orders={orders}
            expenses={expenses}
            accSales={accSales}
            partsSales={partsSales}
            phoneSales={phoneSales}
            cashReg={cashReg}
          />}
          {tab === "users" && <UsersTab />}
          {tab === "trash" && <TrashTab
            trash={trash}
            onRestore={async item => {
              try {
                await restoreFromTrash(item);
                setTrash(p => p.filter(t => t.id !== item.id));
                await loadData(false);
                notify("✅ Записът е възстановен!");
              } catch (e) { notify("❌ " + e.message, "error"); }
            }}
            onDelete={async id => {
              if (!confirm("Изтрий завинаги?")) return;
              await deleteFromTrash(id);
              setTrash(p => p.filter(t => t.id !== id));
              notify("Изтрито завинаги", "error");
            }}
          />}
          {tab === "debts" && <SupplierDebtsTab
            debts={supplierDebts}
            onSave={async r => { const s = await upsertSupplierDebt(r); if (!r.id) setSupplierDebts(p => [s, ...p]); else setSupplierDebts(p => p.map(x => x.id === s.id ? s : x)); notify("✅ Записът е запазен"); }}
            onDelete={async id => { const r = supplierDebts.find(x => x.id === id); if (r) await moveToTrash("supplier_debts", r); await deleteSupplierDebt(id); setSupplierDebts(p => p.filter(x => x.id !== id)); setTrash(p => [{ table_name: "supplier_debts", record_id: id, record_data: r, id: crypto.randomUUID(), deleted_at: new Date().toISOString(), expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() }, ...p]); notify("🗑️ В кошчето", "warn"); }}
            notify={notify}
          />}
          {tab === "phonesales" && <PhoneSalesTab
            sales={phoneSales} inventory={inventory}
            onSave={async r => {
              try {
                const { _inv_id, ...rClean } = r;
                const clean = {
                  ...rClean,
                  warranty_amount: r.warranty_amount || null,
                  warranty_unit: r.warranty_unit || null,
                  buyer_name: r.buyer_name || null,
                  buyer_phone: r.buyer_phone || null,
                  notes: r.notes || null,
                  serial_number: r.serial_number || null,
                  imei: r.imei || null,
                  color: r.color || null,
                  storage: r.storage || null,
                  cost_price: Number(r.cost_price || 0),
                  sale_price: Number(r.sale_price || 0),
                  warranty_days: Number(r.warranty_days || 30),
                };
                const s = await upsertPhoneSale(clean);
                if (!r.id) {
                  setPhoneSales(p => [s, ...p]);
                  if (_inv_id) {
                    const invItem = inventory.find(i => i.id === _inv_id);
                    if (invItem) {
                      const newQty = Number(invItem.quantity) - 1;
                      if (newQty <= 0) {
                        await dbDeleteInv(invItem.id);
                        setInventory(p => p.filter(i => i.id !== invItem.id));
                      } else {
                        const upd = await upsertInventory({ ...invItem, quantity: newQty });
                        setInventory(p => p.map(i => i.id === upd.id ? upd : i));
                      }
                    }
                  }
                } else {
                  setPhoneSales(p => p.map(x => x.id === s.id ? s : x));
                }
                notify("✅ Продажбата е записана");
              } catch (e) { notify("❌ Грешка: " + e.message, "error"); }
            }}
            onDelete={async id => { const r = phoneSales.find(x => x.id === id); if (r) await moveToTrash("phone_sales", r); await deletePhoneSale(id); setPhoneSales(p => p.filter(x => x.id !== id)); setTrash(p => [{ table_name: "phone_sales", record_id: id, record_data: r, id: crypto.randomUUID(), deleted_at: new Date().toISOString(), expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() }, ...p]); notify("🗑️ В кошчето", "warn"); }}
            onWarranty={printWarranty}
          />}
        </div>

        {/* ── Modals ── */}
        {orderModal !== null && <OrderModal order={orderModal === "new" ? null : orderModal} technicians={technicians} inventory={inventory} setInventory={setInventory} onSave={saveOrder} onClose={() => setOrderModal(null)} syncing={syncing} />}
        {invModal !== null && <InvModal item={invModal} allInventory={inventory} onSave={saveInv} onClose={() => setInvModal(null)} syncing={syncing} />}
        {importModal && <ImportModal type={importModal} onImport={handleImport} onClose={() => setImportModal(false)} syncing={syncing} />}
        {settingsOpen && <SettingsModal settings={settings} onSave={saveSettings} onClose={() => setSettingsOpen(false)} connected={connected} />}
      </main>
    </div>
  );
}
// КРАЙ НА ЧАСТ 1
// ЧАСТ 2
// ═══════════════════════════════ SIDEBAR ══════════════════════════════════════
function Sidebar({ tab, setTab, readyOrders, lowStock, activeOrders, orders, connected, realtimeOn, syncing, onSettings, onRefresh, onNewOrder, trash = [], isAdmin = false, sidebarOpen = false, setSidebarOpen = () => { }, dismantleCount = 0 }) {
  const totalRev = orders.filter(o => o.status === "Издаден").reduce((s, o) => s + Number(o.price || 0), 0);
  return (
    <>
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 99, display: "none" }} className="mobile-overlay" />}
      <aside className={sidebarOpen ? "open" : ""} style={{
        width: 220, background: "#0a1628", borderRight: "1px solid #1e293b",
        display: "flex", flexDirection: "column", height: "100vh", flexShrink: 0,
        position: "sticky", top: 0,
      }}>
        <div style={{ padding: "20px 18px 14px", borderBottom: "1px solid #1e293b" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#38bdf8", letterSpacing: -0.5 }}>🔧 RepairPro</div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>Сервизна CRM система</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 10 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? (realtimeOn ? "#10b981" : "#f59e0b") : "#ef4444", boxShadow: connected && realtimeOn ? "0 0 6px #10b981" : "" }} />
            <span style={{ fontSize: 10, color: connected ? "#64748b" : "#ef4444" }}>
              {connected ? (realtimeOn ? "Live синхрон" : "Свързан") : "Не е свързан"}
            </span>
            {syncing && <span className="spinner" style={{ fontSize: 10, color: "#38bdf8" }}>⏳</span>}
          </div>
        </div>

        <div style={{ padding: "12px 12px 6px" }}>
          <button onClick={onNewOrder} style={{ width: "100%", background: "linear-gradient(135deg,#38bdf8,#0ea5e9)", color: "#fff", border: "none", borderRadius: 9, padding: "9px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            + Нов сервиз
          </button>
        </div>

        <nav style={{ flex: 1, padding: "6px 0", overflowY: "auto" }}>
          {[
            ["orders", "🔧", "Сервиз", readyOrders.length || null],
            ["inventory", "📦", "Склад", lowStock.length || null],
            ["calculator", "🧮", "Калкулатор", null],
            ["pricing", "💲", "Готови цени", null],
            ["expenses", "💸", "Разходи", null],
            ["buybacks", "📱", "Изкупуване", null],
            ["dismantle", "🔨", "За разглобяване", dismantleCount || null],
            ["accsales", "🎧", "Продажба аксесоари", null],
            ["partssales", "🔩", "Продажба части", null],
            ["phonesales", "📲", "Продажба телефони", null],
            ["stockorders", "📋", "Поръчки части", null],
            ["debts", "💳", "Задължения", null],
            ...(!isAdmin ? [] : [
              ["dashboard", "📊", "Дашборд", null],
              ["reports", "📈", "Справки", null],
              ["technicians", "👨‍🔧", "Техници", null],
              ["daily", "🧾", "Дневен отчет", null],
              ["monthly", "📅", "Месечен отчет", null],
              ["users", "👥", "Потребители", null],
              ["trash", "🗑️", "Кошче", trash.filter(t => new Date(t.expires_at) > new Date()).length || null],
            ]),
          ].map(([key, icon, label, badge]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              display: "flex", alignItems: "center", gap: 9, width: "100%",
              padding: "10px 18px", border: "none", textAlign: "left",
              background: tab === key ? "#1e293b" : "transparent",
              color: tab === key ? "#38bdf8" : "#94a3b8",
              fontSize: 13, fontWeight: tab === key ? 700 : 400,
              borderLeft: tab === key ? "3px solid #38bdf8" : "3px solid transparent",
              transition: "all .15s", cursor: "pointer",
            }}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              <span style={{ flex: 1 }}>{label}</span>
              {badge && <span style={{ background: key === "inventory" ? "#ef4444" : "#10b981", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 7px", fontWeight: 700, minWidth: 18, textAlign: "center" }}>{badge}</span>}
            </button>
          ))}
        </nav>

        <div style={{ padding: "12px 14px", borderTop: "1px solid #1e293b" }}>
          <div style={{ background: "#0f172a", borderRadius: 8, padding: "10px 12px", marginBottom: 10, fontSize: 11 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: isAdmin ? 4 : 0 }}>
              <span style={{ color: "#64748b" }}>Активни</span><span style={{ color: "#f59e0b", fontWeight: 700 }}>{activeOrders.length}</span>
            </div>
            {isAdmin && <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b" }}>Общ оборот</span><span style={{ color: "#10b981", fontWeight: 700, fontSize: 12 }}>{fmtMoney(totalRev)}</span>
            </div>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onRefresh} title="Обнови данните" style={{ flex: 1, background: "#1e293b", color: "#64748b", border: "none", borderRadius: 7, padding: "7px", fontSize: 12, cursor: "pointer" }}>🔄 Обнови</button>
            {isAdmin && <button onClick={onSettings} title="Настройки" style={{ flex: 1, background: "#1e293b", color: "#64748b", border: "none", borderRadius: 7, padding: "7px", fontSize: 12, cursor: "pointer" }}>⚙️ Настройки</button>}
          </div>
          <button onClick={() => { if (confirm("Изход от системата?")) { sessionStorage.removeItem("rp_auth"); sessionStorage.removeItem("rp_user"); window.location.reload(); } }} style={{ width: "100%", background: "#450a0a", color: "#fca5a5", border: "none", borderRadius: 7, padding: "7px", fontSize: 12, cursor: "pointer", marginTop: 6 }}>
            🚪 Изход
          </button>
        </div>
      </aside>
    </>
  );
}

// ═══════════════════════════════ DASHBOARD ════════════════════════════════════
function Dashboard({ orders, lowStock, activeOrders, readyOrders, technicians, onNewOrder, onExport, notify }) {
  const totalRev = orders.filter(o => o.status === "Издаден").reduce((s, o) => s + Number(o.price || 0), 0);
  const monthlyRev = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - 5 + i);
    const m = d.getMonth(), y = d.getFullYear();
    const rev = orders.filter(o => {
  if (o.status !== "Издаден") return false;
  // Използвай date_out, ако го има, иначе updated_at, иначе date_in
  const d = o.date_out || o.updated_at || o.date_in;
  if (!d) return false;
  const od = new Date(d);
  return od.getMonth() === m && od.getFullYear() === y;
}).reduce((s, o) => s + Number(o.price || 0), 0);
    return { label: MONTHS_BG[m] + ' ' + y, rev };
  });
  const maxRev = Math.max(...monthlyRev.map(m => m.rev), 1);

  const techStats = technicians.map(t => ({
    name: t.name, color: t.color || "#38bdf8",
    count: orders.filter(o => o.technician === t.name).length,
    revenue: orders.filter(o => o.technician === t.name && o.status === "Издаден").reduce((s, o) => s + Number(o.price || 0), 0),
  })).sort((a, b) => b.revenue - a.revenue);

  const problemCounts = {};
  orders.forEach(o => { if (o.problem) problemCounts[o.problem] = (problemCounts[o.problem] || 0) + 1; });
  const topProblems = Object.entries(problemCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxProb = Math.max(...topProblems.map(([, c]) => c), 1);

  const recentOrders = orders.slice(0, 8);

  return (
    <div className="animate-fade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Дашборд</h1>
          <p style={{ margin: "3px 0 0", color: "var(--text3)", fontSize: 12 }}>{new Date().toLocaleDateString("bg-BG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn color="#10b981" bg="#064e3b" onClick={onExport}>📊 Пълен Excel</Btn>
          <PrimaryBtn onClick={onNewOrder}>+ Нов сервиз</PrimaryBtn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 18 }}>
        {[
          { l: "Активни поръчки", v: activeOrders.length, icon: "🔧", c: "#3b82f6" },
          { l: "Готови за вземане", v: readyOrders.length, icon: "✅", c: "#10b981" },
          { l: "Нисък склад", v: lowStock.length, icon: "⚠️", c: "#ef4444" },
          { l: "Общ оборот", v: fmtMoney(totalRev), icon: "💰", c: "#f59e0b" },
        ].map(({ l, v, icon, c }) => (
          <Card key={l} style={{ borderLeft: `4px solid ${c}`, padding: "16px 18px" }}>
            <div style={{ fontSize: 24 }}>{icon}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#f1f5f9", margin: "6px 0 2px" }}>{v}</div>
            <div style={{ fontSize: 11, color: "var(--text3)" }}>{l}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card>
          <div style={{ fontSize: 12, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Оборот — последните 6 месеца</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 110 }}>
            {monthlyRev.map(({ label, rev }, idx) => (
              <div key={idx} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <div style={{ fontSize: 10, color: "var(--text3)", height: 14, display: "flex", alignItems: "center" }}>{rev > 0 ? Math.round(rev) + "" : ""}</div>
                <div style={{ width: "100%", background: "linear-gradient(180deg,#38bdf8,#0369a1)", borderRadius: "4px 4px 0 0", height: `${Math.max((rev / maxRev) * 90, rev > 0 ? 4 : 1)}px`, opacity: rev > 0 ? 1 : 0.15, transition: "height .5s ease" }} />
                <div style={{ fontSize: 11, color: "var(--text3)" }}>{label.split(" ")[0]}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 12, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Топ проблеми</div>
          {topProblems.map(([name, count]) => (
            <div key={name} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}><span style={{ color: "#cbd5e1" }}>{name}</span><span style={{ color: "var(--text3)" }}>{count}</span></div>
              <div style={{ height: 5, background: "#334155", borderRadius: 3 }}><div style={{ height: "100%", width: `${(count / maxProb) * 100}%`, background: "var(--purple)", borderRadius: 3, transition: "width .4s ease" }} /></div>
            </div>
          ))}
          {topProblems.length === 0 && <p style={{ color: "var(--text3)", fontSize: 12 }}>Няма данни</p>}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 14 }}>
        <Card>
          <div style={{ fontSize: 12, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Техници</div>
          <div className="table-wrap">
            <table>
              <thead><tr>{["Техник", "Брой", "Приход"].map(h => <th key={h} style={{ textAlign: "left", fontSize: 10, color: "var(--text3)", padding: "6px 4px", borderBottom: "1px solid #334155" }}>{h}</th>)}</tr></thead>
              <tbody>
                {techStats.map(({ name, color, count, revenue }, i) => (
                  <tr key={name} style={{ borderBottom: "1px solid #1e293b" }}>
                    <td style={{ padding: "8px 4px", fontSize: 13, fontWeight: 600 }}><span style={{ color, marginRight: 6 }}>●</span>{i === 0 ? "🏆 " : ""}{name}</td>
                    <td style={{ padding: "8px 4px", fontSize: 12, color: "var(--text2)" }}>{count} бр.</td>
                    <td style={{ padding: "8px 4px", fontSize: 13, fontWeight: 700, color: "#10b981" }}>{fmtMoney(revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 12, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Последни поръчки</div>
          <div className="table-wrap">
            <table>
              <tbody>
                {recentOrders.map(o => (
                  <tr key={o.id} style={{ borderBottom: "1px solid #1e293b" }}>
                    <td style={{ padding: "5px 0" }}>
                      <span style={{ fontSize: 11, color: "#38bdf8", fontFamily: "monospace", minWidth: 100 }}>{o.id}</span>
                    </td>
                    <td style={{ padding: "5px 0" }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{o.client_name}</span>
                    </td>
                    <td style={{ padding: "5px 0" }}>
                      <span style={{ fontSize: 11, color: "var(--text3)" }}>{o.device_type}</span>
                    </td>
                    <td style={{ padding: "5px 0" }}>
                      <Badge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {lowStock.length > 0 && (
        <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 10, padding: 14, marginTop: 14 }}>
          <div style={{ fontWeight: 700, color: "#fca5a5", marginBottom: 6, fontSize: 13 }}>⚠️ Ниска складова наличност ({lowStock.length} артикула)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {lowStock.map(i => <span key={i.id} style={{ background: "#7f1d1d", color: "#fca5a5", borderRadius: 6, padding: "3px 10px", fontSize: 11 }}>{i.name} — {i.quantity} бр.</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════ ORDERS TAB ════════════════════════════════════
function OrdersTab({ orders, allOrders, search, setSearch, filterStatus, setFilterStatus, filterDevice, setFilterDevice, onNew, onEdit, onDelete, onPrint, onLabel, onDownloadTXT, onWarranty, onExport, onImport, inventory, setInventory, upsertOrder }) {
  return (
    <div className="animate-fade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Сервиз <span style={{ fontSize: 12, color: "var(--text3)", fontWeight: 400 }}>({allOrders.length} общо)</span></h1>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span className="hide-mobile" style={{ display: "contents" }}><Btn color="#f59e0b" bg="#451a03" onClick={onImport}>📥 Импорт Excel</Btn></span>
          <span className="hide-mobile" style={{ display: "contents" }}><Btn color="#10b981" bg="#064e3b" onClick={onExport}>📊 Експорт Excel</Btn></span>
          <PrimaryBtn onClick={onNew} style={{ fontSize: 12, padding: "7px 12px" }}>+ Нов сервиз</PrimaryBtn>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="🔍  Търси по клиент, телефон, № поръчка, устройство, проблем..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 280 }} />
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {["Всички", ...STATUSES].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "5px 11px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none", transition: "all .15s", background: filterStatus === s ? (STATUS_COLOR[s] || "#38bdf8") : "#1e293b", color: filterStatus === s ? "#fff" : "#64748b" }}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginRight: 4 }}>📱 Тип:</span>
        {["Всички", ...DEVICE_TYPES].map(d => (
          <button key={d} onClick={() => setFilterDevice(d)} style={{
            padding: "4px 11px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none",
            background: filterDevice === d ? "#38bdf8" : "#1e293b",
            color: filterDevice === d ? "#0f172a" : "#64748b",
          }}>{d}</button>
        ))}
      </div>
      <div style={{ background: "var(--bg2)", borderRadius: 12, overflow: "hidden" }}>
        <div className="table-wrap">
          <table>
            <thead style={{ background: "#0a1628" }}>
              <tr>{["№ Поръчка", "Клиент", "Телефон", "Устройство", "Проблем", "Техник", "Крайна цена", "Статус", "Плащане", "Дата", ""].map(h => (
                <th key={h} style={{ padding: "11px 13px", textAlign: "left", fontSize: 10, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, whiteSpace: "nowrap" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {orders.length === 0 && <tr><td colSpan={10} style={{ textAlign: "center", padding: 40, color: "var(--text3)" }}>Няма намерени поръчки</td></tr>}
              {orders.map(o => (
                <tr key={o.id} style={{ borderTop: "1px solid #0f172a", cursor: "pointer", transition: "background .1s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#243044"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  onDoubleClick={() => onEdit(o)}>
                  <td style={{ padding: "9px 13px", fontSize: 12, color: "#38bdf8", fontWeight: 700, fontFamily: "monospace" }}>{o.id}</td>
                  <td style={{ padding: "9px 13px", fontSize: 13, fontWeight: 600 }}>{o.client_name}</td>
                  <td style={{ padding: "9px 13px", fontSize: 12, color: "var(--text2)" }}>{o.phone}</td>
                  <td style={{ padding: "9px 13px", fontSize: 12 }}>{o.device_type} {o.brand} {o.model}</td>
                  <td style={{ padding: "9px 13px", fontSize: 12, color: "var(--text2)" }}>{o.problem}</td>
                  <td style={{ padding: "9px 13px", fontSize: 12 }}>{o.technician || "—"}</td>
                  <td style={{ padding: "9px 13px" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#10b981" }}>€ {Number(o.total_price || o.price || 0).toFixed(2)}</div>
                    {o.labor_price > 0 && <div style={{ fontSize: 10, color: "#64748b" }}>труд: € {Number(o.labor_price).toFixed(2)}</div>}
                    {(o.parts || []).length > 0 && <div style={{ fontSize: 10, color: "#64748b" }}>части: € {(o.parts || []).reduce((s, p) => s + Number(p.price || 0), 0).toFixed(2)}</div>}
                  </td>
                  <td style={{ padding: "9px 13px" }}><Badge status={o.status} /></td>
                  <td style={{ padding: "9px 13px" }}>
                    {o.payment_method && <span style={{
                      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                      background: o.payment_method === "Не е платен" ? "#450a0a" : o.payment_method === "В брой" ? "#052e16" : o.payment_method === "С карта" ? "#1e3a5f" : "#1e293b",
                      color: o.payment_method === "Не е платен" ? "#fca5a5" : o.payment_method === "В брой" ? "#6ee7b7" : o.payment_method === "С карта" ? "#93c5fd" : "#94a3b8",
                    }}>{o.payment_method}</span>}
                  </td>
                  <td style={{ padding: "9px 13px", fontSize: 11, color: "var(--text3)", whiteSpace: "nowrap" }}>{fmtDate(o.date_in)}</td>
                  <td style={{ padding: "9px 13px" }}>
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                      <Btn color="#3b82f6" onClick={() => onEdit(o)} title="Редактирай">✏️</Btn>
                      <Btn color="#8b5cf6" onClick={() => onPrint(o)} title="PDF Протокол">📄</Btn>
                      <Btn color="#0ea5e9" onClick={() => onLabel(o)} title="Стикер/QR">🏷️</Btn>
                      <Btn color="#6ee7b7" onClick={() => onDownloadTXT(o)} title="Изтегли TXT">⬇️</Btn>
                      <Btn color="#fbbf24" onClick={() => onWarranty(o)} title="Гаранционна карта">🛡️</Btn>
                      <Btn color="#ef4444" onClick={() => { if (confirm(`Изтрий поръчка ${o.id}?`)) onDelete(o.id); }} title="Изтрий">🗑️</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Mobile cards */}
      <div className="mobile-cards" style={{ display: "none" }}>
        {orders.length === 0 && <Card style={{ textAlign: "center", padding: 30 }}>Няма поръчки</Card>}
        {orders.map(o => (
          <Card key={o.id} style={{ marginBottom: 10, padding: 14 }} onClick={() => onEdit(o)}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: "monospace", color: "#38bdf8", fontWeight: 700 }}>{o.id}</span>
              <Badge status={o.status} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{o.client_name}</div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>{o.phone}</div>
            <div style={{ display: "flex", gap: 8, margin: "8px 0", color: "var(--text2)", fontSize: 12 }}>
              <span>{o.device_type} {o.brand}</span>
              <span>{o.problem}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: "#10b981" }}>{fmtMoney(o.total_price || o.price)}</span>
              <span style={{ fontSize: 12 }}>{o.technician || "—"}</span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <Btn color="#3b82f6" onClick={() => onEdit(o)}>✏️</Btn>
              <Btn color="#8b5cf6" onClick={() => onPrint(o)}>📄</Btn>
              <Btn color="#0ea5e9" onClick={() => onLabel(o)}>🏷️</Btn>
              <Btn color="#fbbf24" onClick={() => onWarranty(o)}>🛡️</Btn>
              <Btn color="#ef4444" onClick={() => { if (confirm('Изтрий?')) onDelete(o.id); }}>🗑️</Btn>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════ ORDER MODAL ══════════════════════════════════
const OrderModal = memo(function OrderModal({ order, technicians, inventory, setInventory, onSave, onClose, syncing }) {
  const empty = { client_name: "", phone: "", email: "", device_type: "Смартфон", brand: "", model: "", serial_number: "", problem: "", description: "", status: "Приет", technician: "", technician_id: null, price: "", deposit: "", date_in: today(), date_out: "", warranty_days: 30, parts: [], photos: [], notes: "", device_password: "", payment_method: "", labor_price: "", total_price: "", external_service_price: "", external_service_note: "" };
  const [form, setForm] = useState(order || empty);
  const [activeTab, setActiveTab] = useState("info");
  const fileRef = useRef();
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handlePhotos = async () => {
    if (isElectron) {
      const files = await window.electronAPI.openFileDialog();
      const newPhotos = files.map(f => ({ name: f.name, data: `data:image/${f.ext};base64,${f.base64}` }));
      setForm(f => ({ ...f, photos: [...(f.photos || []), ...newPhotos] }));
    } else {
      fileRef.current.click();
    }
  };
  const handleFileInput = (e) => {
    Array.from(e.target.files).forEach(file => {
      const r = new FileReader();
      r.onload = ev => setForm(f => ({ ...f, photos: [...(f.photos || []), { name: file.name, data: ev.target.result }] }));
      r.readAsDataURL(file);
    });
  };
  const removePhoto = (i) => setForm(f => ({ ...f, photos: f.photos.filter((_, j) => j !== i) }));
  const addPart = (inv) => {
    if (Number(inv.quantity) <= 0) return;
    const newQty = Number(inv.quantity) - 1;
    setForm(f => {
      const newParts = [...(f.parts || []), { id: inv.id, name: inv.name, price: Number(inv.price), category: inv.category || "" }];
      const partsSum = newParts.reduce((s, p) => s + Number(p.price || 0), 0);
      const labor = Number(f.labor_price || 0);
      const ext = Number(f.external_service_price || 0);
      const total = (labor + partsSum + ext).toFixed(2);
      return { ...f, parts: newParts, total_price: total, price: total };
    });
    setTimeout(() => {
      if (newQty === 0) {
        setInventory(iv => iv.filter(i => i.id !== inv.id));
        upsertInventory({ ...inv, quantity: 0 }).then(() => dbDeleteInv(inv.id)).catch(() => { });
      } else {
        setInventory(iv => iv.map(i => i.id === inv.id ? { ...i, quantity: newQty } : i));
        upsertInventory({ ...inv, quantity: newQty }).catch(() => { });
      }
    }, 0);
  };
  const removePart = (idx) => {
    const part = form.parts[idx];
    setInventory(iv => {
      const exists = iv.find(i => i.id === part.id);
      if (exists) {
        const newQty = Number(exists.quantity) + 1;
        upsertInventory({ ...exists, quantity: newQty }).catch(() => { });
        return iv.map(i => i.id === part.id ? { ...i, quantity: newQty } : i);
      } else {
        const restored = { id: part.id, name: part.name, price: part.price, quantity: 1, min_qty: 2, category: part.category || "Друго" };
        upsertInventory(restored).catch(() => { });
        return [...iv, restored];
      }
    });
    setForm(f => {
      const newParts = f.parts.filter((_, j) => j !== idx);
      const partsSum = newParts.reduce((s, p) => s + Number(p.price || 0), 0);
      const labor = Number(f.labor_price || 0);
      const total = (labor + partsSum).toFixed(2);
      return { ...f, parts: newParts, total_price: total, price: total };
    });
  };
  const partsTotal = (form.parts || []).reduce((s, p) => s + Number(p.price || 0), 0);

  const tabs = [["info", "📋", "Основна"], ["parts", "🔩", "Части"], ["photos", "📷", "Снимки"], ["notes", "📝", "Бележки"]];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#1e293b", borderRadius: 16, width: "100%", maxWidth: 820, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 30px 80px rgba(0,0,0,.6)" }} className="modal-content">
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }} className="modal-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{order ? "Редактирай сервиз" : "Нов сервиз"}</h2>
            {order && <div style={{ fontSize: 11, color: "#38bdf8", fontFamily: "monospace", marginTop: 2 }}>{order.id}</div>}
          </div>
          <button onClick={onClose} style={{ background: "#334155", border: "none", color: "#94a3b8", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #334155", flexShrink: 0 }}>
          {tabs.map(([key, icon, label]) => (
            <button key={key} onClick={() => setActiveTab(key)} style={{ padding: "9px 16px", border: "none", background: "transparent", color: activeTab === key ? "#38bdf8" : "#64748b", fontSize: 12, fontWeight: activeTab === key ? 700 : 400, cursor: "pointer", borderBottom: activeTab === key ? "2px solid #38bdf8" : "2px solid transparent" }}>
              {icon} {label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 22 }}>
          {activeTab === "info" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="m-modal-2col">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5 }}>Клиент</div>
                <Field label="Три имена *"><input value={form.client_name} onChange={e => set("client_name", e.target.value)} placeholder="Иван Иванов" /></Field>
                <Field label="Телефон *"><input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="0888 123 456" /></Field>
                <Field label="Имейл"><input value={form.email || ""} onChange={e => set("email", e.target.value)} placeholder="ivan@example.com" /></Field>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5 }}>Устройство</div>
                <Field label="Тип"><select value={form.device_type} onChange={e => set("device_type", e.target.value)}>{DEVICE_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
                <Field label="Марка"><input value={form.brand || ""} onChange={e => set("brand", e.target.value)} placeholder="Samsung / Apple / HP..." /></Field>
                <Field label="Модел"><input value={form.model || ""} onChange={e => set("model", e.target.value)} placeholder="Galaxy S22 / iPhone 14..." /></Field>
                <Field label="Сериен №"><input value={form.serial_number || ""} onChange={e => set("serial_number", e.target.value)} placeholder="IMEI / S/N" /></Field>
                <Field label="🔑 Парола / PIN (ако има)"><input value={form.device_password || ""} onChange={e => set("device_password", e.target.value)} placeholder="1234 / pattern / без парола" /></Field>
              </div>
              <div style={{ gridColumn: "1/-1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="m-modal-2col">
                <Field label="Проблем (може да избереш няколко)">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "8px", background: "var(--bg)", border: "1px solid var(--bg3)", borderRadius: 7, maxHeight: 160, overflow: "auto" }}>
                    {(PROBLEMS_BY_DEVICE[form.device_type] || PROBLEMS).map(p => {
                      const selected = (form.problem || "").split(", ").filter(Boolean);
                      const isOn = selected.includes(p);
                      return <button key={p} type="button" onClick={() => {
                        const cur = (form.problem || "").split(", ").filter(Boolean);
                        const next = isOn ? cur.filter(x => x !== p) : [...cur, p];
                        set("problem", next.join(", "));
                      }} style={{
                        padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: isOn ? 700 : 400,
                        cursor: "pointer", border: "none", transition: "all .15s",
                        background: isOn ? "#38bdf8" : "#1e293b",
                        color: isOn ? "#0f172a" : "#64748b",
                      }}>{p}</button>;
                    })}
                  </div>
                  {form.problem
                    ? <div style={{ fontSize: 11, color: "#38bdf8", marginTop: 5, padding: "4px 8px", background: "#0f172a", borderRadius: 6 }}>✓ {form.problem}</div>
                    : <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>Избери един или повече проблема</div>
                  }
                  <div style={{ marginTop: 8 }}>
                    <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>✏️ Или въведи ръчно (добавя към избраните):</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        placeholder="Опиши проблема ръчно..."
                        style={{ flex: 1, fontSize: 12 }}
                        onKeyDown={e => {
                          if (e.key === "Enter" && e.target.value.trim()) {
                            const cur = (form.problem || "").split(", ").filter(Boolean);
                            set("problem", [...cur, e.target.value.trim()].join(", "));
                            e.target.value = "";
                          }
                        }}
                      />
                      <button type="button" onClick={e => {
                        const inp = e.currentTarget.previousSibling;
                        if (inp.value.trim()) {
                          const cur = (form.problem || "").split(", ").filter(Boolean);
                          set("problem", [...cur, inp.value.trim()].join(", "));
                          inp.value = "";
                        }
                      }} style={{ background: "#334155", color: "#94a3b8", border: "none", borderRadius: 7, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}>+ Добави</button>
                    </div>
                  </div>
                </Field>
                <Field label="Техник">
                  <select value={form.technician || ""} onChange={e => { set("technician", e.target.value); const t = technicians.find(x => x.name === e.target.value); set("technician_id", t?.id || null); }}>
                    <option value="">— Избери техник —</option>
                    {technicians.filter(t => t.active !== false).map(t => <option key={t.id}>{t.name}</option>)}
                  </select>
                </Field>
                <Field label="Статус"><select value={form.status} onChange={e => set("status", e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></Field>
                <Field label="💪 Цена труд (€)">
                  <input type="number" min="0" step="0.01"
                    value={form.labor_price || ""}
                    onChange={e => {
                      const labor = Number(e.target.value) || 0;
                      const parts = (form.parts || []).reduce((s, p) => s + Number(p.price || 0), 0);
                      const ext = Number(form.external_service_price || 0);
                      const total = (labor + parts + ext).toFixed(2);
                      set("labor_price", e.target.value);
                      set("total_price", total);
                      set("price", total);
                    }}
                    placeholder="0.00" />
                </Field>
                <Field label="🔧 Външна услуга (€)">
                  <input type="number" min="0" step="0.01"
                    value={form.external_service_price || ""}
                    onChange={e => {
                      const ext = Number(e.target.value) || 0;
                      const labor = Number(form.labor_price || 0);
                      const parts = (form.parts || []).reduce((s, p) => s + Number(p.price || 0), 0);
                      const total = (labor + parts + ext).toFixed(2);
                      set("external_service_price", e.target.value);
                      set("total_price", total);
                      set("price", total);
                    }}
                    placeholder="0.00" />
                </Field>
                <Field label="📝 Описание на външната услуга" style={{ gridColumn: "1/-1" }}>
                  <input value={form.external_service_note || ""} onChange={e => set("external_service_note", e.target.value)} placeholder="Смяна на дисплей от външен сервиз, запояване..." />
                </Field>
                <Field label="🔩 Цена части (€) — авт.">
                  <input type="number"
                    value={(form.parts || []).reduce((s, p) => s + Number(p.price || 0), 0).toFixed(2)}
                    readOnly
                    style={{ background: "#0f172a", color: "#f59e0b", cursor: "not-allowed" }} />
                </Field>
                <Field label="💰 Крайна цена (€)">
                  <input type="number" min="0" step="0.01"
                    value={form.total_price || form.price || ""}
                    onChange={e => { set("total_price", e.target.value); set("price", e.target.value); }}
                    placeholder="0.00"
                    style={{ fontWeight: 800, color: "#10b981", borderColor: "#10b981" }} />
                </Field>
                <Field label="💵 Аванс (€)">
                  <input type="number" min="0" step="0.01" value={form.deposit || ""} onChange={e => set("deposit", e.target.value)} placeholder="0.00" />
                </Field>
                <Field label="💳 Начин на плащане">
                  <select value={form.payment_method || ""} onChange={e => set("payment_method", e.target.value)}>
                    <option value="">— Избери —</option>
                    <option value="В брой">💵 В брой</option>
                    <option value="С карта">💳 С карта</option>
                    <option value="Банка">🏦 Банка</option>
                    <option value="Еконт">📦 Еконт</option>
                    <option value="Спиди">🚚 Спиди</option>
                    <option value="Не е платен">❌ Не е платен</option>
                  </select>
                </Field>
                <Field label="Гаранция (дни)"><input type="number" min="0" value={form.warranty_days || 30} onChange={e => set("warranty_days", Number(e.target.value))} /></Field>
                <Field label="Дата приемане"><input type="date" value={form.date_in || ""} onChange={e => set("date_in", e.target.value)} /></Field>
                <Field label="Дата издаване"><input type="date" value={form.date_out || ""} onChange={e => set("date_out", e.target.value || null)} /></Field>
              </div>
              <Field label="Описание на проблема" style={{ gridColumn: "1/-1" }}>
                <textarea value={form.description || ""} onChange={e => set("description", e.target.value)} rows={3} style={{ resize: "vertical" }} placeholder="Подробно описание..." />
              </Field>
            </div>
          )}
          {activeTab === "parts" && (
            <PartsSelector inventory={inventory} addPart={addPart} removePart={removePart} parts={form.parts || []} price={form.price || 0} />
          )}
          {activeTab === "photos" && (
            <div>
              <input type="file" ref={fileRef} multiple accept="image/*" onChange={handleFileInput} style={{ display: "none" }} />
              <button onClick={handlePhotos} style={{ background: "#0f172a", color: "#64748b", border: "2px dashed #334155", borderRadius: 10, padding: "12px 24px", cursor: "pointer", fontSize: 13, marginBottom: 16, width: "100%" }}>
                📷 Добави снимки на устройството
              </button>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {(form.photos || []).map((ph, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    <img src={ph.data || ph} alt="" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8, border: "2px solid #334155" }} />
                    <button onClick={() => removePhoto(i)} style={{ position: "absolute", top: -6, right: -6, background: "#ef4444", color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: 11 }}>×</button>
                    <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 3, textAlign: "center", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ph.name || "снимка"}</div>
                  </div>
                ))}
                {(form.photos || []).length === 0 && <p style={{ color: "var(--text3)", fontSize: 12 }}>Няма добавени снимки</p>}
              </div>
            </div>
          )}
          {activeTab === "notes" && (
            <Field label="Вътрешни бележки (не се виждат от клиента)">
              <textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} rows={8} style={{ resize: "vertical" }} placeholder="Вътрешни бележки, коментари, следващи стъпки..." />
            </Field>
          )}
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }} className="modal-footer">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {form.status && <Badge status={form.status} />}
            {Number(form.labor_price || 0) > 0 && <span style={{ fontSize: 12, color: "#64748b" }}>Труд: <b style={{ color: "#f59e0b" }}>€ {Number(form.labor_price).toFixed(2)}</b></span>}
            {(form.parts || []).length > 0 && <span style={{ fontSize: 12, color: "#64748b" }}>Части: <b style={{ color: "#f59e0b" }}>€ {(form.parts || []).reduce((s, p) => s + Number(p.price || 0), 0).toFixed(2)}</b></span>}
            {Number(form.total_price || form.price || 0) > 0 && <span style={{ fontSize: 14, fontWeight: 800, color: "#10b981" }}>Крайна: € {Number(form.total_price || form.price || 0).toFixed(2)}</span>}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ background: "#334155", color: "#94a3b8", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600 }}>Отказ</button>
            <PrimaryBtn onClick={() => { if (!form.client_name?.trim() || !form.phone?.trim()) { alert("Въведи клиент и телефон!"); return; } onSave(form); }} disabled={syncing}>
              {syncing ? "⏳ Запазване..." : "💾 Запази"}
            </PrimaryBtn>
          </div>
        </div>
      </div>
    </div>
  );
});

// ═══════════════════════════════ INVENTORY TAB ════════════════════════════════
function InventoryTab({ inventory, lowStock, onNew, onEdit, onDelete, onExport, onImport }) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("Всички");

  const filtered = inventory.filter(i => {
    const q = search.toLowerCase().trim();
    const matchCat = catFilter === "Всички" || i.category === catFilter;
    if (!matchCat) return false;
    if (!q) return true;
    return (
      (i.name || "").toLowerCase().includes(q) ||
      (i.category || "").toLowerCase().includes(q) ||
      (i.supplier || "").toLowerCase().includes(q) ||
      (i.sku || "").toLowerCase().includes(q) ||
      (i.location || "").toLowerCase().includes(q) ||
      (i.notes || "").toLowerCase().includes(q)
    );
  });

  const totalValue = inventory.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.price || 0), 0);
  const totalCost = inventory.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.cost || 0), 0);
  const cats = ["Всички", ...new Set(inventory.map(i => i.category).filter(Boolean))];

  return (
    <div className="animate-fade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Складова наличност</h1>
          <p style={{ margin: "3px 0 0", color: "var(--text3)", fontSize: 12 }}>Обща стойност: <b style={{ color: "#10b981" }}>{fmtMoney(totalValue)}</b> | {inventory.length} артикула</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn color="#f59e0b" bg="#451a03" onClick={onImport}>📥 Импорт Excel</Btn>
          <Btn color="#10b981" bg="#064e3b" onClick={onExport}>📊 Експорт Excel</Btn>
          <PrimaryBtn onClick={onNew} color="linear-gradient(135deg,#10b981,#059669)">+ Нов артикул</PrimaryBtn>
        </div>
      </div>
      {lowStock.length > 0 && <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 12, color: "#fca5a5" }}>⚠️ <b>{lowStock.length} артикула</b> са под минималната наличност!</div>}
      <div style={{ marginBottom: 10 }}>
        <input
          placeholder="🔍  Търси по наименование, категория, доставчик, SKU, локация..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box" }}
        />
        {search && (
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
            Намерени: <b style={{ color: "#38bdf8" }}>{filtered.length}</b> артикула
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 14, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
        {cats.map(c => (
          <button key={c} onClick={() => setCatFilter(c)} style={{
            padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
            cursor: "pointer", border: "none",
            background: catFilter === c ? "#38bdf8" : "#1e293b",
            color: catFilter === c ? "#0f172a" : "#64748b",
            whiteSpace: "nowrap", flexShrink: 0
          }}>
            {c}
          </button>
        ))}
      </div>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table>
            <thead style={{ background: "#0a1628" }}>
              <tr>{["Наименование", "Категория", "Наличност", "Мин.", "Продажна цена", "Себестойност", "Стойност", "Доставчик", ""].map(h => <th key={h} style={{ padding: "11px 13px", textAlign: "left", fontSize: 10, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5 }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map(i => {
                const low = Number(i.quantity) <= Number(i.min_qty);
                const highlight = (text) => {
                  if (!search || !text) return text;
                  const idx = text.toLowerCase().indexOf(search.toLowerCase());
                  if (idx === -1) return text;
                  return (
                    <>
                      {text.slice(0, idx)}
                      <span style={{ background: "#f59e0b33", color: "#f59e0b", fontWeight: 700 }}>{text.slice(idx, idx + search.length)}</span>
                      {text.slice(idx + search.length)}
                    </>
                  );
                };
                return (
                  <tr key={i.id} style={{ borderTop: "1px solid #0f172a", background: low ? "rgba(239,68,68,.05)" : "transparent", transition: "background .1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = low ? "rgba(239,68,68,.1)" : "#243044"}
                    onMouseLeave={e => e.currentTarget.style.background = low ? "rgba(239,68,68,.05)" : "transparent"}>
                    <td style={{ padding: "9px 13px", fontSize: 13, fontWeight: 600 }}>{highlight(i.name)}</td>
                    <td style={{ padding: "9px 13px", fontSize: 12, color: "var(--text2)" }}>{highlight(i.category)}</td>
                    <td style={{ padding: "9px 13px" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: Number(i.quantity) === 0 ? "#ef4444" : low ? "#f59e0b" : "#10b981" }}>{i.quantity} бр.</span>
                      {low && <span style={{ fontSize: 10, color: "#ef4444", marginLeft: 5 }}>⚠</span>}
                    </td>
                    <td style={{ padding: "9px 13px", fontSize: 12, color: "var(--text3)" }}>{i.min_qty}</td>
                    <td style={{ padding: "9px 13px", fontSize: 13, fontWeight: 700, color: "#10b981" }}>{fmtMoney(i.price)}</td>
                    <td style={{ padding: "9px 13px", fontSize: 12, color: "var(--text2)" }}>{fmtMoney(i.cost)}</td>
                    <td style={{ padding: "9px 13px", fontSize: 12, color: "#f59e0b" }}>{fmtMoney(Number(i.quantity) * Number(i.price))}</td>
                    <td style={{ padding: "9px 13px", fontSize: 12, color: "var(--text3)" }}>{highlight(i.supplier || "—")}</td>
                    <td style={{ padding: "9px 13px" }}><div style={{ display: "flex", gap: 4 }}>
                      <Btn color="#3b82f6" onClick={() => onEdit(i)} title="Редактирай">✏️</Btn>
                      <Btn color="#ef4444" onClick={() => { if (confirm("Изтрий?")) onDelete(i.id); }} title="Изтрий">🗑️</Btn>
                    </div></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", padding: 30, color: "var(--text3)" }}>Няма намерени артикули</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {/* Mobile cards */}
      {filtered.map(i => {
        const low = Number(i.quantity) <= Number(i.min_qty);
        return (
          <div key={i.id + "m"} className="mobile-inv-card" style={{ display: "none", background: "#1e293b", borderRadius: 10, padding: "12px 14px", marginBottom: 8, borderLeft: `3px solid ${Number(i.quantity) === 0 ? "#ef4444" : low ? "#f59e0b" : "#10b981"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", flex: 1, lineHeight: 1.3 }}>{i.name}</div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <Btn color="#3b82f6" onClick={() => onEdit(i)}>✏️</Btn>
                <Btn color="#ef4444" onClick={() => { if (confirm("Изтрий?")) onDelete(i.id); }}>🗑️</Btn>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "#64748b", background: "#0f172a", padding: "2px 8px", borderRadius: 10 }}>{i.category}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: Number(i.quantity) === 0 ? "#ef4444" : low ? "#f59e0b" : "#10b981" }}>{i.quantity} бр.{low ? " ⚠️" : ""}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#10b981" }}>{fmtMoney(i.price)}</span>
              {i.supplier && <span style={{ fontSize: 11, color: "#64748b" }}>{i.supplier}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InvModal({ item, onSave, onClose, syncing, allInventory = [] }) {
  const [form, setForm] = useState({ name: "", category: "Дисплеи", quantity: 0, min_qty: 0, price: 0, cost: 0, supplier: "", location: "", sku: "", notes: "", payment_status: "Платен", payment_method: "В брой", supplier_note: "", ...item });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [showSuppliers, setShowSuppliers] = useState(false);

  const knownSuppliers = [...new Set(allInventory.map(i => i.supplier).filter(Boolean))].sort();
  const filteredSuppliers = knownSuppliers.filter(s =>
    s.toLowerCase().includes((form.supplier || "").toLowerCase()) && s !== form.supplier
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#1e293b", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "92vh", overflow: "auto", boxShadow: "0 30px 80px rgba(0,0,0,.6)" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#1e293b", zIndex: 10 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{item?.id ? "Редактирай артикул" : "Нов артикул"}</h2>
          <button onClick={onClose} style={{ background: "#334155", border: "none", color: "#94a3b8", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Наименование *"><input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Дисплей Samsung Galaxy S22" /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Категория"><select value={form.category || "Дисплеи"} onChange={e => set("category", e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
            <Field label="SKU / Код"><input value={form.sku || ""} onChange={e => set("sku", e.target.value)} placeholder="SAM-S22-LCD" /></Field>
            <Field label="Наличност (бр.)"><input type="number" min="0" value={form.quantity} onChange={e => set("quantity", Number(e.target.value))} /></Field>
            <Field label="Минимална наличност"><input type="number" min="0" value={form.min_qty} onChange={e => set("min_qty", Number(e.target.value))} /></Field>
            <Field label="Продажна цена (€)"><input type="number" min="0" step="0.01" value={form.price} onChange={e => set("price", Number(e.target.value))} /></Field>
            <Field label="Себестойност (€)"><input type="number" min="0" step="0.01" value={form.cost || 0} onChange={e => set("cost", Number(e.target.value))} /></Field>
            <Field label="Доставчик">
              <div style={{ position: "relative" }}>
                <input
                  value={form.supplier || ""}
                  onChange={e => { set("supplier", e.target.value); setShowSuppliers(true); }}
                  onFocus={() => setShowSuppliers(true)}
                  onBlur={() => setTimeout(() => setShowSuppliers(false), 150)}
                  placeholder="TechParts BG, iRepair..."
                  autoComplete="off"
                />
                {showSuppliers && filteredSuppliers.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#0f172a", border: "1px solid #334155", borderRadius: "0 0 8px 8px", zIndex: 100, maxHeight: 160, overflow: "auto" }}>
                    {filteredSuppliers.map(s => (
                      <div key={s} onMouseDown={() => { set("supplier", s); setShowSuppliers(false); }} style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, color: "#e2e8f0", borderBottom: "1px solid #1e293b" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#1e293b"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        {s}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Field>
            <Field label="Локация в склада"><input value={form.location || ""} onChange={e => set("location", e.target.value)} placeholder="Рафт A-3" /></Field>
          </div>
          <Field label="💳 Статус на плащането към доставчика">
            <div style={{ display: "flex", gap: 8 }}>
              {["Платен", "Не е платен"].map(opt => (
                <button key={opt} type="button" onClick={() => set("payment_status", opt)} style={{
                  flex: 1, padding: "10px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13,
                  background: form.payment_status === opt ? (opt === "Платен" ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#ef4444,#dc2626)") : "#0f172a",
                  color: form.payment_status === opt ? "#fff" : "#64748b",
                  border: form.payment_status === opt ? "none" : "1px solid #334155",
                  transition: "all .15s",
                }}>{opt === "Платен" ? "✅ Платен" : "❌ Не е платен"}</button>
              ))}
            </div>
          </Field>
          {form.payment_status === "Платен" && (
            <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: 8, padding: 12 }}>
              <Field label="Начин на плащане">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["Платена от каса", "С карта", "Банка", "Еконт", "Спиди"].map(m => (
                    <button key={m} type="button" onClick={() => set("payment_method", m)} style={{
                      padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      background: form.payment_method === m ? "#10b981" : "#0f172a",
                      color: form.payment_method === m ? "#fff" : "#64748b",
                      border: form.payment_method === m ? "none" : "1px solid #334155",
                    }}>{m}</button>
                  ))}
                </div>
              </Field>
              {form.payment_method === "Платена от каса" && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#6ee7b7", padding: "6px 10px", background: "rgba(16,185,129,.1)", borderRadius: 6 }}>
                  💰 Сумата ({form.cost > 0 ? `€ ${(Number(form.cost) * Number(form.quantity || 1)).toFixed(2)}` : "€ 0.00"}) ще се добави автоматично в <b>Разходи</b> и ще намали касата за днес.
                </div>
              )}
            </div>
          )}
          {form.payment_status === "Не е платен" && (
            <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: 12, fontSize: 12, color: "#fca5a5" }}>
              ⚠️ Ще се добави автоматично в <b>Задължения</b> към доставчик <b>{form.supplier || "—"}</b>
              <Field label="Бележка" style={{ marginTop: 8 }}>
                <input value={form.supplier_note || ""} onChange={e => set("supplier_note", e.target.value)} placeholder="Допълнителна бележка..." style={{ color: "#e2e8f0" }} />
              </Field>
            </div>
          )}
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid #334155", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "#334155", color: "#94a3b8", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600 }}>Отказ</button>
          <PrimaryBtn onClick={() => { if (!form.name?.trim()) { alert("Въведи наименование!"); return; } onSave(form); }} disabled={syncing} color="linear-gradient(135deg,#10b981,#059669)">
            {syncing ? "⏳ Запазване..." : "💾 Запази"}
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}
// КРАЙ НА ЧАСТ 2
// ЧАСТ 3
// ═══════════════════════════════ REPORTS TAB ══════════════════════════════════
function ReportsTab({ orders, inventory, technicians, accSales = [], onExport }) {
  const [from, setFrom] = useState(today().slice(0, 7) + "-01");
  const [to, setTo] = useState(today());
  const [viewMode, setViewMode] = useState("period");
  const [selTech, setSelTech] = useState("Всички");

  const filtered = orders.filter(o => o.date_in >= from && o.date_in <= to);
  const revenue = filtered.filter(o => o.status === "Издаден").reduce((s, o) => s + Number(o.price || 0), 0);
  const byDevice = DEVICE_TYPES.map(t => ({ t, c: filtered.filter(o => o.device_type === t).length })).filter(d => d.c > 0);
  const maxD = Math.max(...byDevice.map(d => d.c), 1);

  const filteredAcc = accSales.filter(s => (s.date || "") >= from && (s.date || "") <= to);

  const techStatsPeriod = technicians.map(t => ({
    name: t.name, color: t.color || "#38bdf8",
    total: filtered.filter(o => o.technician === t.name).length,
    issued: filtered.filter(o => o.technician === t.name && o.status === "Издаден").length,
    active: filtered.filter(o => o.technician === t.name && !["Издаден","Отказан"].includes(o.status)).length,
    revenue: filtered.filter(o => o.technician === t.name && o.status === "Издаден").reduce((s, o) => s + Number(o.price || 0), 0),
    accCount: filteredAcc.filter(s => s.technician === t.name).length,
    accRevenue: filteredAcc.filter(s => s.technician === t.name).reduce((s, r) => s + Number(r.sale_price || 0) * Number(r.quantity || 1), 0),
  })).filter(t => t.total > 0 || t.accCount > 0).sort((a, b) => (b.revenue + b.accRevenue) - (a.revenue + a.accRevenue));

  const allTechNames = [...new Set(orders.map(o => o.technician).filter(Boolean))];

  const months = [];
  const startD = new Date(from); startD.setDate(1);
  const endD = new Date(to);
  let cur = new Date(startD);
  while (cur <= endD) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth(), label: MONTHS_BG[cur.getMonth()] + " " + cur.getFullYear() });
    cur.setMonth(cur.getMonth() + 1);
  }

  const monthlyTechData = months.map(({ year, month, label }) => {
    const mo = orders.filter(o => {
      if (o.status !== "Издаден") return false;
      const od = new Date(o.date_out || o.updated_at || o.date_in);
      return od.getFullYear() === year && od.getMonth() === month;
    });
    const row = { label, total: mo.reduce((s, o) => s + Number(o.price || 0), 0) };
    allTechNames.forEach(name => { row[name] = mo.filter(o => o.technician === name).reduce((s, o) => s + Number(o.price || 0), 0); });
    return row;
  });

  const techsToShow = selTech === "Всички" ? allTechNames : [selTech];

  return (
    <div className="animate-fade">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, flexWrap:"wrap", gap:8 }}>
        <h1 style={{ margin:0, fontSize:22, fontWeight:800 }}>Справки и отчети</h1>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <Btn color="#10b981" bg="#064e3b" onClick={() => onExport("tech")}>Excel Техници</Btn>
          <Btn color="#8b5cf6" bg="#2e1065" onClick={() => onExport("full")}>Excel Пълен</Btn>
        </div>
      </div>

      <Card style={{ marginBottom:16, padding:"14px 18px" }}>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end" }}>
          <Field label="От дата"><input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width:160 }} /></Field>
          <Field label="До дата"><input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width:160 }} /></Field>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:1 }}>
            {[
              ["Този месец", () => { const n=new Date(); setFrom(n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0")+"-01"); setTo(today()); }],
              ["Предишен", () => { const n=new Date(); n.setMonth(n.getMonth()-1); const y=n.getFullYear(),m=String(n.getMonth()+1).padStart(2,"0"); setFrom(y+"-"+m+"-01"); const l=new Date(y,n.getMonth()+1,0); setTo(y+"-"+m+"-"+String(l.getDate()).padStart(2,"0")); }],
              ["3 месеца", () => { const n=new Date(); n.setMonth(n.getMonth()-2); setFrom(n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0")+"-01"); setTo(today()); }],
              ["Тази година", () => { setFrom(new Date().getFullYear()+"-01-01"); setTo(today()); }],
            ].map(([label, fn]) => (
              <button key={label} onClick={fn} style={{ padding:"6px 12px", borderRadius:7, fontSize:11, fontWeight:600, cursor:"pointer", border:"1px solid #334155", background:"#0f172a", color:"#64748b" }}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{ display:"flex", gap:6, marginTop:12, flexWrap:"wrap" }}>
          {[["period","Обобщение"],["tech","По техник"],["monthly","Месечна таблица"]].map(([key,label]) => (
            <button key={key} onClick={() => setViewMode(key)} style={{
              padding:"7px 16px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", border:"none",
              background: viewMode===key ? "linear-gradient(135deg,#38bdf8,#0ea5e9)" : "#1e293b",
              color: viewMode===key ? "#fff" : "#64748b",
            }}>{label}</button>
          ))}
        </div>
      </Card>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:16 }} className="kpi-grid">
        {[
          { l:"Поръчки", v:filtered.length, c:"#3b82f6" },
          { l:"Издадени", v:filtered.filter(o=>o.status==="Издаден").length, c:"#10b981" },
          { l:"Активни", v:filtered.filter(o=>!["Издаден","Отказан"].includes(o.status)).length, c:"#f59e0b" },
          { l:"Оборот", v:fmtMoney(revenue), c:"#10b981" },
        ].map(({ l, v, c }) => (
          <Card key={l} style={{ borderLeft:`4px solid ${c}`, padding:"14px 16px" }}>
            <div style={{ fontSize:22, fontWeight:800 }}>{v}</div>
            <div style={{ fontSize:11, color:"var(--text3)", marginTop:2 }}>{l}</div>
          </Card>
        ))}
      </div>

      {viewMode === "period" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }} className="dash-grid">
          <Card>
            <div style={{ fontSize:12, color:"var(--text3)", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>По техник (период)</div>
            <div className="table-wrap">
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr>{["Техник","Поръчки","Издадени","Оборот","Акс.","Акс. приход"].map(h=><th key={h} style={{ textAlign:"left", fontSize:10, color:"var(--text3)", padding:"6px 4px", borderBottom:"1px solid #334155" }}>{h}</th>)}</tr></thead>
                <tbody>{techStatsPeriod.length > 0 ? techStatsPeriod.map(({ name, color, total, issued, revenue, accCount, accRevenue }, i) => (
                  <tr key={name} style={{ borderBottom:"1px solid #1e293b" }}>
                    <td style={{ padding:"8px 4px", fontSize:13, fontWeight:600 }}><span style={{ color, marginRight:6 }}>●</span>{i===0?"🏆 ":""}{name}</td>
                    <td style={{ padding:"8px 4px", fontSize:12, color:"var(--text2)" }}>{total}</td>
                    <td style={{ padding:"8px 4px", fontSize:12, color:"#10b981" }}>{issued}</td>
                    <td style={{ padding:"8px 4px", fontSize:13, fontWeight:700, color:"#10b981" }}>{fmtMoney(revenue)}</td>
                    <td style={{ padding:"8px 4px", fontSize:12, color:"#38bdf8" }}>{accCount}</td>
                    <td style={{ padding:"8px 4px", fontSize:12, fontWeight:700, color:"#38bdf8" }}>{fmtMoney(accRevenue)}</td>
                  </tr>
                )) : <tr><td colSpan={4} style={{ padding:20, textAlign:"center", color:"var(--text3)", fontSize:12 }}>Няма данни</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <div style={{ fontSize:12, color:"var(--text3)", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>По вид устройство</div>
            {byDevice.map(({t,c})=>(
              <div key={t} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:3 }}><span>{t}</span><span style={{ color:"var(--text3)" }}>{c}</span></div>
                <div style={{ height:6, background:"#334155", borderRadius:3 }}><div style={{ height:"100%", width:`${(c/maxD)*100}%`, background:"linear-gradient(90deg,#38bdf8,#0ea5e9)", borderRadius:3 }} /></div>
              </div>
            ))}
            {byDevice.length===0 && <p style={{ color:"var(--text3)", fontSize:12 }}>Няма данни</p>}
          </Card>
        </div>
      )}

      {viewMode === "tech" && (
        <div>
          <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
            {["Всички",...allTechNames].map(name=>(
              <button key={name} onClick={()=>setSelTech(name)} style={{
                padding:"6px 14px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", border:"none",
                background: selTech===name?"linear-gradient(135deg,#38bdf8,#0ea5e9)":"#1e293b",
                color: selTech===name?"#fff":"#64748b",
              }}>{name}</button>
            ))}
          </div>
          {(selTech==="Всички"?techStatsPeriod:techStatsPeriod.filter(t=>t.name===selTech)).map((t,i)=>(
            <Card key={t.name} style={{ marginBottom:14, borderTop:`3px solid ${t.color}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12, flexWrap:"wrap", gap:8 }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:800, color:"#f1f5f9" }}>{i===0&&selTech==="Всички"?"🏆 ":""}{t.name}</div>
                  <div style={{ fontSize:11, color:"var(--text3)", marginTop:2 }}>Период: {fmtDate(from)} — {fmtDate(to)}</div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                  {[{l:"Поръчки",v:t.total,c:"#3b82f6"},{l:"Издадени",v:t.issued,c:"#10b981"},{l:"Оборот",v:fmtMoney(t.revenue),c:"#f59e0b"}].map(({l,v,c})=>(
                    <div key={l} style={{ background:"#0f172a", borderRadius:8, padding:"10px 14px", textAlign:"center" }}>
                      <div style={{ fontSize:18, fontWeight:800, color:c }}>{v}</div>
                      <div style={{ fontSize:10, color:"var(--text3)" }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="table-wrap">
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead style={{ background:"#0a1628" }}>
                    <tr>{["№","Клиент","Устройство","Проблем","Статус","Цена","Дата"].map(h=><th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:10, color:"var(--text3)", fontWeight:700, textTransform:"uppercase" }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {filtered.filter(o=>o.technician===t.name).map(o=>(
                      <tr key={o.id} style={{ borderTop:"1px solid #0f172a" }}
                        onMouseEnter={e=>e.currentTarget.style.background="#243044"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <td style={{ padding:"7px 12px", fontSize:11, color:"#38bdf8", fontFamily:"monospace" }}>{o.id}</td>
                        <td style={{ padding:"7px 12px", fontSize:12, fontWeight:600 }}>{o.client_name}</td>
                        <td style={{ padding:"7px 12px", fontSize:11, color:"var(--text2)" }}>{o.device_type} {o.brand}</td>
                        <td style={{ padding:"7px 12px", fontSize:11, color:"var(--text3)", maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{o.problem}</td>
                        <td style={{ padding:"7px 12px" }}><Badge status={o.status} /></td>
                        <td style={{ padding:"7px 12px", fontWeight:700, color:"#10b981" }}>{fmtMoney(o.price)}</td>
                        <td style={{ padding:"7px 12px", fontSize:11, color:"var(--text3)" }}>{fmtDate(o.date_in)}</td>
                      </tr>
                    ))}
                    {filtered.filter(o=>o.technician===t.name).length===0&&(
                      <tr><td colSpan={7} style={{ padding:16, textAlign:"center", color:"var(--text3)", fontSize:12 }}>Няма поръчки</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
          {techStatsPeriod.length===0&&<Card style={{ textAlign:"center", padding:40 }}><div style={{ fontSize:32, marginBottom:8 }}>📭</div><div style={{ color:"var(--text3)" }}>Няма данни за избрания период</div></Card>}
        </div>
      )}

      {viewMode === "monthly" && (
        <div>
          <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
            {["Всички",...allTechNames].map(name=>(
              <button key={name} onClick={()=>setSelTech(name)} style={{
                padding:"6px 14px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", border:"none",
                background: selTech===name?"linear-gradient(135deg,#38bdf8,#0ea5e9)":"#1e293b",
                color: selTech===name?"#fff":"#64748b",
              }}>{name}</button>
            ))}
          </div>
          <Card style={{ padding:0, overflow:"hidden", marginBottom:14 }}>
            <div style={{ padding:"12px 16px", background:"#0a1628", fontSize:12, fontWeight:700, color:"var(--text3)" }}>
              Оборот по месеци{selTech!=="Всички"?` — ${selTech}`:" — всички техници"}
            </div>
            <div className="table-wrap">
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead style={{ background:"#0f172a" }}>
                  <tr>
                    <th style={{ padding:"10px 16px", textAlign:"left", fontSize:11, color:"#64748b", fontWeight:700 }}>Месец</th>
                    {techsToShow.map(name=>{ const tc=technicians.find(t=>t.name===name); return <th key={name} style={{ padding:"10px 16px", textAlign:"right", fontSize:11, color:tc?.color||"#38bdf8", fontWeight:700 }}>{name}</th>; })}
                    {selTech==="Всички"&&<th style={{ padding:"10px 16px", textAlign:"right", fontSize:11, color:"#10b981", fontWeight:700 }}>ОБЩО</th>}
                  </tr>
                </thead>
                <tbody>
                  {monthlyTechData.map((row,i)=>{
                    const rowTotal=techsToShow.reduce((s,n)=>s+(row[n]||0),0);
                    return (
                      <tr key={row.label} style={{ borderTop:"1px solid #0f172a", background:i%2===0?"transparent":"rgba(255,255,255,.02)" }}
                        onMouseEnter={e=>e.currentTarget.style.background="#243044"}
                        onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"transparent":"rgba(255,255,255,.02)"}>
                        <td style={{ padding:"10px 16px", fontSize:13, fontWeight:600, color:"#f1f5f9" }}>{row.label}</td>
                        {techsToShow.map(name=>(
                          <td key={name} style={{ padding:"10px 16px", textAlign:"right", fontSize:13, fontWeight:row[name]>0?700:400, color:row[name]>0?"#10b981":"#334155" }}>
                            {row[name]>0?fmtMoney(row[name]):"—"}
                          </td>
                        ))}
                        {selTech==="Всички"&&<td style={{ padding:"10px 16px", textAlign:"right", fontSize:14, fontWeight:800, color:"#f59e0b" }}>{rowTotal>0?fmtMoney(rowTotal):"—"}</td>}
                      </tr>
                    );
                  })}
                  {monthlyTechData.length>1&&(()=>{
                    const grandTotal=techsToShow.reduce((s,n)=>s+monthlyTechData.reduce((ms,row)=>ms+(row[n]||0),0),0);
                    return (
                      <tr style={{ borderTop:"2px solid #334155", background:"#0f172a" }}>
                        <td style={{ padding:"12px 16px", fontSize:13, fontWeight:800, color:"#f59e0b" }}>ОБЩО</td>
                        {techsToShow.map(name=>{ const sum=monthlyTechData.reduce((s,row)=>s+(row[name]||0),0); return <td key={name} style={{ padding:"12px 16px", textAlign:"right", fontSize:13, fontWeight:800, color:"#f59e0b" }}>{fmtMoney(sum)}</td>; })}
                        {selTech==="Всички"&&<td style={{ padding:"12px 16px", textAlign:"right", fontSize:15, fontWeight:900, color:"#10b981" }}>{fmtMoney(grandTotal)}</td>}
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <div style={{ fontSize:12, color:"var(--text3)", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>Визуализация</div>
            {monthlyTechData.map(row=>{
              const rowTotal=techsToShow.reduce((s,n)=>s+(row[n]||0),0);
              const maxVal=Math.max(...monthlyTechData.map(r=>techsToShow.reduce((s,n)=>s+(r[n]||0),0)),1);
              return (
                <div key={row.label} style={{ marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                    <span style={{ color:"#f1f5f9", fontWeight:600 }}>{row.label}</span>
                    <span style={{ color:"#10b981", fontWeight:700 }}>{rowTotal>0?fmtMoney(rowTotal):"—"}</span>
                  </div>
                  <div style={{ height:8, background:"#334155", borderRadius:4, overflow:"hidden", display:"flex" }}>
                    {techsToShow.map(name=>{ const tc=technicians.find(t=>t.name===name); const w=rowTotal>0?(row[name]||0)/maxVal*100:0; return w>0?<div key={name} style={{ height:"100%", width:`${w}%`, background:tc?.color||"#38bdf8", transition:"width .4s" }} title={`${name}: ${fmtMoney(row[name]||0)}`}/>:null; })}
                  </div>
                </div>
              );
            })}
            {selTech==="Всички"&&(
              <div style={{ display:"flex", gap:12, marginTop:10, flexWrap:"wrap" }}>
                {allTechNames.map(name=>{ const tc=technicians.find(t=>t.name===name); return <div key={name} style={{ display:"flex", alignItems:"center", gap:5 }}><div style={{ width:10, height:10, borderRadius:"50%", background:tc?.color||"#38bdf8" }}/><span style={{ fontSize:11, color:"var(--text3)" }}>{name}</span></div>; })}
              </div>
            )}
          </Card>
        </div>
      )}

      {viewMode==="period" && filtered.length>0 && (
        <Card style={{ padding:0, overflow:"hidden", marginTop:14 }}>
          <div style={{ padding:"12px 16px", borderBottom:"1px solid #0f172a", fontSize:12, fontWeight:600, color:"var(--text3)" }}>Поръчки ({filtered.length})</div>
          <div className="table-wrap">
            <table>
              <thead style={{ background:"#0a1628" }}><tr>{["№","Клиент","Устройство","Техник","Статус","Цена","Дата"].map(h=><th key={h} style={{ padding:"9px 13px", textAlign:"left", fontSize:10, color:"var(--text3)", fontWeight:700, textTransform:"uppercase", letterSpacing:.5 }}>{h}</th>)}</tr></thead>
              <tbody>{filtered.slice(0,100).map(o=>(
                <tr key={o.id} style={{ borderTop:"1px solid #0f172a" }}>
                  <td style={{ padding:"8px 13px", fontSize:11, color:"#38bdf8", fontFamily:"monospace" }}>{o.id}</td>
                  <td style={{ padding:"8px 13px", fontSize:12, fontWeight:600 }}>{o.client_name}</td>
                  <td style={{ padding:"8px 13px", fontSize:11, color:"var(--text2)" }}>{o.device_type} {o.brand}</td>
                  <td style={{ padding:"8px 13px", fontSize:12 }}>{o.technician||"—"}</td>
                  <td style={{ padding:"8px 13px" }}><Badge status={o.status}/></td>
                  <td style={{ padding:"8px 13px", fontSize:13, fontWeight:700, color:"#10b981" }}>{fmtMoney(o.price)}</td>
                  <td style={{ padding:"8px 13px", fontSize:11, color:"var(--text3)" }}>{fmtDate(o.date_in)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}


// ═══════════════════════════════ TECHNICIANS TAB ══════════════════════════════
function TechniciansTab({ technicians, orders, onSave, onDelete, onExport }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", color: "#38bdf8" });
  const [editing, setEditing] = useState(null);
  const COLORS = ["#38bdf8", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#ef4444", "#06b6d4", "#84cc16"];
  const submit = () => {
    if (!form.name?.trim()) { alert("Въведи име на техника!"); return; }
    onSave(editing ? { ...editing, ...form } : { ...form });
    setForm({ name: "", phone: "", email: "", color: "#38bdf8" });
    setEditing(null);
  };
  return (
    <div className="animate-fade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Техници</h1>
        <Btn color="#10b981" bg="#064e3b" onClick={onExport}>📊 Excel</Btn>
      </div>
      <Card style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, marginBottom: 14 }}>{editing ? "Редактирай техник" : "Добави нов техник"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 12, alignItems: "flex-end" }} className="form-grid">
          <Field label="Три имена *"><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Иван Петров" onKeyDown={e => e.key === "Enter" && submit()} /></Field>
          <Field label="Телефон"><input value={form.phone || ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="0888 123 456" /></Field>
          <Field label="Имейл"><input value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="ivan@serviz.bg" /></Field>
          <div>
            <label style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: .4, display: "block", marginBottom: 4 }}>Цвят</label>
            <div style={{ display: "flex", gap: 5 }}>
              {COLORS.map(c => <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: form.color === c ? "2px solid #fff" : "2px solid transparent", cursor: "pointer", padding: 0 }} />)}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
          <PrimaryBtn onClick={submit}>{editing ? "💾 Обнови" : "+ Добави техник"}</PrimaryBtn>
          {editing && <button onClick={() => { setEditing(null); setForm({ name: "", phone: "", email: "", color: "#38bdf8" }); }} style={{ background: "#334155", color: "#94a3b8", border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>Отказ</button>}
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }} className="tech-grid">
        {technicians.map((t, i) => {
          const to = orders.filter(o => o.technician === t.name);
          const rev = to.filter(o => o.status === "Издаден").reduce((s, o) => s + Number(o.price || 0), 0);
          const act = to.filter(o => !["Издаден", "Отказан"].includes(o.status)).length;
          return (
            <Card key={t.id || i} style={{ borderTop: `3px solid ${t.color || "#38bdf8"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontSize: 32 }}>👨‍🔧</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <Btn color="#3b82f6" onClick={() => { setEditing(t); setForm({ name: t.name, phone: t.phone || "", email: t.email || "", color: t.color || "#38bdf8" }); }} title="Редактирай">✏️</Btn>
                  <Btn color="#ef4444" onClick={() => { if (confirm(`Изтрий ${t.name}?`)) onDelete(t.id); }} title="Изтрий">🗑️</Btn>
                </div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, margin: "8px 0 2px" }}>{i === 0 && to.length > 0 ? "🏆 " : ""}{t.name}</div>
              {t.phone && <div style={{ fontSize: 12, color: "var(--text3)" }}>{t.phone}</div>}
              {t.email && <div style={{ fontSize: 12, color: "var(--text3)" }}>{t.email}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
                {[{ l: "Общо", v: to.length, c: "var(--text)" }, { l: "Активни", v: act, c: "#f59e0b" }, { l: "Издадени", v: to.filter(o => o.status === "Издаден").length, c: "#10b981" }].map(({ l, v, c }) => (
                  <div key={l} style={{ background: "#0f172a", borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div>
                    <div style={{ fontSize: 10, color: "var(--text3)" }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 15, fontWeight: 700, color: "#10b981" }}>{fmtMoney(rev)} <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 400 }}>оборот</span></div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════ SETTINGS MODAL ════════════════════════════════
function SettingsModal({ settings, onSave, onClose, connected }) {
  const [form, setForm] = useState({ sb_url: "", sb_key: "", smtpHost: "", smtpPort: "587", smtpUser: "", smtpPass: "", senderName: "", ...settings });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#1e293b", borderRadius: 16, width: "100%", maxWidth: 620, maxHeight: "90vh", overflow: "auto", boxShadow: "0 30px 80px rgba(0,0,0,.7)" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>⚙️ Настройки</h2>
            <div style={{ fontSize: 11, color: connected ? "#10b981" : "#ef4444", marginTop: 2 }}>{connected ? "● Свързан с базата данни" : "● Не е свързан — конфигурирай Supabase"}</div>
          </div>
          <button onClick={onClose} style={{ background: "#334155", border: "none", color: "#94a3b8", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#38bdf8", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              🗄️ Supabase — База данни (синхрон между компютри)
            </div>
            <div style={{ background: "#0f172a", borderRadius: 8, padding: 12, fontSize: 11, color: "var(--text3)", lineHeight: 1.7, marginBottom: 12 }}>
              1️⃣ Отвори <b style={{ color: "#38bdf8" }}>supabase.com</b> → New project (безплатно)<br />
              2️⃣ Изпълни SQL от файл <b style={{ color: "#38bdf8" }}>sql/schema.sql</b> в SQL Editor<br />
              3️⃣ Отвори <b>Settings → API</b> и копирай URL и anon key<br />
              4️⃣ Постави ги по-долу и кликни Запази
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Field label="Supabase Project URL"><input value={form.sb_url || ""} onChange={e => set("sb_url", e.target.value)} placeholder="https://xxxxxxxxxxxx.supabase.co" /></Field>
              <Field label="Supabase Anon Key"><input value={form.sb_key || ""} onChange={e => set("sb_key", e.target.value)} placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6Ikp..." type="password" /></Field>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#38bdf8", marginBottom: 10 }}>📧 Имейл (изпращане при готово устройство)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="SMTP сървър"><input value={form.smtpHost || ""} onChange={e => set("smtpHost", e.target.value)} placeholder="smtp.gmail.com" /></Field>
              <Field label="SMTP порт"><input value={form.smtpPort || "587"} onChange={e => set("smtpPort", e.target.value)} placeholder="587" /></Field>
              <Field label="Имейл адрес"><input value={form.smtpUser || ""} onChange={e => set("smtpUser", e.target.value)} placeholder="serviz@gmail.com" /></Field>
              <Field label="Парола / App Password"><input type="password" value={form.smtpPass || ""} onChange={e => set("smtpPass", e.target.value)} placeholder="••••••••••••" /></Field>
              <Field label="Наименование на сервиза" style={{ gridColumn: "1/-1" }}><input value={form.senderName || ""} onChange={e => set("senderName", e.target.value)} placeholder="GSM Сервиз Иван" /></Field>
            </div>
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 8 }}>💡 За Gmail: използвай App Password от Google Account → Security → 2FA → App passwords</div>
          </div>
        </div>
        <div style={{ padding: "0 22px 18px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#38bdf8", marginBottom: 8 }}>🗄️ Резервно копие</div>
          <BackupButton />
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid #334155", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "#334155", color: "#94a3b8", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600 }}>Затвори</button>
          <PrimaryBtn onClick={() => onSave(form)}>💾 Запази настройките</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

function BackupButton() {
  const [loading, setLoading] = useState(false);
  const doBackup = async () => {
    const sb = getSupabase();
    if (!sb) { alert("Няма връзка с базата данни!"); return; }
    setLoading(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const tables = [
        ["Сервиз", "orders"], ["Склад", "inventory"], ["Разходи", "expenses"],
        ["Каса", "cash_register"], ["Аксесоари", "accessory_sales"],
        ["Изкупуване", "buybacks"], ["Продажба части", "parts_sales"],
        ["Продажба телефони", "phone_sales"], ["Поръчки части", "stock_orders"],
        ["Задължения", "supplier_debts"], ["Техници", "technicians"],
        ["Кошче", "trash"], ["Месечни разходи", "monthly_expenses"],
      ];
      for (const [name, table] of tables) {
        try {
          let all = [], page = 0;
          while (true) {
            const { data, error } = await sb.from(table).select("*").range(page * 1000, (page + 1) * 1000 - 1);
            if (error || !data || data.length === 0) break;
            all = [...all, ...data];
            if (data.length < 1000) break;
            page++;
          }
          if (all.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(all), name);
        } catch (e) { console.warn("Skip", table, e.message); }
      }
      XLSX.writeFile(wb, `RepairPro_Backup_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) { alert("Грешка: " + e.message); }
    setLoading(false);
  };
  return (
    <button onClick={doBackup} disabled={loading} style={{
      background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff",
      border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700,
      fontSize: 13, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
    }}>
      {loading ? "⏳ Изтегляне..." : "📥 Изтегли пълен backup (Excel)"}
    </button>
  );
}

// ═══════════════════════════════ IMPORT MODAL ═════════════════════════════════
function ImportModal({ type, onImport, onClose, syncing }) {
  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [selSheet, setSelSheet] = useState(0);
  const [preview, setPreview] = useState([]);
  const [mapped, setMapped] = useState([]);
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const fileRef = useRef();
  const isOrders = type === "orders";

  const handleFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setError("");
    try {
      const parsed = await parseExcelFile(f);
      setSheets(parsed);
      selectSheet(parsed, 0);
      setStep(2);
    } catch (err) {
      setError("Грешка при четене на файла: " + err.message);
    }
  };

  const selectSheet = (parsedSheets, idx) => {
    setSelSheet(idx);
    const rows = parsedSheets[idx]?.rows || [];
    setPreview(rows.slice(0, 5));
    const m = isOrders ? mapRowsToOrders(rows) : mapRowsToInventory(rows);
    setMapped(m);
  };

  const allCols = preview.length > 0 ? Object.keys(preview[0]) : [];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#1e293b", borderRadius: 16, width: "100%", maxWidth: 860, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 30px 80px rgba(0,0,0,.7)" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>📥 Импорт от Excel — {isOrders ? "Поръчки" : "Склад"}</h2>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Стъпка {step} от 3</div>
          </div>
          <button onClick={onClose} style={{ background: "#334155", border: "none", color: "#94a3b8", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 22 }}>
          {step === 1 && (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Избери Excel файл за импорт</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 24, lineHeight: 1.7 }}>
                Поддържани формати: <b>.xlsx</b>, <b>.xls</b>, <b>.csv</b><br />
                Колоните се разпознават автоматично — не е нужен специален формат.<br />
                {isOrders
                  ? "Нужни колони: Клиент, Телефон (задължителни) + всякакви допълнителни"
                  : "Нужни колони: Наименование (задължително) + всякакви допълнителни"
                }
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: "none" }} />
              <button onClick={() => fileRef.current.click()} style={{
                background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff",
                border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: "pointer"
              }}>📂 Избери файл</button>
              {error && <div style={{ color: "#ef4444", marginTop: 16, fontSize: 12 }}>{error}</div>}

              <div style={{ marginTop: 28, padding: 16, background: "#0f172a", borderRadius: 10, textAlign: "left" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 8 }}>💡 Нямаш готов файл? Използвай тези имена на колони:</div>
                <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", lineHeight: 2 }}>
                  {isOrders
                    ? "Клиент | Телефон | Имейл | Тип устройство | Марка | Модел | Проблем | Статус | Техник | Цена | Дата приемане"
                    : "Наименование | Категория | Наличност | Мин. наличност | Цена | Доставчик"
                  }
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              {sheets.length > 1 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Избери лист от файла:</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {sheets.map((s, i) => (
                      <button key={i} onClick={() => selectSheet(sheets, i)} style={{
                        padding: "5px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
                        background: selSheet === i ? "#38bdf8" : "#334155", color: selSheet === i ? "#0f172a" : "#94a3b8"
                      }}>{s.name} ({s.rows.length} реда)</button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <div style={{ background: "#0f172a", borderRadius: 8, padding: "10px 16px", fontSize: 13 }}>
                  <span style={{ color: "#64748b" }}>Редове в Excel: </span>
                  <span style={{ fontWeight: 700 }}>{sheets[selSheet]?.rows.length || 0}</span>
                </div>
                <div style={{ background: "#064e3b", borderRadius: 8, padding: "10px 16px", fontSize: 13 }}>
                  <span style={{ color: "#6ee7b7" }}>За импорт: </span>
                  <span style={{ fontWeight: 700, color: "#10b981" }}>{mapped.length}</span>
                </div>
                {(sheets[selSheet]?.rows.length - mapped.length) > 0 && (
                  <div style={{ background: "#450a0a", borderRadius: 8, padding: "10px 16px", fontSize: 13 }}>
                    <span style={{ color: "#fca5a5" }}>Пропуснати (празни): </span>
                    <span style={{ fontWeight: 700, color: "#ef4444" }}>{sheets[selSheet]?.rows.length - mapped.length}</span>
                  </div>
                )}
              </div>

              {preview.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>
                    Преглед на Excel данните (първите 5 реда):
                  </div>
                  <div style={{ overflow: "auto", borderRadius: 8, border: "1px solid #334155" }}>
                    <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: "100%" }}>
                      <thead style={{ background: "#0f172a" }}>
                        <tr>{allCols.map(c => <th key={c} style={{ padding: "8px 12px", textAlign: "left", color: "#38bdf8", fontWeight: 700, whiteSpace: "nowrap", borderRight: "1px solid #1e293b" }}>{c}</th>)}</tr>
                      </thead>
                      <tbody>
                        {preview.map((row, i) => (
                          <tr key={i} style={{ borderTop: "1px solid #1e293b" }}>
                            {allCols.map(c => <td key={c} style={{ padding: "6px 12px", color: "#cbd5e1", whiteSpace: "nowrap", borderRight: "1px solid #1e293b", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{String(row[c] || "")}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {mapped.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>
                    Как ще се запишат данните (първите 5):
                  </div>
                  <div style={{ overflow: "auto", borderRadius: 8, border: "1px solid #064e3b", background: "#0f1f0f" }}>
                    <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: "100%" }}>
                      <thead style={{ background: "#052e16" }}>
                        <tr>
                          {isOrders
                            ? ["ID", "Клиент", "Телефон", "Устройство", "Проблем", "Статус", "Техник", "Цена", "Дата"].map(h => <th key={h} style={{ padding: "7px 11px", textAlign: "left", color: "#6ee7b7", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>)
                            : ["Наименование", "Категория", "Наличност", "Мин.", "Цена", "Доставчик"].map(h => <th key={h} style={{ padding: "7px 11px", textAlign: "left", color: "#6ee7b7", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>)
                          }
                        </tr>
                      </thead>
                      <tbody>
                        {mapped.slice(0, 5).map((row, i) => (
                          <tr key={i} style={{ borderTop: "1px solid #064e3b" }}>
                            {isOrders ? [
                              <td key="id" style={{ padding: "6px 11px", color: "#38bdf8", fontFamily: "monospace", fontSize: 10 }}>{row.id}</td>,
                              <td key="c" style={{ padding: "6px 11px", fontWeight: 600 }}>{row.client_name || "—"}</td>,
                              <td key="p" style={{ padding: "6px 11px", color: "#94a3b8" }}>{row.phone || "—"}</td>,
                              <td key="d" style={{ padding: "6px 11px" }}>{row.device_type || ""} {row.brand || ""} {row.model || ""}</td>,
                              <td key="pr" style={{ padding: "6px 11px", color: "#94a3b8" }}>{row.problem || "—"}</td>,
                              <td key="s" style={{ padding: "6px 11px" }}><span style={{ background: "#1e3a5f", color: "#38bdf8", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700 }}>{row.status}</span></td>,
                              <td key="t" style={{ padding: "6px 11px" }}>{row.technician || "—"}</td>,
                              <td key="pr2" style={{ padding: "6px 11px", color: "#10b981", fontWeight: 700 }}>{row.price || 0} лв.</td>,
                              <td key="dt" style={{ padding: "6px 11px", color: "#64748b" }}>{row.date_in || "—"}</td>,
                            ] : [
                              <td key="n" style={{ padding: "6px 11px", fontWeight: 600 }}>{row.name || "—"}</td>,
                              <td key="c" style={{ padding: "6px 11px", color: "#94a3b8" }}>{row.category || "—"}</td>,
                              <td key="q" style={{ padding: "6px 11px", color: "#10b981", fontWeight: 700 }}>{row.quantity}</td>,
                              <td key="m" style={{ padding: "6px 11px", color: "#64748b" }}>{row.min_qty}</td>,
                              <td key="p" style={{ padding: "6px 11px", color: "#10b981", fontWeight: 700 }}>{row.price} лв.</td>,
                              <td key="s" style={{ padding: "6px 11px", color: "#94a3b8" }}>{row.supplier || "—"}</td>,
                            ]}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {mapped.length === 0 && (
                <div style={{ background: "#450a0a", borderRadius: 10, padding: 16, color: "#fca5a5", fontSize: 13 }}>
                  ⚠️ Не са разпознати валидни редове. Провери дали колоните имат правилни имена.
                  {isOrders ? ' Нужни са поне "Клиент" и "Телефон".' : ' Нужно е поне "Наименование".'}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: "14px 22px", borderTop: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {step === 2 && mapped.length > 0 && `Готови за импорт: ${mapped.length} записа`}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ background: "#334155", color: "#94a3b8", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600 }}>Отказ</button>
            {step === 2 && (
              <>
                <button onClick={() => setStep(1)} style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600 }}>← Назад</button>
                <PrimaryBtn
                  onClick={() => onImport(mapped, type)}
                  disabled={mapped.length === 0 || syncing}
                  color="linear-gradient(135deg,#f59e0b,#d97706)"
                >
                  {syncing ? "⏳ Импортиране..." : `📥 Импортирай ${mapped.length} записа`}
                </PrimaryBtn>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════ PARTS SELECTOR ═══════════════════════════════
function PartsSelector({ inventory, addPart, removePart, parts, price }) {
  const [search, setSearch] = useState("");
  const [selCat, setSelCat] = useState("Всички");

  const available = inventory.filter(i => Number(i.quantity) > 0);
  const cats = ["Всички", ...new Set(available.map(i => i.category).filter(Boolean))];

  const filtered = available.filter(i => {
    const matchCat = selCat === "Всички" || i.category === selCat;
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const partsTotal = parts.reduce((s, p) => s + Number(p.price || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>
          Добави части от склада
        </div>
        <input
          placeholder="🔍  Търси артикул..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {cats.map(c => (
            <button key={c} onClick={() => setSelCat(c)} style={{
              padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
              cursor: "pointer", border: "none",
              background: selCat === c ? "#38bdf8" : "#1e293b",
              color: selCat === c ? "#0f172a" : "#64748b"
            }}>{c}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 180, overflow: "auto", padding: 4 }}>
        {filtered.map(i => (
          <button key={i.id} onClick={() => addPart(i)} style={{
            background: "#0f172a", color: "#94a3b8",
            border: "1px solid #334155", borderRadius: 7,
            padding: "6px 12px", fontSize: 11, cursor: "pointer",
            textAlign: "left", transition: "border-color .15s",
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#38bdf8"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#334155"}
          >
            <div style={{ fontWeight: 600, color: "#e2e8f0", marginBottom: 2 }}>+ {i.name}</div>
            <div style={{ display: "flex", gap: 8, fontSize: 10 }}>
              <span style={{ color: "#64748b" }}>{i.category}</span>
              <span style={{ color: "#f59e0b" }}>{i.quantity} бр.</span>
              <span style={{ color: "#10b981", fontWeight: 700 }}>€ {Number(i.price).toFixed(2)}</span>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p style={{ color: "var(--text3)", fontSize: 12, padding: "12px 0" }}>
            {available.length === 0 ? "Няма налични артикули в склада" : "Няма резултати от търсенето"}
          </p>
        )}
      </div>

      {parts.length > 0 && (
        <div style={{ background: "#0f172a", borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, marginBottom: 10 }}>
            Вложени части ({parts.length})
          </div>
          {parts.map((p, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "7px 0", borderBottom: i < parts.length - 1 ? "1px solid #1e293b" : "none"
            }}>
              <span style={{ fontSize: 13 }}>{p.name}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: "#10b981", fontWeight: 700 }}>€ {Number(p.price).toFixed(2)}</span>
                <button onClick={() => removePart(i)} style={{
                  background: "#7f1d1d", color: "#fca5a5", border: "none",
                  borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontSize: 11
                }}>✕</button>
              </div>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #334155", marginTop: 10, paddingTop: 10, display: "flex", gap: 20, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#f59e0b", fontWeight: 700 }}>Части: € {partsTotal.toFixed(2)}</span>
            <span style={{ fontSize: 13, color: "#10b981", fontWeight: 700 }}>Труд: € {Number(price || 0).toFixed(2)}</span>
            <span style={{ fontSize: 14, color: "#38bdf8", fontWeight: 800 }}>Общо: € {(Number(price || 0) + partsTotal).toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
// КРАЙ НА ЧАСТ 3
// ЧАСТ 4
// ═══════════════════════════════ DAILY REPORT ══════════════════════════════════
function DailyReport({ orders, inventory, expenses = [], accSales = [], partsSales = [], phoneSales = [], cashReg = [] }) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [bankAmount, setBankAmount] = useState(() => { try { return Number(localStorage.getItem("rp_bank_" + new Date().toISOString().split("T")[0]) || 0); } catch { return 0; } });
  const [externalCash, setExternalCash] = useState(() => { try { return Number(localStorage.getItem("rp_ext_" + new Date().toISOString().split("T")[0]) || 0); } catch { return 0; } });

  const toDate = (val) => {
    if (!val) return "";
    return String(val).slice(0, 10);
  };

  const issuedToday = orders.filter(o =>
    o.status === "Издаден" && (
      toDate(o.date_out) === date ||
      toDate(o.updated_at) === date
    )
  );

  const receivedToday = orders.filter(o => toDate(o.date_in) === date);

  const dayOrders = orders.filter(o =>
    toDate(o.date_in) === date ||
    toDate(o.date_out) === date ||
    toDate(o.updated_at) === date
  );

  const revenue = issuedToday.reduce((s, o) => s + Number(o.total_price || o.price || 0), 0);
  const extServiceCost = issuedToday.reduce((s, o) => s + Number(o.external_service_price || 0), 0);

  const accRevToday = accSales.filter(s => toDate(s.date) === date).reduce((s, r) => s + Number(r.sale_price || 0) * Number(r.quantity || 1), 0);
  const partsRevToday = partsSales.filter(s => toDate(s.date) === date && s.payment_status === "Платена").reduce((s, r) => s + Number(r.sale_price || 0) * Number(r.quantity || 1), 0);
  const phoneRevToday = phoneSales.filter(s => toDate(s.date) === date).reduce((s, r) => s + Number(r.sale_price || 0), 0);
  const allExpensesToday = expenses.filter(e => toDate(e.date) === date);
  const expensesToday = allExpensesToday.filter(e => e.from_cash !== false).reduce((s, e) => s + Number(e.amount || 0), 0);
  const expensesNotCash = allExpensesToday.filter(e => e.from_cash === false).reduce((s, e) => s + Number(e.amount || 0), 0);
  const cashEntry = cashReg.find(c => c.date === date);
  const openingCash = Number(cashEntry?.opening_cash || 0);
  const totalRevenue = revenue + accRevToday + partsRevToday + phoneRevToday;

  // *** Само приходи в брой ***
  const cashRevenue = issuedToday.filter(o => o.payment_method === "В брой").reduce((s, o) => s + Number(o.total_price || o.price || 0), 0);
  const accCash = accSales.filter(s => toDate(s.date) === date && s.payment_method === "В брой").reduce((s, r) => s + Number(r.sale_price || 0) * Number(r.quantity || 1), 0);
  const partsCash = partsSales.filter(s => toDate(s.date) === date && s.payment_status === "Платена" && s.payment_method === "В брой").reduce((s, r) => s + Number(r.sale_price || 0) * Number(r.quantity || 1), 0);
  const phoneCash = phoneSales.filter(s => toDate(s.date) === date && s.payment_method === "В брой").reduce((s, r) => s + Number(r.sale_price || 0), 0);
  const totalCashIn = cashRevenue + accCash + partsCash + phoneCash;

  const cashNow = openingCash + totalCashIn - expensesToday;
  const totalAllCash = cashNow + Number(bankAmount || 0) + Number(externalCash || 0);

  const paymentBreakdown = ["В брой", "С карта", "Банка", "Еконт", "Спиди", "Не е платен"].map(pm => ({
    method: pm,
    count: issuedToday.filter(o => o.payment_method === pm).length,
    total: issuedToday.filter(o => o.payment_method === pm).reduce((s, o) => s + Number(o.price || 0), 0),
  })).filter(p => p.count > 0);
  const unpaid = issuedToday.filter(o => !o.payment_method || o.payment_method === "Не е платен").reduce((s, o) => s + Number(o.price || 0), 0);

  const partsCost = receivedToday.reduce((s, o) => {
    const parts = o.parts || [];
    return s + parts.reduce((ps, p) => ps + Number(p.price || 0), 0);
  }, 0);

  const profit = totalRevenue - partsCost - extServiceCost - expensesToday;

  const techDay = [...new Set(dayOrders.map(o => o.technician).filter(Boolean))].map(t => ({
    name: t,
    received: receivedToday.filter(o => o.technician === t).length,
    issued: issuedToday.filter(o => o.technician === t).length,
    revenue: issuedToday.filter(o => o.technician === t).reduce((s, o) => s + Number(o.price || 0), 0),
  }));

  const printReport = () => {
    const w = window.open("", "_blank");
    const fmtD = (d) => d ? new Date(d).toLocaleDateString("bg-BG") : "—";
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Дневен отчет ${date}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:30px;color:#111;max-width:720px;margin:auto}
      h1{font-size:20px;border-bottom:3px solid #1a56db;padding-bottom:8px;color:#1a56db}
      h2{font-size:14px;margin:20px 0 8px;color:#334155}
      table{width:100%;border-collapse:collapse;margin:10px 0;font-size:12px}
      td,th{border:1px solid #ddd;padding:7px 10px}
      th{background:#f3f4f6;font-weight:700}
      .kpi{display:flex;gap:16px;margin:16px 0}
      .kpi-box{flex:1;border:2px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center}
      .kpi-box.green{border-color:#10b981;background:#f0fdf4}
      .kpi-box.red{border-color:#ef4444;background:#fef2f2}
      .kpi-box.blue{border-color:#3b82f6;background:#eff6ff}
      .kpi-box .val{font-size:22px;font-weight:800;margin:4px 0}
      .kpi-box .lbl{font-size:11px;color:#555}
    </style></head><body>
    <h1>🧾 ДНЕВЕН ОТЧЕТ — ${fmtD(date)}</h1>
    <div class="kpi">
      <div class="kpi-box green"><div class="val">€ ${revenue.toFixed(2)}</div><div class="lbl">Приходи (издадени)</div></div>
      <div class="kpi-box red"><div class="val">€ ${partsCost.toFixed(2)}</div><div class="lbl">Разходи (части)</div></div>
      <div class="kpi-box blue"><div class="val">€ ${profit.toFixed(2)}</div><div class="lbl">Нетна печалба</div></div>
    </div>
    <div class="kpi">
      <div class="kpi-box"><div class="val">${receivedToday.length}</div><div class="lbl">Приети устройства</div></div>
      <div class="kpi-box"><div class="val">${issuedToday.length}</div><div class="lbl">Издадени устройства</div></div>
      <div class="kpi-box"><div class="val">${dayOrders.length}</div><div class="lbl">Всички активни</div></div>
    </div>
    ${techDay.length > 0 ? `<h2>По техник</h2>
    <table><thead><tr><th>Техник</th><th>Приети</th><th>Издадени</th><th>Приход</th></tr></thead><tbody>
    ${techDay.map(t => `<tr><td>${t.name}</td><td>${t.received}</td><td>${t.issued}</td><td><b>€ ${t.revenue.toFixed(2)}</b></td></tr>`).join("")}
    </tbody></table>` : ""}
    ${issuedToday.length > 0 ? `<h2>Издадени устройства</h2>
    <table><thead><tr><th>№</th><th>Клиент</th><th>Устройство</th><th>Техник</th><th>Цена</th></tr></thead><tbody>
    ${issuedToday.map(o => `<tr><td style="font-family:monospace">${o.id}</td><td>${o.client_name}</td><td>${o.device_type || ""} ${o.brand || ""} ${o.model || ""}</td><td>${o.technician || "—"}</td><td><b>€ ${Number(o.price || 0).toFixed(2)}</b></td></tr>`).join("")}
    </tbody></table>` : ""}
    ${receivedToday.length > 0 ? `<h2>Приети устройства</h2>
    <table><thead><tr><th>№</th><th>Клиент</th><th>Устройство</th><th>Проблем</th><th>Техник</th></tr></thead><tbody>
    ${receivedToday.map(o => `<tr><td style="font-family:monospace">${o.id}</td><td>${o.client_name}</td><td>${o.device_type || ""} ${o.brand || ""} ${o.model || ""}</td><td>${o.problem || ""}</td><td>${o.technician || "—"}</td></tr>`).join("")}
    </tbody></table>` : ""}
    <p style="font-size:11px;color:#999;margin-top:20px;text-align:center">RepairPro — Дневен отчет генериран на ${new Date().toLocaleString("bg-BG")}</p>
    <script>window.onload=()=>{window.print();}</script>
    </body></html>`);
    w.document.close();
  };

  const exportDayExcel = () => {
    exportDailyReport({
      date,
      receivedToday, issuedToday,
      revenue, accRevToday, partsRevToday, phoneRevToday,
      totalRevenue, expensesToday, extServiceCost, partsCost, profit,
      openingCash, cashNow,
      paymentBreakdown,
      techDay,
      expenses: expenses.filter(e => toDate(e.date) === date),
      accSalesDay: accSales.filter(s => toDate(s.date) === date),
      partsSalesDay: partsSales.filter(s => toDate(s.date) === date),
      phoneSalesDay: phoneSales.filter(s => toDate(s.date) === date),
    });
  };

  return (
    <div className="animate-fade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🧾 Дневен отчет</h1>
          <p style={{ margin: "3px 0 0", color: "var(--text3)", fontSize: 12 }}>Приходи и разходи за избран ден</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn color="#10b981" bg="#064e3b" onClick={exportDayExcel}>📊 Excel</Btn>
          <Btn color="#8b5cf6" bg="#2e1065" onClick={printReport}>🖨️ Принтирай</Btn>
        </div>
      </div>

      <Card style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 14 }}>
        <Field label="Избери дата">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: 180 }} />
        </Field>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={() => { const d = new Date(); setDate(d.toISOString().split("T")[0]); }} style={{ background: "#1e293b", color: "#64748b", border: "1px solid #334155", borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontSize: 12 }}>Днес</button>
          <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 1); setDate(d.toISOString().split("T")[0]); }} style={{ background: "#1e293b", color: "#64748b", border: "1px solid #334155", borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontSize: 12 }}>Вчера</button>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 14 }} className="kpi-grid">
        <Card style={{ borderLeft: "4px solid #10b981", padding: "14px 16px" }}>
          <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 3 }}>💰 ОБЩО ПРИХОДИ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#10b981" }}>€ {totalRevenue.toFixed(2)}</div>
          <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4, lineHeight: 1.8 }}>
            Ремонти: € {revenue.toFixed(2)}<br />
            Аксесоари: € {accRevToday.toFixed(2)}<br />
            Части: € {partsRevToday.toFixed(2)}<br />
            Телефони: € {phoneRevToday.toFixed(2)}<br />
            {extServiceCost > 0 && <span style={{ color: "#f59e0b" }}>Вкл. вън. услуги: € {extServiceCost.toFixed(2)}</span>}
          </div>
        </Card>
        <Card style={{ borderLeft: "4px solid #ef4444", padding: "14px 16px" }}>
          <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 3 }}>💸 ОБЩО РАЗХОДИ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#ef4444" }}>€ {(expensesToday + extServiceCost + partsCost).toFixed(2)}</div>
          <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4, lineHeight: 1.8 }}>
            От каса: € {expensesToday.toFixed(2)}<br />
            Не от каса: € {expensesNotCash.toFixed(2)}<br />
            Вън. услуги: € {extServiceCost.toFixed(2)}<br />
            Части: € {partsCost.toFixed(2)}
          </div>
        </Card>
        <Card style={{ borderLeft: "4px solid #38bdf8", padding: "14px 16px" }}>
          <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 3 }}>📈 НЕТНА ПЕЧАЛБА</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: profit >= 0 ? "#38bdf8" : "#ef4444" }}>€ {profit.toFixed(2)}</div>
          <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4 }}>
            {totalRevenue.toFixed(2)} − {(expensesToday + extServiceCost + partsCost).toFixed(2)} = <b style={{ color: profit >= 0 ? "#38bdf8" : "#ef4444" }}>€ {profit.toFixed(2)}</b>
          </div>
        </Card>
        <Card style={{ borderLeft: "4px solid #f59e0b", padding: "14px 16px" }}>
          <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 3 }}>🏦 НАЛИЧНО В КАСА</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#f59e0b" }}>€ {cashNow.toFixed(2)}</div>
          <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2 }}>
            Начало: € {openingCash.toFixed(2)}
          </div>
          <div style={{ marginTop: 8, borderTop: "1px solid #334155", paddingTop: 6 }}>
            <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>📋 Как е платено:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#10b981" }}>💵 В брой:</span>
                <span style={{ color: "#6ee7b7", fontWeight: 700 }}>€ {totalCashIn.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#3b82f6" }}>💳 С карта:</span>
                <span style={{ color: "#93c5fd", fontWeight: 700 }}>€ {issuedToday.filter(o => o.payment_method === "С карта").reduce((s, o) => s + Number(o.price || 0), 0).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#8b5cf6" }}>🏦 Банка:</span>
                <span style={{ color: "#a78bfa", fontWeight: 700 }}>€ {issuedToday.filter(o => o.payment_method === "Банка").reduce((s, o) => s + Number(o.price || 0), 0).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#f59e0b" }}>📦 Еконт:</span>
                <span style={{ color: "#fcd34d", fontWeight: 700 }}>€ {issuedToday.filter(o => o.payment_method === "Еконт").reduce((s, o) => s + Number(o.price || 0), 0).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#06b6d4" }}>🚚 Спиди:</span>
                <span style={{ color: "#67e8f9", fontWeight: 700 }}>€ {issuedToday.filter(o => o.payment_method === "Спиди").reduce((s, o) => s + Number(o.price || 0), 0).toFixed(2)}</span>
              </div>
              {unpaid > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#ef4444" }}>❌ Неплатени:</span>
                  <span style={{ color: "#fca5a5", fontWeight: 700 }}>€ {unpaid.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
          <div style={{ marginTop: 10, borderTop: "1px solid #334155", paddingTop: 8, display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "#64748b", minWidth: 70 }}>🏛️ Банкова сметка:</span>
              <input type="number" min="0" step="0.01"
                value={bankAmount || ""}
                onChange={e => { setBankAmount(e.target.value); localStorage.setItem("rp_bank_" + date, e.target.value); }}
                onClick={e => e.stopPropagation()}
                style={{ width: 90, padding: "3px 6px", fontSize: 12, background: "#0f172a", border: "1px solid #334155", borderRadius: 5, color: "#e2e8f0" }}
                placeholder="0.00" />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "#64748b", minWidth: 70 }}>💼 Външна каса:</span>
              <input type="number" min="0" step="0.01"
                value={externalCash || ""}
                onChange={e => { setExternalCash(e.target.value); localStorage.setItem("rp_ext_" + date, e.target.value); }}
                onClick={e => e.stopPropagation()}
                style={{ width: 90, padding: "3px 6px", fontSize: 12, background: "#0f172a", border: "1px solid #334155", borderRadius: 5, color: "#e2e8f0" }}
                placeholder="0.00" />
            </div>
            <div style={{ marginTop: 4, paddingTop: 6, borderTop: "1px solid #334155" }}>
              <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: .4 }}>💰 ВСИЧКО НАЛИЧНО</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#10b981", marginTop: 2 }}>€ {totalAllCash.toFixed(2)}</div>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 18 }}>
        <Card style={{ borderLeft: "4px solid #3b82f6", padding: "14px 18px" }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{receivedToday.length}</div>
          <div style={{ fontSize: 11, color: "var(--text3)" }}>Приети устройства</div>
        </Card>
        <Card style={{ borderLeft: "4px solid #10b981", padding: "14px 18px" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#10b981" }}>{issuedToday.length}</div>
          <div style={{ fontSize: 11, color: "var(--text3)" }}>Издадени устройства</div>
        </Card>
        <Card style={{ borderLeft: "4px solid #f59e0b", padding: "14px 18px" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#f59e0b" }}>{dayOrders.length}</div>
          <div style={{ fontSize: 11, color: "var(--text3)" }}>Общо активни за деня</div>
        </Card>
      </div>

      {paymentBreakdown.length > 0 && (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>💳 По начин на плащане</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {paymentBreakdown.map(({ method, count, total }) => (
              <div key={method} style={{
                background: "#0f172a", borderRadius: 10, padding: "12px 18px", flex: "1", minWidth: 140,
                borderLeft: `3px solid ${method === "Не е платен" ? "#ef4444" : method === "В брой" ? "#10b981" : method === "С карта" ? "#3b82f6" : method === "Банка" ? "#8b5cf6" : "#f59e0b"}`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{method}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#10b981" }}>€ {total.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>{count} поръчки</div>
              </div>
            ))}
          </div>
          {unpaid > 0 && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: "#450a0a", borderRadius: 8, fontSize: 12, color: "#fca5a5" }}>
              ⚠️ Неплатени: <b>€ {unpaid.toFixed(2)}</b>
            </div>
          )}
        </Card>
      )}

      {techDay.length > 0 && (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>По техник за {new Date(date).toLocaleDateString("bg-BG")}</div>
          <div className="table-wrap">
            <table>
              <thead style={{ background: "#0a1628" }}>
                <tr>{["Техник", "Приети", "Издадени", "Приход"].map(h => <th key={h} style={{ padding: "9px 13px", textAlign: "left", fontSize: 10, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase" }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {techDay.map(t => (
                  <tr key={t.name} style={{ borderTop: "1px solid #0f172a" }}>
                    <td style={{ padding: "8px 13px", fontWeight: 600 }}>{t.name}</td>
                    <td style={{ padding: "8px 13px", color: "#3b82f6" }}>{t.received}</td>
                    <td style={{ padding: "8px 13px", color: "#10b981" }}>{t.issued}</td>
                    <td style={{ padding: "8px 13px", fontWeight: 700, color: "#10b981" }}>€ {t.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {issuedToday.length > 0 && (
        <Card style={{ marginBottom: 18, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #0f172a", fontSize: 12, fontWeight: 700, color: "#10b981" }}>✅ Издадени устройства ({issuedToday.length})</div>
          <div className="table-wrap">
            <table>
              <thead style={{ background: "#0a1628" }}><tr>{["№", "Клиент", "Телефон", "Устройство", "Техник", "Цена"].map(h => <th key={h} style={{ padding: "9px 13px", textAlign: "left", fontSize: 10, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
              <tbody>
                {issuedToday.map(o => (
                  <tr key={o.id} style={{ borderTop: "1px solid #0f172a" }}>
                    <td style={{ padding: "8px 13px", fontSize: 11, color: "#38bdf8", fontFamily: "monospace" }}>{o.id}</td>
                    <td style={{ padding: "8px 13px", fontWeight: 600 }}>{o.client_name}</td>
                    <td style={{ padding: "8px 13px", color: "var(--text3)" }}>{o.phone}</td>
                    <td style={{ padding: "8px 13px", fontSize: 12 }}>{o.device_type} {o.brand} {o.model}</td>
                    <td style={{ padding: "8px 13px" }}>{o.technician || "—"}</td>
                    <td style={{ padding: "8px 13px", fontWeight: 700, color: "#10b981" }}>€ {Number(o.price || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {receivedToday.length > 0 && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #0f172a", fontSize: 12, fontWeight: 700, color: "#3b82f6" }}>📥 Приети устройства ({receivedToday.length})</div>
          <div className="table-wrap">
            <table>
              <thead style={{ background: "#0a1628" }}><tr>{["№", "Клиент", "Телефон", "Устройство", "Проблем", "Техник"].map(h => <th key={h} style={{ padding: "9px 13px", textAlign: "left", fontSize: 10, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
              <tbody>
                {receivedToday.map(o => (
                  <tr key={o.id} style={{ borderTop: "1px solid #0f172a" }}>
                    <td style={{ padding: "8px 13px", fontSize: 11, color: "#38bdf8", fontFamily: "monospace" }}>{o.id}</td>
                    <td style={{ padding: "8px 13px", fontWeight: 600 }}>{o.client_name}</td>
                    <td style={{ padding: "8px 13px", color: "var(--text3)" }}>{o.phone}</td>
                    <td style={{ padding: "8px 13px", fontSize: 12 }}>{o.device_type} {o.brand} {o.model}</td>
                    <td style={{ padding: "8px 13px", fontSize: 12, color: "var(--text3)" }}>{o.problem}</td>
                    <td style={{ padding: "8px 13px" }}>{o.technician || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {dayOrders.length === 0 && receivedToday.length === 0 && issuedToday.length === 0 && (
        <Card style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
          <div style={{ color: "var(--text3)", fontSize: 14 }}>Няма активност за {new Date(date).toLocaleDateString("bg-BG")}</div>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════ CALCULATOR ════════════════════════════════════
function CalcField({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: .4 }}>{label}</label>
      {children}
    </div>
  );
}

function Calculator() {
  const rate = 1.95583;
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("client");
  const [accessory, setAccessory] = useState("display");
  const [convertAmount, setConvertAmount] = useState("");
  const [convertType, setConvertType] = useState("bgnToEur");

  const accessories = [
    { value: "display", label: "Дисплей" },
    { value: "battery", label: "Батерия" },
    { value: "back_cover", label: "Заден капак" },
    { value: "power_board", label: "Блок захранване" },
    { value: "camera", label: "Камери" },
    { value: "flex_cable", label: "Лентови кабели" },
    { value: "ear_speaker", label: "Слушалки" },
    { value: "polyphony", label: "Полифония" },
    { value: "camera_glass", label: "Стъкло камера" },
  ];

  const calculate = () => {
    const eur = Number(amount);
    if (!eur) return { eur: 0, bgn: 0 };
    let amountBgn = eur * rate;
    let result = amountBgn;

    if (type === "client") {
      switch (accessory) {
        case "display":
          if (amountBgn <= 50) result += 80;
          else if (amountBgn <= 100) result += 85;
          else if (amountBgn <= 150) result += 95;
          else if (amountBgn <= 200) result += 100;
          else if (amountBgn <= 250) result += 110;
          else result += 150;
          break;
        case "battery": result += 55; break;
        case "back_cover": result += 55; break;
        case "power_board": result += 60; break;
        case "camera": result += 60; break;
        case "flex_cable": result += 60; break;
        case "ear_speaker": result += 55; break;
        case "polyphony": result += 60; break;
        case "camera_glass": result += 30; break;
      }
    } else {
      switch (accessory) {
        case "display":
          if (amountBgn <= 50) result += 50;
          else if (amountBgn <= 100) result += 50;
          else if (amountBgn <= 150) result += 50;
          else if (amountBgn <= 200) result += 70;
          else if (amountBgn <= 250) result += 80;
          else result += 100;
          break;
        case "battery": result += 35; break;
        case "back_cover": result += 40; break;
        case "power_board": result += 40; break;
        case "camera": result += 40; break;
        case "flex_cable": result += 40; break;
        case "ear_speaker": result += 40; break;
        case "polyphony": result += 40; break;
        case "camera_glass": result += 20; break;
      }
    }

    const resultEur = Math.round(result / rate);
    const resultBgn = resultEur * rate;
    return { eur: resultEur, bgn: resultBgn.toFixed(2) };
  };

  const calcConvert = () => {
    const val = Number(convertAmount);
    if (!val) return "0";
    if (convertType === "bgnToEur") return (val / rate).toFixed(2) + " €";
    return (val * rate).toFixed(2) + " лв";
  };

  const result = calculate();
  const laborEur = amount ? result.eur - Number(amount) : 0;

  return (
    <div className="animate-fade">
      <h1 style={{ margin: "0 0 22px", fontSize: 22, fontWeight: 800 }}>🧮 Калкулатор за ремонт</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }} className="calc-grid">

        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#38bdf8", marginBottom: 18 }}>Изчисли крайна цена</div>

          <CalcField label="Цена на частта (€)">
            <input type="number" min="0" step="0.01"
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="Въведи цена на частта в евро..." />
          </CalcField>

          <CalcField label="Тип клиент">
            <select value={type} onChange={e => setType(e.target.value)}>
              <option value="client">👤 Клиент</option>
              <option value="colleague">🤝 Колега</option>
            </select>
          </CalcField>

          <CalcField label="Вид ремонт">
            <select value={accessory} onChange={e => setAccessory(e.target.value)}>
              {accessories.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </CalcField>

          <div style={{
            background: amount && result.eur > 0 ? "linear-gradient(135deg,#059669,#047857)" : "#1e293b",
            borderRadius: 10, padding: "18px 20px", textAlign: "center",
            marginTop: 6, transition: "background .3s",
            border: amount && result.eur > 0 ? "1px solid #10b981" : "1px solid #334155",
          }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", marginBottom: 6, fontWeight: 600 }}>КРАЙНА ЦЕНА</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#fff" }}>
              {amount && result.eur > 0 ? `${result.eur} €` : "— €"}
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,.6)", marginTop: 4 }}>
              {amount && result.bgn > 0 ? `${result.bgn} лв` : "0 лв"}
            </div>
          </div>

          {amount && result.eur > 0 && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "7px 12px", background: "#0f172a", borderRadius: 7 }}>
                <span style={{ color: "var(--text3)" }}>Цена на частта:</span>
                <span style={{ fontWeight: 700 }}>€ {Number(amount).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "7px 12px", background: "#0f172a", borderRadius: 7 }}>
                <span style={{ color: "var(--text3)" }}>Труд ({type === "client" ? "клиент" : "колега"}):</span>
                <span style={{ fontWeight: 700, color: "#f59e0b" }}>€ {laborEur.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "9px 12px", background: "#064e3b", borderRadius: 7, borderLeft: "3px solid #10b981" }}>
                <span style={{ color: "#6ee7b7", fontWeight: 700 }}>Крайна цена:</span>
                <span style={{ fontWeight: 800, color: "#10b981", fontSize: 16 }}>€ {result.eur}</span>
              </div>
            </div>
          )}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Card>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#38bdf8", marginBottom: 18 }}>Конвертор лв ↔ €</div>

            <CalcField label="Сума">
              <input type="number" min="0" step="0.01"
                value={convertAmount} onChange={e => setConvertAmount(e.target.value)}
                placeholder="Въведи сума..." />
            </CalcField>

            <CalcField label="Посока">
              <select value={convertType} onChange={e => setConvertType(e.target.value)}>
                <option value="bgnToEur">Лева → Евро</option>
                <option value="eurToBgn">Евро → Лева</option>
              </select>
            </CalcField>

            <div style={{
              background: "linear-gradient(135deg,#1e3a5f,#1e40af)",
              borderRadius: 10, padding: "16px", textAlign: "center",
              border: "1px solid #3b82f6",
            }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", marginBottom: 4 }}>РЕЗУЛТАТ</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#93c5fd" }}>
                {convertAmount ? calcConvert() : "0"}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 4 }}>
                Курс: 1 € = {rate} лв
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#38bdf8", marginBottom: 14 }}>📋 Тарифа труд (клиент)</div>
            <div className="table-wrap">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#0f172a" }}>
                    <th style={{ padding: "7px 10px", textAlign: "left", color: "var(--text3)" }}>Вид</th>
                    <th style={{ padding: "7px 10px", textAlign: "right", color: "var(--text3)" }}>Труд лв</th>
                    <th style={{ padding: "7px 10px", textAlign: "right", color: "var(--text3)" }}>Труд €</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Дисплей ≤50лв", 80, 80 / rate],
                    ["Дисплей ≤100лв", 85, 85 / rate],
                    ["Дисплей ≤150лв", 95, 95 / rate],
                    ["Дисплей ≤200лв", 100, 100 / rate],
                    ["Дисплей ≤250лв", 110, 110 / rate],
                    ["Дисплей >250лв", 150, 150 / rate],
                    ["Батерия", 55, 55 / rate],
                    ["Заден капак", 55, 55 / rate],
                    ["Блок захранване", 60, 60 / rate],
                    ["Камери", 60, 60 / rate],
                    ["Стъкло камера", 30, 30 / rate],
                  ].map(([label, bgn, eur], i) => (
                    <tr key={i} style={{ borderTop: "1px solid #1e293b" }}>
                      <td style={{ padding: "6px 10px" }}>{label}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right", color: "#f59e0b", fontWeight: 600 }}>{bgn} лв</td>
                      <td style={{ padding: "6px 10px", textAlign: "right", color: "#10b981", fontWeight: 600 }}>{eur.toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════ PRICING TAB ══════════════════════════════════
const RATE = 1.95583;

const DEFAULT_PRICES = {
  iphone_battery: {
    label: "Смяна на батерия — iPhone",
    models: ["iPhone 6S", "iPhone 7", "iPhone 8", "iPhone X", "iPhone XR", "iPhone XS", "iPhone 11", "iPhone 12", "iPhone 13", "iPhone 14", "iPhone 15"],
    client: { "iPhone 6S": 40, "iPhone 7": 40, "iPhone 8": 40, "iPhone X": 50, "iPhone XR": 50, "iPhone XS": 55, "iPhone 11": 55, "iPhone 12": 60, "iPhone 13": 65, "iPhone 14": 65, "iPhone 15": 70 },
    colleague: { "iPhone 6S": 25, "iPhone 7": 25, "iPhone 8": 25, "iPhone X": 30, "iPhone XR": 30, "iPhone XS": 35, "iPhone 11": 35, "iPhone 12": 40, "iPhone 13": 45, "iPhone 14": 45, "iPhone 15": 50 },
  },
  iphone_back: {
    label: "Смяна на заден капак — iPhone",
    models: ["iPhone 8", "iPhone X", "iPhone XR", "iPhone XS", "iPhone 11", "iPhone 12", "iPhone 13", "iPhone 14", "iPhone 15"],
    client: { "iPhone 8": 45, "iPhone X": 55, "iPhone XR": 55, "iPhone XS": 60, "iPhone 11": 60, "iPhone 12": 65, "iPhone 13": 65, "iPhone 14": 70, "iPhone 15": 75 },
    colleague: { "iPhone 8": 30, "iPhone X": 35, "iPhone XR": 35, "iPhone XS": 40, "iPhone 11": 40, "iPhone 12": 45, "iPhone 13": 45, "iPhone 14": 50, "iPhone 15": 55 },
  },
  iphone_display: {
    label: "Смяна на дисплей — iPhone",
    models: ["iPhone 6S", "iPhone 7", "iPhone 8", "iPhone X", "iPhone XR", "iPhone XS", "iPhone 11", "iPhone 12", "iPhone 12 Pro", "iPhone 13", "iPhone 13 Pro", "iPhone 14", "iPhone 14 Pro", "iPhone 15", "iPhone 15 Pro"],
    client: { "iPhone 6S": 70, "iPhone 7": 70, "iPhone 8": 75, "iPhone X": 90, "iPhone XR": 85, "iPhone XS": 95, "iPhone 11": 90, "iPhone 12": 100, "iPhone 12 Pro": 115, "iPhone 13": 105, "iPhone 13 Pro": 120, "iPhone 14": 110, "iPhone 14 Pro": 130, "iPhone 15": 115, "iPhone 15 Pro": 140 },
    colleague: { "iPhone 6S": 50, "iPhone 7": 50, "iPhone 8": 50, "iPhone X": 60, "iPhone XR": 55, "iPhone XS": 65, "iPhone 11": 60, "iPhone 12": 70, "iPhone 12 Pro": 80, "iPhone 13": 75, "iPhone 13 Pro": 85, "iPhone 14": 80, "iPhone 14 Pro": 95, "iPhone 15": 85, "iPhone 15 Pro": 105 },
  },
};

const PRICES_TABLE = "global_settings";

function PricingTab() {
  const [prices, setPrices] = useState(DEFAULT_PRICES);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState(null);
  const [activeService, setActiveService] = useState("iphone_display");
  const [newModelName, setNewModelName] = useState("");
  const [newSvcKey, setNewSvcKey] = useState("");
  const [newSvcLabel, setNewSvcLabel] = useState("");
  const [showNewSvc, setShowNewSvc] = useState(false);
  const [pricesLoaded, setPricesLoaded] = useState(false);

  useEffect(() => {
    const loadPrices = async () => {
      try {
        const sb = getSupabase();
        if (sb) {
          const { data, error } = await sb.from(PRICES_TABLE)
            .select("value")
            .eq("key", "pricing")
            .maybeSingle();
          if (!error && data?.value) {
            const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
            if (parsed && Object.keys(parsed).length > 0) {
              setPrices(parsed);
              localStorage.setItem("rp_prices", JSON.stringify(parsed));
              setPricesLoaded(true);
              return;
            }
          }
        }
      } catch (e) { }
      try {
        const saved = localStorage.getItem("rp_prices");
        if (saved) setPrices(JSON.parse(saved));
      } catch (e) { }
      setPricesLoaded(true);
    };
    loadPrices();
  }, []);

  const saveCustomPrices = async (data) => {
    setPrices(data);
    localStorage.setItem("rp_prices", JSON.stringify(data));
    try {
      const sb = getSupabase();
      if (sb) await sb.from(PRICES_TABLE).upsert({ key: "pricing", value: data }, { onConflict: "key" });
    } catch (e) { }
    setEditMode(false);
    setEditData(null);
    setNewModelName("");
  };

  const addModel = () => {
    if (!newModelName.trim()) return;
    const nd = JSON.parse(JSON.stringify(editData));
    if (!nd[activeService]) return;
    if (nd[activeService].models.includes(newModelName.trim())) {
      alert("Моделът вече съществува!");
      return;
    }
    nd[activeService].models.push(newModelName.trim());
    nd[activeService].client[newModelName.trim()] = 0;
    nd[activeService].colleague[newModelName.trim()] = 0;
    setEditData(nd);
    setNewModelName("");
  };

  const removeModel = (m) => {
    const nd = JSON.parse(JSON.stringify(editData));
    if (!nd[activeService]) return;
    nd[activeService].models = nd[activeService].models.filter(x => x !== m);
    delete nd[activeService].client[m];
    delete nd[activeService].colleague[m];
    setEditData(nd);
  };

  const addNewService = () => {
    if (!newSvcKey.trim() || !newSvcLabel.trim()) return;
    const key = newSvcKey.trim().replace(/\s+/g, "_").toLowerCase();
    if (editData[key]) { alert("Услугата вече съществува!"); return; }
    const nd = JSON.parse(JSON.stringify(editData));
    nd[key] = { label: newSvcLabel.trim(), models: [], client: {}, colleague: {} };
    setEditData(nd);
    setActiveService(key);
    setNewSvcKey("");
    setNewSvcLabel("");
    setShowNewSvc(false);
  };

  const removeService = (key) => {
    if (!confirm(`Изтрий услугата "${editData[key]?.label || key}"?`)) return;
    const nd = JSON.parse(JSON.stringify(editData));
    delete nd[key];
    setEditData(nd);
    const keys = Object.keys(nd);
    setActiveService(keys.length > 0 ? keys[0] : "");
  };

  // Ключът на текущо избраната услуга (ако не съществува, взима първата налична)
const currentKey = Object.keys(prices).includes(activeService)
  ? activeService
  : Object.keys(prices)[0] || "";

// Ако няма никакви услуги – показваме празно състояние
if (!currentKey) {
  return (
    <div className="animate-fade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>💲 Готови цени</h1>
          <p style={{ margin: "3px 0 0", color: "var(--text3)", fontSize: 12 }}>Все още нямаш въведени цени</p>
        </div>
        <button onClick={() => { setEditData(JSON.parse(JSON.stringify(DEFAULT_PRICES))); setEditMode(true); }}
          style={{ background: "#1e293b", color: "#64748b", border: "1px solid #334155", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
          ✏️ Създай цени
        </button>
      </div>
    </div>
  );
}

const service = prices[currentKey];
const activeLabel = service.label || currentKey;
const serviceModels = service.models || [];

  const printPriceList = () => {
    const w = window.open("", "_blank");
    const rows = serviceModels.map(m => `
      <tr>
        <td>${m}</td>
        <td style="text-align:center;font-weight:700;color:#065f46">€ ${service.client?.[m] || "—"}</td>
        <td style="text-align:center;color:#555">лв ${((service.client?.[m] || 0) * RATE).toFixed(2)}</td>
        <td style="text-align:center;font-weight:700;color:#1e40af">€ ${service.colleague?.[m] || "—"}</td>
        <td style="text-align:center;color:#555">лв ${((service.colleague?.[m] || 0) * RATE).toFixed(2)}</td>
      </tr>`).join("");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${activeLabel}</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;max-width:650px;margin:auto}
    h1{font-size:18px;color:#1a56db;border-bottom:2px solid #1a56db;padding-bottom:8px}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th{background:#f3f4f6;padding:8px 10px;font-size:12px;text-align:left;border:1px solid #ddd}
    td{padding:8px 10px;font-size:13px;border:1px solid #eee}
    tr:nth-child(even){background:#f9fafb}
    @media print{body{padding:16px}}</style></head><body>
    <h1>💲 ${activeLabel}</h1>
    <table><thead><tr><th>Модел</th><th colspan="2" style="text-align:center;color:#065f46">Клиент</th><th colspan="2" style="text-align:center;color:#1e40af">Колега</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p style="font-size:10px;color:#999;margin-top:16px;text-align:center">RepairPro — ${new Date().toLocaleDateString("bg-BG")}</p>
    <script>window.onload=()=>{window.print();}</script></body></html>`);
    w.document.close();
  };

  if (!pricesLoaded) return <div className="animate-fade"><p style={{ color: "var(--text3)" }}>Зареждане на цените...</p></div>;

  return (
    <div className="animate-fade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>💲 Готови цени</h1>
          <p style={{ margin: "3px 0 0", color: "var(--text3)", fontSize: 12 }}>Стандартни цени за клиенти и колеги</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={printPriceList} style={{ background: "#2e1065", color: "#a78bfa", border: "1px solid #7c3aed", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>🖨️ Принтирай</button>
          <button onClick={() => { setEditData(JSON.parse(JSON.stringify(prices))); setEditMode(true); }} style={{ background: "#1e293b", color: "#64748b", border: "1px solid #334155", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>✏️ Редактирай цени</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {Object.entries(prices).map(([key, svc]) => (
          <button key={key} onClick={() => setActiveService(key)} style={{
            padding: "8px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
            background: activeService === key ? "linear-gradient(135deg,#38bdf8,#0ea5e9)" : "#1e293b",
            color: activeService === key ? "#fff" : "#64748b",
          }}>{svc.label || key}</button>
        ))}
      </div>

      <div style={{ background: "#1e293b", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", background: "#0a1628", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
         <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>Цени</span>
          <div style={{ display: "flex", gap: 20 }}>
            <span style={{ fontSize: 12, color: "#10b981", fontWeight: 700 }}>● Клиент</span>
            <span style={{ fontSize: 12, color: "#38bdf8", fontWeight: 700 }}>● Колега</span>
          </div>
        </div>
        <div className="table-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "#0f172a" }}>
              <tr>
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Модел</th>
                <th style={{ padding: "10px 16px", textAlign: "center", fontSize: 11, color: "#10b981", fontWeight: 700, textTransform: "uppercase" }}>Клиент (€)</th>
                <th style={{ padding: "10px 16px", textAlign: "center", fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Клиент (лв)</th>
                <th style={{ padding: "10px 16px", textAlign: "center", fontSize: 11, color: "#38bdf8", fontWeight: 700, textTransform: "uppercase" }}>Колега (€)</th>
                <th style={{ padding: "10px 16px", textAlign: "center", fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Колега (лв)</th>
              </tr>
            </thead>
            <tbody>
              {serviceModels.map((m, i) => (
                <tr key={m} style={{ borderTop: "1px solid #0f172a", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,.02)" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#243044"}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,.02)"}>
                  <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600 }}>{m}</td>
                  <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 15, fontWeight: 800, color: "#10b981" }}>€ {service.client?.[m] || "—"}</td>
                  <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 12, color: "#64748b" }}>{service.client?.[m] ? ((service.client[m]) * RATE).toFixed(2) + " лв" : "—"}</td>
                  <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 15, fontWeight: 800, color: "#38bdf8" }}>€ {service.colleague?.[m] || "—"}</td>
                  <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 12, color: "#64748b" }}>{service.colleague?.[m] ? ((service.colleague[m]) * RATE).toFixed(2) + " лв" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editMode && editData && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.78)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#1e293b", borderRadius: 16, width: "100%", maxWidth: 700, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 30px 80px rgba(0,0,0,.6)" }}>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>✏️ Редактирай цени — {editData[activeService]?.label || activeLabel}</h2>
              <button onClick={() => setEditMode(false)} style={{ background: "#334155", border: "none", color: "#94a3b8", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
            <div style={{ padding: "10px 20px 0", borderBottom: "1px solid #334155", display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
              {Object.entries(editData).map(([key, svc]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                  <button onClick={() => setActiveService(key)} style={{
                    padding: "6px 14px", borderRadius: "7px 0 0 7px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
                    background: activeService === key ? "#38bdf8" : "#0f172a",
                    color: activeService === key ? "#0f172a" : "#64748b",
                  }}>{svc.label || key}</button>
                  <button onClick={() => removeService(key)} style={{ padding: "6px 8px", borderRadius: "0 7px 7px 0", fontSize: 11, cursor: "pointer", border: "none", background: activeService === key ? "#0ea5e9" : "#1e293b", color: "#ef4444" }}>✕</button>
                </div>
              ))}
              {!showNewSvc
                ? <button onClick={() => setShowNewSvc(true)} style={{ padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px dashed #334155", background: "transparent", color: "#64748b" }}>+ Нова услуга</button>
                : <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input value={newSvcLabel} onChange={e => setNewSvcLabel(e.target.value)} placeholder="Наименование..." style={{ width: 180, fontSize: 12 }} />
                  <button onClick={addNewService} style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12, cursor: "pointer", border: "none", background: "#10b981", color: "#fff", fontWeight: 700 }}>Добави</button>
                  <button onClick={() => setShowNewSvc(false)} style={{ padding: "5px 8px", borderRadius: 7, fontSize: 12, cursor: "pointer", border: "none", background: "#334155", color: "#94a3b8" }}>✕</button>
                </div>
              }
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
              {editData[activeService] && <>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ background: "#0f172a" }}>
                    {["Модел", "Цена клиент (€)", "Цена колега (€)", ""].map(h => <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {editData[activeService].models.map(m => (
                      <tr key={m} style={{ borderTop: "1px solid #0f172a" }}>
                        <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>{m}</td>
                        <td style={{ padding: "6px 12px" }}>
                          <input type="number" min="0" step="0.5"
                            value={editData[activeService].client?.[m] || ""}
                            onChange={e => { const nd = JSON.parse(JSON.stringify(editData)); nd[activeService].client[m] = Number(e.target.value); setEditData(nd); }}
                            style={{ width: "100%" }} />
                        </td>
                        <td style={{ padding: "6px 12px" }}>
                          <input type="number" min="0" step="0.5"
                            value={editData[activeService].colleague?.[m] || ""}
                            onChange={e => { const nd = JSON.parse(JSON.stringify(editData)); nd[activeService].colleague[m] = Number(e.target.value); setEditData(nd); }}
                            style={{ width: "100%" }} />
                        </td>
                        <td style={{ padding: "6px 12px", width: 32 }}>
                          <button onClick={() => removeModel(m)} title="Изтрий модела" style={{ background: "#7f1d1d", color: "#fca5a5", border: "none", borderRadius: 6, width: 26, height: 26, cursor: "pointer", fontSize: 12 }}>✕</button>
                        </td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: "2px dashed #334155", background: "rgba(56,189,248,.04)" }}>
                      <td style={{ padding: "8px 12px" }}>
                        <input value={newModelName} onChange={e => setNewModelName(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && addModel()}
                          placeholder="+ Нов модел..." style={{ width: "100%", fontSize: 12 }} />
                      </td>
                      <td colSpan={2} style={{ padding: "8px 12px", color: "#64748b", fontSize: 12 }}>Въведи наименование и натисни Enter или бутона →</td>
                      <td style={{ padding: "6px 12px" }}>
                        <button onClick={addModel} style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: 6, width: 26, height: 26, cursor: "pointer", fontSize: 14 }}>+</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </>}
            </div>
            <div style={{ padding: "14px 22px", borderTop: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: "#64748b" }}>Промените се запазват в облака (Supabase) и локално</span>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setEditMode(false); setShowNewSvc(false); }} style={{ background: "#334155", color: "#94a3b8", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600 }}>Отказ</button>
                <button onClick={() => saveCustomPrices(editData)} style={{ background: "linear-gradient(135deg,#38bdf8,#0ea5e9)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 22px", cursor: "pointer", fontWeight: 700 }}>💾 Запази цените</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════ TRASH TAB ════════════════════════════════════
const TABLE_LABELS = {
  orders: "🔧 Сервиз",
  inventory: "📦 Склад",
  expenses: "💸 Разход",
  buybacks: "📱 Изкупуване",
  parts_sales: "🔩 Продажба части",
  phone_sales: "📲 Продажба телефон",
  accessory_sales: "🎧 Аксесоар",
  stock_orders: "📋 Поръчка части",
  supplier_debts: "💳 Задължение",
};

function TrashTab({ trash, onRestore, onDelete }) {
  const [filter, setFilter] = useState("Всички");
  const now = new Date();
  const active = trash.filter(t => new Date(t.expires_at) > now);
  const expired = trash.filter(t => new Date(t.expires_at) <= now);

  const tables = ["Всички", ...new Set(active.map(t => t.table_name))];
  const filtered = active.filter(t => filter === "Всички" || t.table_name === filter);

  const daysLeft = (expires) => {
    const diff = new Date(expires) - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  const getLabel = (item) => {
    const d = item.record_data;
    if (item.table_name === "orders") return `${d.client_name} — ${d.device_type || ""} ${d.brand || ""} ${d.model || ""}`;
    if (item.table_name === "inventory") return `${d.name} (${d.quantity} бр.)`;
    if (item.table_name === "expenses") return `${d.description} — €${d.amount}`;
    if (item.table_name === "buybacks") return `${d.brand} ${d.model} — ${d.seller_name || ""}`;
    if (item.table_name === "supplier_debts") return `${d.supplier} — ${d.part_name}`;
    return d.name || d.part_name || d.description || item.record_id;
  };

  return (
    <div className="animate-fade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🗑️ Кошче</h1>
          <p style={{ margin: "3px 0 0", color: "var(--text3)", fontSize: 12 }}>
            Записите се пазят <b style={{ color: "#f59e0b" }}>5 дни</b> преди окончателно изтриване
          </p>
        </div>
        {expired.length > 0 && (
          <div style={{ fontSize: 12, color: "#64748b" }}>⏰ {expired.length} изтекли записа</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {tables.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
            background: filter === t ? "#38bdf8" : "#1e293b", color: filter === t ? "#0f172a" : "#64748b",
          }}>{t === "Всички" ? t : (TABLE_LABELS[t] || t)}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 50 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
          <div style={{ color: "var(--text3)", fontSize: 14 }}>Кошчето е празно</div>
          <div style={{ color: "#475569", fontSize: 12, marginTop: 6 }}>Изтритите записи ще се появят тук</div>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-wrap">
            <table>
              <thead style={{ background: "#0a1628" }}>
                <tr>{["Тип", "Запис", "Изтрит на", "Остават дни", ""].map(h => (
                  <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 10, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5 }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const days = daysLeft(item.expires_at);
                  return (
                    <tr key={item.id} style={{ borderTop: "1px solid #0f172a" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#243044"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{ background: "#1e293b", color: "#94a3b8", padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                          {TABLE_LABELS[item.table_name] || item.table_name}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600, maxWidth: 350 }}>
                        {getLabel(item)}
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: 12, color: "var(--text3)" }}>
                        {new Date(item.deleted_at).toLocaleDateString("bg-BG")}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{
                          fontWeight: 700, fontSize: 13,
                          color: days <= 1 ? "#ef4444" : days <= 2 ? "#f59e0b" : "#10b981"
                        }}>
                          {days} {days === 1 ? "ден" : "дни"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => onRestore(item)} style={{
                            background: "#064e3b", color: "#6ee7b7", border: "1px solid #10b981",
                            borderRadius: 7, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600,
                          }}>↩️ Възстанови</button>
                          <button onClick={() => onDelete(item.id)} style={{
                            background: "#450a0a", color: "#fca5a5", border: "1px solid #7f1d1d",
                            borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 12,
                          }}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════ LOGIN SCREEN ═════════════════════════════════
const DEFAULT_USERS = [
  { username: "admin", password: "admin123", role: "Администратор", color: "#38bdf8", email: "" },
  { username: "technik", password: "technik123", role: "Техник", color: "#10b981", email: "" },
];

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [mode, setMode] = useState("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [users, setUsers] = useState(() => {
    try { return JSON.parse(localStorage.getItem("rp_users")) || DEFAULT_USERS; } catch { return DEFAULT_USERS; }
  });

  const handleLogin = () => {
    const user = users.find(u => u.username === username.trim() && u.password === password);
    if (user) {
      sessionStorage.setItem("rp_auth", "1");
      sessionStorage.setItem("rp_user", JSON.stringify(user));
      setError("");
      onLogin();
    } else {
      setError("Грешно потребителско име или парола!");
    }
  };

  const handleForgot = () => {
    const user = users.find(u => u.email === resetEmail.trim());
    if (!user) {
      setResetMsg("❌ Не е намерен потребител с този имейл.");
      return;
    }
    setResetMsg(`✅ Намерен акаунт!\nПотребителско: ${user.username}\nПарола: ${user.password}`);
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#0f172a",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Segoe UI',system-ui,sans-serif",
    }}>
      <div style={{
        background: "#1e293b", borderRadius: 20, padding: "40px 36px",
        width: "100%", maxWidth: 400, boxShadow: "0 30px 80px rgba(0,0,0,.5)",
        border: "1px solid #334155",
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🔧</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#38bdf8", letterSpacing: -0.5 }}>RepairPro</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Сервизна CRM система</div>
        </div>

        {mode === "login" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: .4 }}>
                Потребителско име
              </label>
              <input
                value={username}
                onChange={e => { setUsername(e.target.value); setError(""); }}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                placeholder="Въведи потребителско име"
                autoFocus
                style={{ width: "100%", background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 10, padding: "11px 14px", fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: .4 }}>
                Парола
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  placeholder="Въведи парола"
                  style={{ width: "100%", background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 10, padding: "11px 44px 11px 14px", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                />
                <button onClick={() => setShowPass(p => !p)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#64748b", padding: 0 }}>
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>
            </div>
            {error && <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#fca5a5", textAlign: "center" }}>❌ {error}</div>}
            <button onClick={handleLogin} style={{ background: "linear-gradient(135deg,#38bdf8,#0ea5e9)", color: "#fff", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 6 }}>
              🔐 Вход
            </button>
            <button onClick={() => { setMode("forgot"); setResetMsg(""); }} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", textDecoration: "underline", marginTop: -6 }}>
              Забравена парола?
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 4 }}>
              Въведи имейл адреса свързан с акаунта ти и ще видиш данните за вход.
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: .4 }}>Имейл адрес</label>
              <input
                type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleForgot()}
                placeholder="email@example.com" autoFocus
                style={{ width: "100%", background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 10, padding: "11px 14px", fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            {resetMsg && (
              <div style={{ background: resetMsg.startsWith("✅") ? "#052e16" : "#450a0a", border: `1px solid ${resetMsg.startsWith("✅") ? "#166534" : "#7f1d1d"}`, borderRadius: 8, padding: "12px 14px", fontSize: 13, color: resetMsg.startsWith("✅") ? "#6ee7b7" : "#fca5a5", whiteSpace: "pre-line" }}>
                {resetMsg}
              </div>
            )}
            <button onClick={handleForgot} style={{ background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              📧 Провери данните
            </button>
            <button onClick={() => { setMode("login"); setResetMsg(""); }} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
              ← Обратно към вход
            </button>
          </div>
        )}

        <div style={{ marginTop: 24, textAlign: "center", fontSize: 12, color: "#475569" }}>
          RepairPro v2.0 — Сервизна система
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════ USER MANAGEMENT ══════════════════════════════
export function UsersTab() {
  const [users, setUsers] = useState(() => {
    try { return JSON.parse(localStorage.getItem("rp_users")) || DEFAULT_USERS; } catch { return DEFAULT_USERS; }
  });
  const [form, setForm] = useState({ username: "", password: "", role: "Техник", color: "#38bdf8", email: "" });
  const [editing, setEditing] = useState(null);
  const [showPassIdx, setShowPassIdx] = useState(null);
  const COLORS = ["#38bdf8", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#ef4444"];

  const save = () => {
    if (!form.username.trim() || !form.password.trim()) { alert("Въведи потребителско и парола!"); return; }
    let updated;
    if (editing !== null) {
      updated = users.map((u, i) => i === editing ? { ...form } : u);
    } else {
      if (users.find(u => u.username === form.username.trim())) { alert("Потребителят вече съществува!"); return; }
      updated = [...users, { ...form }];
    }
    setUsers(updated);
    localStorage.setItem("rp_users", JSON.stringify(updated));
    setForm({ username: "", password: "", role: "Техник", color: "#38bdf8" });
    setEditing(null);
  };

  const remove = (i) => {
    if (users.length <= 1) { alert("Трябва да има поне един потребител!"); return; }
    if (!confirm(`Изтрий потребител "${users[i].username}"?`)) return;
    const updated = users.filter((_, j) => j !== i);
    setUsers(updated);
    localStorage.setItem("rp_users", JSON.stringify(updated));
  };

  const currentUser = (() => { try { return JSON.parse(sessionStorage.getItem("rp_user") || "{}"); } catch { return {}; } })();

  return (
    <div className="animate-fade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>👥 Потребители</h1>
          <p style={{ margin: "3px 0 0", color: "var(--text3)", fontSize: 12 }}>Управление на достъпа до системата</p>
        </div>
        <div style={{ background: "#1e293b", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#64748b" }}>
          Влязъл като: <b style={{ color: "#38bdf8" }}>{currentUser.username || "—"}</b>
          <span style={{ marginLeft: 8, color: "#64748b" }}>({currentUser.role || ""})</span>
        </div>
      </div>

      <div style={{ background: "#1e293b", borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "var(--text3)", fontWeight: 700, marginBottom: 14, textTransform: "uppercase", letterSpacing: .5 }}>
          {editing !== null ? "✏️ Редактирай потребител" : "➕ Нов потребител"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 12, alignItems: "flex-end" }} className="form-grid">
          <div>
            <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 4 }}>Потребителско име</label>
            <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="ivan_technik" />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 4 }}>Парола</label>
            <input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="парола123" />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 4 }}>Имейл (за забравена парола)</label>
            <input type="email" value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 4 }}>Роля</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option>Администратор</option>
              <option>Техник</option>
              <option>Мениджър</option>
              <option>Само четене</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{
                width: 22, height: 22, borderRadius: "50%", background: c, border: form.color === c ? "2px solid #fff" : "2px solid transparent", cursor: "pointer", padding: 0,
              }} />
            ))}
          </div>
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
          <button onClick={save} style={{ background: "linear-gradient(135deg,#38bdf8,#0ea5e9)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
            {editing !== null ? "💾 Обнови" : "➕ Добави"}
          </button>
          {editing !== null && (
            <button onClick={() => { setEditing(null); setForm({ username: "", password: "", role: "Техник", color: "#38bdf8" }); }} style={{ background: "#334155", color: "#94a3b8", border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>
              Отказ
            </button>
          )}
        </div>
      </div>

      <div style={{ background: "#1e293b", borderRadius: 14, overflow: "hidden" }}>
        <div className="table-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "#0a1628" }}>
              <tr>{["Потребител", "Роля", "Парола", ""].map(h => (
                <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 10, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={i} style={{ borderTop: "1px solid #0f172a" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#243044"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: u.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                        {u.username[0].toUpperCase()}
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{u.username}</span>
                      {currentUser.username === u.username && <span style={{ fontSize: 10, background: "#064e3b", color: "#6ee7b7", padding: "2px 8px", borderRadius: 10 }}>ТИ</span>}
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ background: u.color + "22", color: u.color, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{u.role}</span>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "#64748b" }}>{u.email || "—"}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text3)", fontFamily: "monospace" }}>
                    {showPassIdx === i ? u.password : "••••••••"}
                    <button onClick={() => setShowPassIdx(showPassIdx === i ? null : i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 13, marginLeft: 8 }}>
                      {showPassIdx === i ? "🙈" : "👁️"}
                    </button>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setEditing(i); setForm({ ...u }); }} style={{ background: "#1e3a5f", color: "#93c5fd", border: "none", borderRadius: 7, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>✏️ Редактирай</button>
                      <button onClick={() => remove(i)} style={{ background: "#450a0a", color: "#fca5a5", border: "none", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 12 }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 16, padding: "12px 16px", background: "#0f172a", borderRadius: 10, fontSize: 12, color: "#64748b" }}>
        💡 Паролите се пазят локално в браузъра. За повече сигурност препоръчваме различни пароли за всеки потребител.
        <br />За да излезеш от акаунта: затвори браузъра или изчисти сесията.
      </div>
    </div>
  );
}
// КРАЙ НА ЧАСТ 4
