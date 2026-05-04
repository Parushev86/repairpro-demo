import * as XLSX from "xlsx";

export function exportDailyReport(data) {
  const {
    date,
    receivedToday=[], issuedToday=[],
    revenue=0, accRevToday=0, partsRevToday=0, phoneRevToday=0,
    totalRevenue=0, expensesToday=0, extServiceCost=0, partsCost=0, profit=0,
    openingCash=0, cashNow=0,
    paymentBreakdown=[],
    techDay=[],
    expenses=[],
    accSalesDay=[],
    partsSalesDay=[],
    phoneSalesDay=[],
  } = data;

  const wb = XLSX.utils.book_new();
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("bg-BG") : "—";
  const fmtM = (n) => Number(n||0).toFixed(2);

  // ── Лист 1: Резюме
  const summary = [
    ["ДНЕВЕН ОТЧЕТ — RepairPro", ""],
    ["Дата:", fmtDate(date)],
    ["",""],
    ["── ПРИХОДИ ──",""],
    ["Ремонти (издадени):", fmtM(revenue)],
    ["Аксесоари:", fmtM(accRevToday)],
    ["Продажба части:", fmtM(partsRevToday)],
    ["Продажба телефони:", fmtM(phoneRevToday)],
    ["ОБЩО ПРИХОДИ:", fmtM(totalRevenue)],
    ["",""],
    ["── РАЗХОДИ ──",""],
    ["Разходи (каса):", fmtM(expensesToday)],
    ["Вложени части в ремонти:", fmtM(partsCost)],
    ["Външни услуги:", fmtM(extServiceCost)],
    ["ОБЩО РАЗХОДИ:", fmtM(expensesToday+partsCost+extServiceCost)],
    ["",""],
    ["── РЕЗУЛТАТ ──",""],
    ["НЕТНА ПЕЧАЛБА:", fmtM(profit)],
    ["",""],
    ["── КАСА ──",""],
    ["Начало на деня:", fmtM(openingCash)],
    ["Налично в каса:", fmtM(cashNow)],
    ["",""],
    ["── УСТРОЙСТВА ──",""],
    ["Приети:", receivedToday.length],
    ["Издадени:", issuedToday.length],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1["!cols"] = [{wch:30},{wch:16}];
  XLSX.utils.book_append_sheet(wb, ws1, "Резюме");

  // ── Лист 2: По начин на плащане
  if (paymentBreakdown.length > 0) {
    const rows = [
      ["Начин на плащане","Брой поръчки","Сума (€)"],
      ...paymentBreakdown.map(p=>[p.method, p.count, fmtM(p.total)]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(rows);
    ws2["!cols"] = [{wch:20},{wch:14},{wch:12}];
    XLSX.utils.book_append_sheet(wb, ws2, "По плащане");
  }

  // ── Лист 3: По техник
  if (techDay.length > 0) {
    const rows = [
      ["Техник","Приети","Издадени","Приход (€)"],
      ...techDay.map(t=>[t.name, t.received, t.issued, fmtM(t.revenue)]),
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(rows);
    ws3["!cols"] = [{wch:24},{wch:10},{wch:12},{wch:12}];
    XLSX.utils.book_append_sheet(wb, ws3, "По техник");
  }

  // ── Лист 4: Издадени устройства
  if (issuedToday.length > 0) {
    const rows = [
      ["№ Поръчка","Клиент","Телефон","Устройство","Проблем","Техник","Труд (€)","Части (€)","Вън. услуга (€)","Крайна цена (€)","Плащане"],
      ...issuedToday.map(o=>[
        o.id,
        o.client_name||"",
        o.phone||"",
        [o.device_type,o.brand,o.model].filter(Boolean).join(" "),
        o.problem||"",
        o.technician||"",
        fmtM(o.labor_price),
        fmtM((o.parts||[]).reduce((s,p)=>s+Number(p.price||0),0)),
        fmtM(o.external_service_price),
        fmtM(o.total_price||o.price),
        o.payment_method||"",
      ]),
    ];
    const ws4 = XLSX.utils.aoa_to_sheet(rows);
    ws4["!cols"] = [12,18,14,24,20,16,10,10,14,14,14].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws4, "Издадени");
  }

  // ── Лист 5: Приети устройства
  if (receivedToday.length > 0) {
    const rows = [
      ["№ Поръчка","Клиент","Телефон","Устройство","Проблем","Техник","Статус"],
      ...receivedToday.map(o=>[
        o.id,
        o.client_name||"",
        o.phone||"",
        [o.device_type,o.brand,o.model].filter(Boolean).join(" "),
        o.problem||"",
        o.technician||"",
        o.status||"",
      ]),
    ];
    const ws5 = XLSX.utils.aoa_to_sheet(rows);
    ws5["!cols"] = [12,18,14,24,20,16,12].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws5, "Приети");
  }

  // ── Лист 6: Разходи
  if (expenses.length > 0) {
    const rows = [
      ["Дата","Описание","Категория","Платено на","От каса","Сума (€)","Бележки"],
      ...expenses.map(e=>[
        fmtDate(e.date),
        e.description||"",
        e.category||"",
        e.paid_to||"",
        e.from_cash===false?"Не":"Да",
        fmtM(e.amount),
        e.notes||"",
      ]),
      ["","","","","ОБЩО:", fmtM(expensesToday),""],
    ];
    const ws6 = XLSX.utils.aoa_to_sheet(rows);
    ws6["!cols"] = [12,28,16,18,8,12,20].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws6, "Разходи");
  }

  // ── Лист 7: Аксесоари
  if (accSalesDay.length > 0) {
    const rows = [
      ["Артикул","Бр.","Продажна (€)","Общо (€)","Плащане","Купувач"],
      ...accSalesDay.map(r=>[
        r.item_name||"",
        r.quantity||1,
        fmtM(r.sale_price),
        fmtM(Number(r.sale_price||0)*Number(r.quantity||1)),
        r.payment_method||"",
        r.buyer_name||"",
      ]),
      ["ОБЩО","","",fmtM(accRevToday),"",""],
    ];
    const ws7 = XLSX.utils.aoa_to_sheet(rows);
    ws7["!cols"] = [30,8,14,12,14,18].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws7, "Аксесоари");
  }

  // ── Лист 8: Продажба части
  if (partsSalesDay.length > 0) {
    const rows = [
      ["Артикул","Бр.","Продажна (€)","Плащане","Статус","Купувач","Доставка"],
      ...partsSalesDay.map(r=>[
        r.part_name||"",
        r.quantity||1,
        fmtM(r.sale_price),
        r.payment_method||"",
        r.payment_status||"",
        r.buyer_name||"",
        r.delivery_method||"",
      ]),
      ["ОБЩО","",fmtM(partsRevToday),"","","",""],
    ];
    const ws8 = XLSX.utils.aoa_to_sheet(rows);
    ws8["!cols"] = [30,8,14,14,14,18,12].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws8, "Продажба части");
  }

  // ── Лист 9: Продажба телефони
  if (phoneSalesDay.length > 0) {
    const rows = [
      ["Устройство","IMEI","Купувач","Доставна (€)","Продажна (€)","Печалба (€)","Плащане"],
      ...phoneSalesDay.map(r=>[
        [r.brand,r.model,r.color].filter(Boolean).join(" "),
        r.imei||"",
        r.buyer_name||"",
        fmtM(r.cost_price),
        fmtM(r.sale_price),
        fmtM(Number(r.sale_price||0)-Number(r.cost_price||0)),
        r.payment_method||"",
      ]),
      ["ОБЩО","","","",fmtM(phoneRevToday),"",""],
    ];
    const ws9 = XLSX.utils.aoa_to_sheet(rows);
    ws9["!cols"] = [28,16,18,14,14,12,14].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws9, "Продажба телефони");
  }

  XLSX.writeFile(wb, `Дневен_отчет_${date}.xlsx`);
}
