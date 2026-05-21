import * as XLSX from "xlsx";
import { fmtDate, fmtMoney } from "./constants.js";

export function exportOrders(orders, filename = "porachki") {
  const rows = orders.map(o => ({
    "№ Поръчка":       o.id,
    "Клиент":          o.client_name,
    "Телефон":         o.phone,
    "Имейл":           o.email || "",
    "Устройство":      `${o.device_type || ""} ${o.brand || ""} ${o.model || ""}`.trim(),
    "Сериен №":        o.serial_number || "",
    "Проблем":         o.problem || "",
    "Статус":          o.status,
    "Техник":          o.technician || "",
    "Цена (лв.)":      Number(o.price || 0),
    "Аванс (лв.)":     Number(o.deposit || 0),
    "За доплащане":    Number(o.price || 0) - Number(o.deposit || 0),
    "Дата приемане":   fmtDate(o.date_in),
    "Дата издаване":   o.date_out ? fmtDate(o.date_out) : "",
    "Имейл изпратен":  o.email_sent ? "Да" : "Не",
    "Описание":        o.description || "",
    "Бележки":         o.notes || "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  // Column widths
  ws["!cols"] = [
    {wch:14},{wch:20},{wch:14},{wch:24},{wch:24},{wch:14},{wch:20},{wch:14},
    {wch:18},{wch:10},{wch:10},{wch:12},{wch:14},{wch:14},{wch:14},{wch:30},{wch:20}
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Поръчки");
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

export function exportInventory(inventory) {
  const rows = inventory.map(i => ({
    "ID":              i.id,
    "Наименование":    i.name,
    "Категория":       i.category || "",
    "SKU":             i.sku || "",
    "Наличност (бр.)": Number(i.quantity || 0),
    "Мин. наличност":  Number(i.min_qty || 0),
    "Статус":          i.quantity <= i.min_qty ? "⚠️ НИСКО" : "✅ ОК",
    "Продажна цена":   Number(i.price || 0),
    "Себестойност":    Number(i.cost || 0),
    "Стойност склад":  Number(i.quantity || 0) * Number(i.price || 0),
    "Доставчик":       i.supplier || "",
    "Локация":         i.location || "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{wch:36},{wch:28},{wch:14},{wch:12},{wch:14},{wch:14},{wch:10},{wch:14},{wch:14},{wch:14},{wch:18},{wch:12}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Склад");
  XLSX.writeFile(wb, `sklad_${new Date().toISOString().slice(0,10)}.xlsx`);
}

export function exportTechReport(technicians, orders) {
  const rows = technicians.map(t => {
    const to = orders.filter(o => o.technician === t.name);
    const issued = to.filter(o => o.status === "Издаден");
    return {
      "Техник":          t.name,
      "Телефон":         t.phone || "",
      "Общо поръчки":    to.length,
      "Издадени":        issued.length,
      "Активни":         to.filter(o => !["Издаден","Отказан"].includes(o.status)).length,
      "Отказани":        to.filter(o => o.status === "Отказан").length,
      "Оборот (лв.)":    issued.reduce((s,o) => s + Number(o.price||0), 0),
      "Среден ремонт":   issued.length ? (issued.reduce((s,o)=>s+Number(o.price||0),0)/issued.length).toFixed(2) : 0,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{wch:22},{wch:14},{wch:14},{wch:10},{wch:10},{wch:10},{wch:14},{wch:14}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Техници");
  XLSX.writeFile(wb, `tehnici_${new Date().toISOString().slice(0,10)}.xlsx`);
}

export function exportFullReport(orders, inventory, technicians) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Orders
  const orderRows = orders.map(o => ({
    "№":           o.id,
    "Клиент":      o.client_name,
    "Телефон":     o.phone,
    "Устройство":  `${o.device_type||""} ${o.brand||""} ${o.model||""}`.trim(),
    "Проблем":     o.problem,
    "Техник":      o.technician||"",
    "Статус":      o.status,
    "Цена":        Number(o.price||0),
    "Дата":        fmtDate(o.date_in),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orderRows), "Поръчки");

  // Sheet 2: Inventory
  const invRows = inventory.map(i => ({
    "Наименование": i.name,
    "Категория":    i.category||"",
    "Наличност":    Number(i.quantity||0),
    "Мин.":         Number(i.min_qty||0),
    "Цена":         Number(i.price||0),
    "Стойност":     Number(i.quantity||0) * Number(i.price||0),
    "Доставчик":    i.supplier||"",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invRows), "Склад");

  // Sheet 3: Tech report
  const techRows = technicians.map(t => {
    const to = orders.filter(o => o.technician === t.name);
    return {
      "Техник":    t.name,
      "Поръчки":   to.length,
      "Издадени":  to.filter(o=>o.status==="Издаден").length,
      "Оборот":    to.filter(o=>o.status==="Издаден").reduce((s,o)=>s+Number(o.price||0),0),
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(techRows), "Техници");

  XLSX.writeFile(wb, `RepairPro_пълен_отчет_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ── IMPORT от Excel ───────────────────────────────────────────────────────────

// Карта за разпознаване на колони — поддържа различни имена
const COL_MAP_ORDERS = {
  // ID
  "id": "id", "№": "id", "номер": "id", "поръчка": "id", "№ поръчка": "id",
  // Клиент
  "клиент": "client_name", "ime": "client_name", "име": "client_name", "name": "client_name", "client": "client_name",
  // Телефон
  "телефон": "phone", "тел": "phone", "phone": "phone", "gsm": "phone", "мобилен": "phone",
  // Имейл
  "имейл": "email", "email": "email", "е-мейл": "email", "mail": "email",
  // Устройство
  "тип устройство": "device_type", "устройство": "device_type", "тип": "device_type", "device": "device_type",
  // Марка
  "марка": "brand", "brand": "brand", "производител": "brand",
  // Модел
  "модел": "model", "model": "model",
  // Сериен номер
  "сериен №": "serial_number", "сериен": "serial_number", "imei": "serial_number", "s/n": "serial_number",
  // Проблем
  "проблем": "problem", "problem": "problem", "неизправност": "problem", "дефект": "problem",
  // Описание
  "описание": "description", "description": "description", "забележка": "description",
  // Статус
  "статус": "status", "status": "status", "състояние": "status",
  // Техник
  "техник": "technician", "technician": "technician", "служител": "technician",
  // Цена
  "цена": "price", "price": "price", "сума": "price", "цена (лв.)": "price", "стойност": "price",
  // Аванс
  "аванс": "deposit", "deposit": "deposit", "капаро": "deposit",
  // Дати
  "дата приемане": "date_in", "дата": "date_in", "date_in": "date_in", "прието на": "date_in", "дата на приемане": "date_in",
  "дата издаване": "date_out", "date_out": "date_out", "издадено на": "date_out",
  // Бележки
  "бележки": "notes", "notes": "notes", "коментар": "notes",
};

const COL_MAP_INVENTORY = {
  "наименование": "name", "артикул": "name", "name": "name", "naziv": "name", "продукт": "name",
  "категория": "category", "category": "category", "вид": "category",
  "sku": "sku", "код": "sku", "code": "sku",
  "наличност": "quantity", "quantity": "quantity", "бр": "quantity", "бройки": "quantity", "qty": "quantity",
  "мин. наличност": "min_qty", "минимум": "min_qty", "min": "min_qty", "min_qty": "min_qty",
  "цена": "price", "price": "price", "продажна цена": "price",
  "себестойност": "cost", "cost": "cost", "покупна цена": "cost",
  "доставчик": "supplier", "supplier": "supplier",
  "локация": "location", "location": "location", "място": "location",
};

function normalizeKey(key) {
  return String(key || "").toLowerCase().trim();
}

function parseExcelDate(val) {
  if (!val) return null;
  // Excel serial number
  if (typeof val === "number") {
    const date = new Date((val - 25569) * 86400 * 1000);
    return date.toISOString().split("T")[0];
  }
  // String date — опитай да я парснеш
  const s = String(val).trim();
  if (!s) return null;
  // BG format: 15.06.2024
  const bgMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (bgMatch) return `${bgMatch[3]}-${bgMatch[2].padStart(2,"0")}-${bgMatch[1].padStart(2,"0")}`;
  // ISO: 2024-06-15
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  // Try JS Date
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().split("T")[0];
  return null;
}

export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const sheets = wb.SheetNames.map(name => ({
          name,
          rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" }),
        }));
        resolve(sheets);
      } catch(err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function mapRowsToOrders(rows) {
  return rows.map((row, idx) => {
    const mapped = { parts: [], photos: [] };
    for (const [col, val] of Object.entries(row)) {
      const field = COL_MAP_ORDERS[normalizeKey(col)];
      if (!field) continue;
      if (field === "date_in" || field === "date_out") {
        mapped[field] = parseExcelDate(val) || null;
      } else if (field === "price" || field === "deposit") {
        mapped[field] = parseFloat(String(val).replace(/[^\d.,]/g,"").replace(",",".")) || 0;
      } else {
        mapped[field] = String(val || "").trim();
      }
    }
    // Задай ID ако няма
    if (!mapped.id) mapped.id = "IMP-" + Date.now().toString(36).toUpperCase() + idx;
    // Задай дата ако няма
    if (!mapped.date_in) mapped.date_in = new Date().toISOString().split("T")[0];
    // Задай статус ако няма
    if (!mapped.status) mapped.status = "Приет";
    return mapped;
  }).filter(r => r.client_name || r.phone); // Пропусни празни редове
}

export function mapRowsToInventory(rows) {
  return rows.map((row, idx) => {
    const mapped = {};
    for (const [col, val] of Object.entries(row)) {
      const field = COL_MAP_INVENTORY[normalizeKey(col)];
      if (!field) continue;
      if (["quantity","min_qty","price","cost"].includes(field)) {
        mapped[field] = parseFloat(String(val).replace(/[^\d.,]/g,"").replace(",",".")) || 0;
      } else {
        mapped[field] = String(val || "").trim();
      }
    }
    if (!mapped.name) return null;
    if (!mapped.quantity) mapped.quantity = 0;
    if (!mapped.min_qty) mapped.min_qty = 0;
    if (!mapped.price) mapped.price = 0;
    return mapped;
  }).filter(Boolean);
}

export function exportDailyReport(date, receivedToday, issuedToday, revenue, partsCost, profit) {
  const wb = XLSX.utils.book_new();
  const summary = [
    { "Показател": "Дата",                  "Стойност": date },
    { "Показател": "Приети устройства",      "Стойност": receivedToday.length },
    { "Показател": "Издадени устройства",    "Стойност": issuedToday.length },
    { "Показател": "Приходи (€)",           "Стойност": revenue },
    { "Показател": "Разходи части (€)",     "Стойност": partsCost },
    { "Показател": "Нетна печалба (€)",     "Стойност": profit },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Резюме");
  if (issuedToday.length) {
    const rows = issuedToday.map(o => ({
      "№": o.id, "Клиент": o.client_name,
      "Устройство": `${o.device_type||""} ${o.brand||""} ${o.model||""}`.trim(),
      "Техник": o.technician || "", "Цена €": Number(o.price || 0),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Издадени");
  }
  if (receivedToday.length) {
    const rows = receivedToday.map(o => ({
      "№": o.id, "Клиент": o.client_name, "Телефон": o.phone,
      "Устройство": `${o.device_type||""} ${o.brand||""} ${o.model||""}`.trim(),
      "Проблем": o.problem || "", "Техник": o.technician || "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Приети");
  }
  XLSX.writeFile(wb, `Дневен_отчет_${date}.xlsx`);
}
// ── ЕКСПОРТ / ИМПОРТ НА РАЗГЛОБЯВАНЕ ─────────────────────────────────────────
export function exportDismantle(records) {
  // Подготвяме записите така, че да се запишат в Excel без загуба
  const flat = (records || []).map(r => ({
    "Дата":            r.date || "",
    "Марка":           r.brand || "",
    "Модел":           r.model || "",
    "IMEI":            r.imei || "",
    "Цвят":            r.color || "",
    "Памет":           r.storage || "",
    "Цена (€)":       Number(r.purchase_price || 0),
    "Статус":          r.status || "",
    "Части (JSON)":    JSON.stringify(r.parts_status || {}),
    "Доп. части":      (r.custom_parts || []).join("|"),
    "Бележки":         r.notes || "",
    "Снимки (base64)": (r.photos || []).map(p => p.data || p).join(";;"),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(flat);
  // Малко ширина за по-добър изглед
  ws["!cols"] = [
    {wch:12}, {wch:16}, {wch:16}, {wch:18}, {wch:12}, {wch:10},
    {wch:10}, {wch:18}, {wch:40}, {wch:20}, {wch:20}, {wch:40}
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Разглобяване");
  XLSX.writeFile(wb, `Разглобяване_${new Date().toISOString().slice(0,10)}.xlsx`);
}

export async function parseDismantleExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (rows.length < 2) return resolve([]);

        const headers = rows[0].map(h => String(h || "").trim());
        const records = rows.slice(1).map(row => {
          const obj = {};
          headers.forEach((h, i) => {
            obj[h] = row[i] !== undefined ? row[i] : "";
          });

          // Възстановяване на обекти/масиви
          let parts_status = {};
          try {
            parts_status = JSON.parse(obj["Части (JSON)"] || "{}");
          } catch (e) {}

          const custom_parts = (obj["Доп. части"] || "")
            .split("|")
            .map(s => s.trim())
            .filter(Boolean);

          const photos = (obj["Снимки (base64)"] || "")
            .split(";;")
            .filter(Boolean)
            .map(data => ({ name: "photo", data }));

          return {
            date:            obj["Дата"] || new Date().toISOString().split("T")[0],
            brand:           obj["Марка"] || "",
            model:           obj["Модел"] || "",
            imei:            obj["IMEI"] || "",
            color:           obj["Цвят"] || "",
            storage:         obj["Памет"] || "",
            purchase_price:  Number(obj["Цена (€)"] || 0),
            status:          obj["Статус"] || "Чака разглобяване",
            parts_status,
            custom_parts,
            notes:           obj["Бележки"] || "",
            photos,
          };
        });

        resolve(records);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
