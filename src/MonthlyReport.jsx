import { useState, useEffect } from "react";
import * as XLSX from "xlsx";

const MONTHS_BG = ["Януари","Февруари","Март","Април","Май","Юни","Юли","Август","Септември","Октомври","Ноември","Декември"];
const CATS = ["Наем","Заплати","Сметки","Счетоводство","Куриери","Осигуровки","ДДС","Части","Реклама","Друго"];

function fmtM(n) { return Number(n||0).toFixed(2); }

// ── Small UI helpers ─────────────────────────────────────────────────────────
function MBtn({onClick,children,color="#38bdf8",bg,style={},title}) {
  return <button onClick={onClick} title={title} style={{background:bg||(color+"22"),color,border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer",...style}}>{children}</button>;
}
function Row({label,children,col=false}) {
  return <div style={{display:"flex",flexDirection:col?"column":"row",gap:6,alignItems:col?"flex-start":"center",marginBottom:8}}>
    <label style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.4,minWidth:120}}>{label}</label>
    {children}
  </div>;
}

export default function MonthlyReport({getSupabase, orders, expenses, accSales, partsSales, phoneSales, cashReg}) {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(null); // null | {} | item
  const [loading, setLoading] = useState(false);
  const [dividends, setDividends] = useState({});
  const [editingDiv, setEditingDiv] = useState(false);
  const [divInput, setDivInput] = useState("");
  const [compareFrom, setCompareFrom] = useState(() => { const n=new Date(); return n.getFullYear()+"-01-01"; });
  const [startingCash, setStartingCash] = useState({});
  const [editingCash, setEditingCash] = useState(false);
  const [cashInput, setCashInput] = useState("");
  const [compareTo, setCompareTo] = useState(() => new Date().toISOString().split("T")[0]);

  const monthKey = `${year}-${String(month+1).padStart(2,"0")}`;

  // Load monthly expenses
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    setLoading(true);
    sb.from("monthly_expenses").select("*").eq("month", monthKey).order("created_at")
      .then(({data}) => { setItems(data||[]); setLoading(false); });
  }, [monthKey]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.from("global_settings").select("value").eq("key","dividends").maybeSingle()
      .then(({data}) => {
        if (data?.value) setDividends(typeof data.value === "string" ? JSON.parse(data.value) : data.value);
      });
  }, []);

  const currentStartingCash = startingCash[monthKey] || 0;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("monthly_starting_cash") || "{}");
      setStartingCash(saved);
    } catch { }
  }, []);

  const saveStartingCash = async () => {
    const updated = { ...startingCash, [monthKey]: Number(cashInput) || 0 };
    setStartingCash(updated);
    localStorage.setItem("monthly_starting_cash", JSON.stringify(updated));
    const sb = getSupabase();
    if (sb) await sb.from("global_settings").upsert({ key: "starting_cash", value: updated }, { onConflict: "key" });
    setEditingCash(false);
  };

  const saveDividend = async () => {
    const sb = getSupabase();
    if (!sb) return;
    const updated = { ...dividends, [monthKey]: Number(divInput) || 0 };
    setDividends(updated);
    await sb.from("global_settings").upsert({ key: "dividends", value: updated }, { onConflict: "key" });
    setEditingDiv(false);
  };

  const currentDividend = dividends[monthKey] || 0;

  // Daily profit for selected month
  const monthOrders = (orders||[]).filter(o => {
    const d = (o.date_out||o.updated_at||o.date_in||"").slice(0,7);
    return d === monthKey && o.status === "Издаден" && o.payment_method !== "Не е платен";
  });
  const monthExpenses = (expenses||[]).filter(e => (e.date||"").slice(0,7) === monthKey);
  const monthAcc = (accSales||[]).filter(s => {
  const pd = s.paid_date || s.date;
  return s.payment_method !== "Не е платена" && (pd||"").slice(0,7) === monthKey;
});
const monthPhones = (phoneSales||[]).filter(s => {
  const pd = s.paid_date || s.date;
  return s.payment_method !== "Не е платена" && (pd||"").slice(0,7) === monthKey;
});
  const monthParts = (partsSales||[]).filter(s => {
  const pd = s.paid_date || s.date;
  return s.payment_status === "Платена" && (pd||"").slice(0,7) === monthKey;
});
  

  // Revenue by day
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const dailyData = Array.from({length:daysInMonth}, (_,i) => {
    const day = String(i+1).padStart(2,"0");
    const dayStr = `${monthKey}-${day}`;
    const revOrders = monthOrders
  .filter(r => (r.date_out||r.updated_at||"").slice(0,10) === dayStr)
  .reduce((s,r) => s + Number(r.total_price||r.price||0), 0);
const revAcc = monthAcc
  .filter(r => (r.date||"").slice(0,10) === dayStr)
  .reduce((s,r) => s + Number(r.sale_price||0)*Number(r.quantity||1), 0);
const revParts = monthParts
  .filter(r => (r.paid_date||r.date||"").slice(0,10) === dayStr)
  .reduce((s,r) => s + Number(r.sale_price||0)*Number(r.quantity||1), 0);
const revPhones = monthPhones
  .filter(r => (r.date||"").slice(0,10) === dayStr)
  .reduce((s,r) => s + Number(r.sale_price||0), 0);
const rev = revOrders + revAcc + revParts + revPhones;
    const exp = monthExpenses
      .filter(e => (e.date||"").slice(0,10) === dayStr)
      .reduce((s,e) => s + Number(e.amount||0), 0);
    return {day:i+1, dayStr, rev, exp, profit: rev-exp};
  }).filter(d => d.rev>0 || d.exp>0);

  // Totals
  const totalRev   = monthOrders.reduce((s,o)=>s+Number(o.total_price||o.price||0),0)
                 + monthAcc.reduce((s,r)=>s+Number(r.sale_price||0)*Number(r.quantity||1),0)
                 + monthParts.reduce((s,r)=>s+Number(r.sale_price||0)*Number(r.quantity||1),0)
                 + monthPhones.reduce((s,r)=>s+Number(r.sale_price||0),0);
  const totalExpOp = monthExpenses.reduce((s,e)=>s+Number(e.amount||0),0);
  const totalFixed = items.reduce((s,i)=>s+Number(i.amount||0),0);
  const totalFixedPaid = items.filter(i=>i.is_paid).reduce((s,i)=>s+Number(i.amount||0),0);
  const totalFixedUnpaid = items.filter(i=>!i.is_paid).reduce((s,i)=>s+Number(i.amount||0),0);
  const netProfit  = totalRev - totalExpOp - totalFixed;

  // Съпоставка по месеци
  const compareMonths = (() => {
    const months = [];
    const start = new Date(compareFrom); start.setDate(1);
    const end = new Date(compareTo);
    let cur = new Date(start);
    while (cur <= end) {
      const y = cur.getFullYear();
      const m = cur.getMonth();
      const key = `${y}-${String(m+1).padStart(2,"0")}`;
      const mOrders = (orders||[]).filter(o => {
        const d = (o.date_out||o.date_in||"").slice(0,7);
        return d === key && o.status === "Издаден" && o.payment_method !== "Не е платен";
      });
      const mAcc = (accSales||[]).filter(s => (s.paid_date||s.date||"").slice(0,7) === key && s.payment_status !== "Не е платена");
      const mParts = (partsSales||[]).filter(s => (s.paid_date||s.date||"").slice(0,7) === key && s.payment_status === "Платена");
      const mPhones = (phoneSales||[]).filter(s => (s.paid_date||s.date||"").slice(0,7) === key && s.payment_method !== "Не е платена");
      const mExp = (expenses||[]).filter(e => (e.date||"").slice(0,7) === key);
      const rev = mOrders.reduce((s,o)=>s+Number(o.total_price||o.price||0),0)
                + mAcc.reduce((s,r)=>s+Number(r.sale_price||0)*Number(r.quantity||1),0)
                + mParts.reduce((s,r)=>s+Number(r.sale_price||0)*Number(r.quantity||1),0)
                + mPhones.reduce((s,r)=>s+Number(r.sale_price||0),0);
      const exp = mExp.reduce((s,e)=>s+Number(e.amount||0),0);
      if (rev > 0 || exp > 0) months.push({ label: MONTHS_BG[m]+" "+y, key, rev, exp, profit: rev-exp });
      cur.setMonth(cur.getMonth()+1);
    }
    return months;
  })();

  const exportCompare = () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      ["Месец","Приходи €","Разходи €","Печалба €"],
      ...compareMonths.map(m=>[m.label, fmtM(m.rev), fmtM(m.exp), fmtM(m.profit)]),
      ["ОБЩО", fmtM(compareMonths.reduce((s,m)=>s+m.rev,0)), fmtM(compareMonths.reduce((s,m)=>s+m.exp,0)), fmtM(compareMonths.reduce((s,m)=>s+m.profit,0))],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Съпоставка");
    XLSX.writeFile(wb, `Съпоставка_${compareFrom}_${compareTo}.xlsx`);
  };

  // Cash in register (latest entry for month)
  const cashEntry = (cashReg||[]).find(c => c.date && c.date.slice(0,7) === monthKey);
  const openingCash = Number(cashEntry?.opening_cash||0);

  const save = async (item) => {
    const sb = getSupabase();
    if (!sb) return;
    const row = {...item, month: monthKey, date: item.date || new Date().toISOString().split("T")[0]};
    const {data} = item.id
      ? await sb.from("monthly_expenses").update(row).eq("id",item.id).select().single()
      : await sb.from("monthly_expenses").insert(row).select().single();
    if (data) {
      setItems(p => item.id ? p.map(x=>x.id===data.id?data:x) : [...p,data]);
    }
    setModal(null);
  };

  const del = async (id) => {
    if (!confirm("Изтрий?")) return;
    const sb = getSupabase();
    await sb.from("monthly_expenses").delete().eq("id",id);
    setItems(p=>p.filter(x=>x.id!==id));
  };
  const exportRevenue = () => {
    const wb = XLSX.utils.book_new();
    const ordersRows = [
      ["Дата", "Клиент", "Телефон", "Устройство", "Проблем", "Техник", "Сума €", "Плащане"],
      ...monthOrders.map(o => [
        o.date_out || o.updated_at || "", o.client_name, o.phone,
        [o.device_type, o.brand, o.model].filter(Boolean).join(" "),
        o.problem || "", o.technician || "",
        fmtM(o.total_price || o.price), o.payment_method || ""
      ]),
      ["ОБЩО", "", "", "", "", "", fmtM(monthOrders.reduce((s,o)=>s+Number(o.total_price||o.price||0),0)), ""],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ordersRows), "Ремонти");
    const accRows = [
      ["Дата", "Артикул", "Бр.", "Продажна €", "Общо €", "Плащане", "Купувач"],
      ...monthAcc.map(r => [r.date, r.item_name, r.quantity, fmtM(r.sale_price), fmtM(Number(r.sale_price||0)*Number(r.quantity||1)), r.payment_method, r.buyer_name||""]),
      ["ОБЩО", "", "", "", fmtM(monthAcc.reduce((s,r)=>s+Number(r.sale_price||0)*Number(r.quantity||1),0)), "", ""],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(accRows), "Аксесоари");
    const partsRows = [
      ["Дата", "Артикул", "Бр.", "Продажна €", "Общо €", "Плащане", "Купувач"],
      ...monthParts.map(r => [r.paid_date||r.date, r.part_name, r.quantity, fmtM(r.sale_price), fmtM(Number(r.sale_price||0)*Number(r.quantity||1)), r.payment_method, r.buyer_name||""]),
      ["ОБЩО", "", "", "", fmtM(monthParts.reduce((s,r)=>s+Number(r.sale_price||0)*Number(r.quantity||1),0)), "", ""],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(partsRows), "Части");
    const phoneRows = [
      ["Дата", "Марка", "Модел", "IMEI", "Продажна €", "Плащане", "Купувач"],
      ...monthPhones.map(r => [r.paid_date||r.date, r.brand, r.model, r.imei||"", fmtM(r.sale_price), r.payment_method, r.buyer_name||""]),
      ["ОБЩО", "", "", "", fmtM(monthPhones.reduce((s,r)=>s+Number(r.sale_price||0),0)), "", ""],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(phoneRows), "Телефони");
    const revSum = [
      ["ПРИХОДИ", `${MONTHS_BG[month]} ${year}`],
      ["", ""],
      ["Ремонти:", fmtM(monthOrders.reduce((s,o)=>s+Number(o.total_price||o.price||0),0))],
      ["Аксесоари:", fmtM(monthAcc.reduce((s,r)=>s+Number(r.sale_price||0)*Number(r.quantity||1),0))],
      ["Части:", fmtM(monthParts.reduce((s,r)=>s+Number(r.sale_price||0)*Number(r.quantity||1),0))],
      ["Телефони:", fmtM(monthPhones.reduce((s,r)=>s+Number(r.sale_price||0),0))],
      ["", ""],
      ["ОБЩО ПРИХОДИ:", fmtM(totalRev)],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(revSum), "Резюме приходи");
    XLSX.writeFile(wb, `Приходи_${monthKey}.xlsx`);
  };

  const exportExpensesDetail = () => {
    const wb = XLSX.utils.book_new();
    const opRows = [
      ["Дата", "Описание", "Категория", "Платено на", "Сума €", "От каса", "Бележки"],
      ...monthExpenses.map(e => [e.date, e.description, e.category, e.paid_to||"", fmtM(e.amount), e.from_cash !== false ? "Да" : "Не", e.notes||""]),
      ["ОБЩО", "", "", "", fmtM(totalExpOp), "", ""],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(opRows), "Оперативни разходи");
    const fixedRows = [
      ["Описание", "Категория", "Сума €", "Платено", "От каса", "Бележки"],
      ...items.map(i => [i.description, i.category, fmtM(i.amount), i.is_paid?"Да":"Не", i.from_cash!==false?"Да":"Не", i.notes||""]),
      ["ОБЩО", "", fmtM(totalFixed), "", "", ""],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fixedRows), "Фиксирани разходи");
    const expSum = [
      ["РАЗХОДИ", `${MONTHS_BG[month]} ${year}`],
      ["", ""],
      ["Оперативни разходи:", fmtM(totalExpOp)],
      ["  - От каса:", fmtM(monthExpenses.filter(e=>e.from_cash!==false).reduce((s,e)=>s+Number(e.amount||0),0))],
      ["  - Не от каса:", fmtM(monthExpenses.filter(e=>e.from_cash===false).reduce((s,e)=>s+Number(e.amount||0),0))],
      ["Фиксирани разходи:", fmtM(totalFixed)],
      ["  - Платени:", fmtM(totalFixedPaid)],
      ["  - Неплатени:", fmtM(totalFixedUnpaid)],
      ["", ""],
      ["ОБЩО РАЗХОДИ:", fmtM(totalExpOp + totalFixed)],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expSum), "Резюме разходи");
    XLSX.writeFile(wb, `Разходи_${monthKey}.xlsx`);
  };



  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    // Summary
    const sum = [
      ["МЕСЕЧЕН ОТЧЕТ",""],
      ["Месец:", `${MONTHS_BG[month]} ${year}`],
      ["",""],
      ["ПРИХОДИ:", fmtM(totalRev)],
      ["Оперативни разходи:", fmtM(totalExpOp)],
      ["Фиксирани разходи:", fmtM(totalFixed)],
      ["НЕТНА ПЕЧАЛБА:", fmtM(netProfit)],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), "Резюме");
    // Fixed expenses
    const fixedRows = [
      ["Описание","Категория","Сума (€)","Платено","Бележки"],
      ...items.map(i=>[i.description,i.category,fmtM(i.amount),i.is_paid?"Да":"Не",i.notes||""]),
      ["ОБЩО","","",fmtM(totalFixed),""],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fixedRows), "Фиксирани разходи");
    // Daily profit
    const dailyRows = [
      ["Ден","Приходи (€)","Разходи (€)","Чиста печалба (€)"],
      ...dailyData.map(d=>[d.day, fmtM(d.rev), fmtM(d.exp), fmtM(d.profit)]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dailyRows), "По дни");
    XLSX.writeFile(wb, `Месечен_отчет_${monthKey}.xlsx`);
  };

  return (
    <div className="animate-fade" style={{maxWidth:1200}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:800}}>📅 Месечен отчет</h1>
          <p style={{margin:"3px 0 0",color:"#64748b",fontSize:12}}>Фиксирани разходи и чиста печалба по месеци</p>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <MBtn color="#10b981" bg="#064e3b" onClick={exportExcel}>📊 Excel</MBtn>
          <MBtn color="#38bdf8" bg="#0c4a6e" onClick={()=>setModal({})}>+ Нов разход</MBtn>
        </div>
      </div>

      {/* Month selector */}
      <div style={{display:"flex",gap:8,marginBottom:20,alignItems:"center",flexWrap:"wrap"}}>
        <button onClick={()=>{if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);}} style={{background:"#1e293b",border:"none",color:"#94a3b8",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:16}}>◀</button>
        <div style={{background:"#1e293b",borderRadius:10,padding:"10px 24px",textAlign:"center",minWidth:180}}>
          <div style={{fontSize:18,fontWeight:800,color:"#f1f5f9"}}>{MONTHS_BG[month]}</div>
          <div style={{fontSize:13,color:"#64748b"}}>{year}</div>
        </div>
        <button onClick={()=>{if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);}} style={{background:"#1e293b",border:"none",color:"#94a3b8",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:16}}>▶</button>
        <button onClick={()=>{setMonth(now.getMonth());setYear(now.getFullYear());}} style={{background:"#334155",color:"#94a3b8",border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12}}>Текущ месец</button>
      </div>

      {/* KPI cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:14,marginBottom:20}}>
        <div style={{background:"#1e293b",borderRadius:12,padding:"16px 18px",borderLeft:"4px solid #10b981"}}>
          <div style={{fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>💰 ПРИХОДИ</div>
          <div style={{fontSize:24,fontWeight:900,color:"#10b981"}}>{fmtM(totalRev)} €</div>
          <button onClick={exportRevenue} style={{marginTop:8,background:"#064e3b",color:"#6ee7b7",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>📊 Детайлен експорт</button>
        </div>
        <div style={{background:"#1e293b",borderRadius:12,padding:"16px 18px",borderLeft:"4px solid #ef4444"}}>
          <div style={{fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>💸 ОП. РАЗХОДИ</div>
          <div style={{fontSize:24,fontWeight:900,color:"#ef4444"}}>{fmtM(totalExpOp)} €</div>
          <button onClick={exportExpensesDetail} style={{marginTop:8,background:"#450a0a",color:"#fca5a5",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>📊 Детайлен експорт</button>
        </div>
        
        <div style={{background:"#1e293b",borderRadius:12,padding:"16px 18px",borderLeft:`4px solid ${netProfit>=0?"#38bdf8":"#ef4444"}`}}>
          <div style={{fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>📈 НЕТНА ПЕЧАЛБА</div>
          <div style={{fontSize:24,fontWeight:900,color:netProfit>=0?"#38bdf8":"#ef4444"}}>{fmtM(netProfit)} €</div>
        </div>
        <div style={{background:"#1e293b",borderRadius:12,padding:"16px 18px",borderLeft:"4px solid #f59e0b"}}>
          <div style={{fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>💰 ДИВИДЕНТИ</div>
          {editingDiv ? (
            <div style={{display:"flex",gap:6,alignItems:"center",marginTop:4}}>
              <input type="number" min="0" step="0.01" value={divInput}
                onChange={e=>setDivInput(e.target.value)}
                autoFocus
                style={{width:100,fontSize:16,fontWeight:700,padding:"4px 8px"}}
                onKeyDown={e=>e.key==="Enter"&&saveDividend()}
              />
              <button onClick={saveDividend} style={{background:"#064e3b",color:"#6ee7b7",border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:700}}>✅</button>
              <button onClick={()=>setEditingDiv(false)} style={{background:"#334155",color:"#94a3b8",border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:12}}>✕</button>
            </div>
          ) : (
            <>
              <div style={{fontSize:24,fontWeight:900,color:"#f59e0b"}}>{fmtM(currentDividend)} €</div>
              <button onClick={()=>{setDivInput(currentDividend||"");setEditingDiv(true);}} style={{marginTop:8,background:"#451a03",color:"#fcd34d",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>✏️ Редактирай</button>
            </>
          )}
        </div>

        <div style={{background:"#1e293b",borderRadius:12,padding:"16px 18px",borderLeft:"4px solid #06b6d4"}}>
          <div style={{fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>🏦 НАЧАЛО НА МЕСЕЦА</div>
          {editingCash ? (
            <div style={{display:"flex",gap:6,alignItems:"center",marginTop:4}}>
              <input type="number" min="0" step="0.01" value={cashInput}
                onChange={e=>setCashInput(e.target.value)}
                autoFocus
                style={{width:100,fontSize:16,fontWeight:700,padding:"4px 8px"}}
                onKeyDown={e=>e.key==="Enter"&&saveStartingCash()}
              />
              <button onClick={saveStartingCash} style={{background:"#064e3b",color:"#6ee7b7",border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:700}}>✅</button>
              <button onClick={()=>setEditingCash(false)} style={{background:"#334155",color:"#94a3b8",border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:12}}>✕</button>
            </div>
          ) : (
            <>
              <div style={{fontSize:24,fontWeight:900,color:"#06b6d4"}}>{fmtM(currentStartingCash)} €</div>
              <button onClick={()=>{setCashInput(currentStartingCash||"");setEditingCash(true);}} style={{marginTop:8,background:"#0c4a6e",color:"#67e8f9",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>✏️ Редактирай</button>
            </>
          )}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr",gap:16}}>

       

        {/* Daily profit */}
        <div>
          <div style={{fontSize:14,fontWeight:700,color:"#f1f5f9",marginBottom:10}}>Чиста печалба по дни</div>
          <div style={{background:"#1e293b",borderRadius:12,maxHeight:460,overflow:"auto"}}>
            {dailyData.length===0
              ? <div style={{textAlign:"center",padding:32,color:"#475569"}}>Няма данни за {MONTHS_BG[month]}</div>
              : <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead style={{background:"#0a1628",position:"sticky",top:0}}>
                    <tr>{["Ден","Приходи €","Разходи €","Чиста печалба €"].map(h=>(
                      <th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase"}}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {dailyData.map(d=>(
                      <tr key={d.day} style={{borderTop:"1px solid #0f172a"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#243044"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <td style={{padding:"8px 12px",fontSize:12,color:"#64748b"}}>{String(d.day).padStart(2,"0")}.{String(month+1).padStart(2,"0")}.{year}</td>
                        <td style={{padding:"8px 12px",fontSize:13,color:"#10b981",fontWeight:600}}>€ {fmtM(d.rev)}</td>
                        <td style={{padding:"8px 12px",fontSize:13,color:"#ef4444"}}>€ {fmtM(d.exp)}</td>
                        <td style={{padding:"8px 12px",fontSize:13,fontWeight:800,color:d.profit>=0?"#38bdf8":"#ef4444"}}>€ {fmtM(d.profit)}</td>
                      </tr>
                    ))}
                    <tr style={{borderTop:"2px solid #334155",background:"#0a1628"}}>
                      <td style={{padding:"10px 12px",fontWeight:700}}>ОБЩО</td>
                      <td style={{padding:"10px 12px",fontWeight:800,color:"#10b981"}}>€ {fmtM(dailyData.reduce((s,d)=>s+d.rev,0))}</td>
                      <td style={{padding:"10px 12px",fontWeight:800,color:"#ef4444"}}>€ {fmtM(dailyData.reduce((s,d)=>s+d.exp,0))}</td>
                      <td style={{padding:"10px 12px",fontWeight:900,color:"#38bdf8"}}>€ {fmtM(dailyData.reduce((s,d)=>s+d.profit,0))}</td>
                    </tr>
                    {dailyData.length > 0 && (
                      <tr style={{background:"#0f172a"}}>
                        <td style={{padding:"10px 12px",fontWeight:700,color:"#64748b"}}>Средно/ден</td>
                        <td style={{padding:"10px 12px",fontWeight:700,color:"#6ee7b7"}}>€ {fmtM(dailyData.reduce((s,d)=>s+d.rev,0)/dailyData.length)}</td>
                        <td style={{padding:"10px 12px",fontWeight:700,color:"#fca5a5"}}>€ {fmtM(dailyData.reduce((s,d)=>s+d.exp,0)/dailyData.length)}</td>
                        <td style={{padding:"10px 12px",fontWeight:700,color:"#7dd3fc"}}>€ {fmtM(dailyData.reduce((s,d)=>s+d.profit,0)/dailyData.length)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
            }
          </div>
        </div>
      </div>
      {/* Съпоставка по периоди */}
      <div style={{marginTop:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <div style={{fontSize:14,fontWeight:700,color:"#f1f5f9"}}>📊 Съпоставка приходи / разходи / печалба</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              <label style={{fontSize:10,color:"#64748b",fontWeight:700}}>ОТ</label>
              <input type="date" value={compareFrom} onChange={e=>setCompareFrom(e.target.value)} style={{width:145,fontSize:12}}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              <label style={{fontSize:10,color:"#64748b",fontWeight:700}}>ДО</label>
              <input type="date" value={compareTo} onChange={e=>setCompareTo(e.target.value)} style={{width:145,fontSize:12}}/>
            </div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {[
                ["Този месец", ()=>{ const n=new Date(); setCompareFrom(n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0")+"-01"); setCompareTo(new Date().toISOString().split("T")[0]); }],
                ["3 месеца", ()=>{ const n=new Date(); n.setMonth(n.getMonth()-2); setCompareFrom(n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0")+"-01"); setCompareTo(new Date().toISOString().split("T")[0]); }],
                ["Тази година", ()=>{ setCompareFrom(new Date().getFullYear()+"-01-01"); setCompareTo(new Date().toISOString().split("T")[0]); }],
              ].map(([label,fn])=>(
                <button key={label} onClick={fn} style={{padding:"6px 10px",borderRadius:7,fontSize:11,fontWeight:600,cursor:"pointer",border:"1px solid #334155",background:"#0f172a",color:"#64748b"}}>{label}</button>
              ))}
            </div>
            <MBtn color="#10b981" bg="#064e3b" onClick={exportCompare}>📊 Excel</MBtn>
          </div>
        </div>

        {compareMonths.length === 0
          ? <div style={{textAlign:"center",padding:32,color:"#475569",background:"#1e293b",borderRadius:12}}>Няма данни за избрания период</div>
          : <>
            {/* Обобщение */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:14}}>
              {[
                {l:"Общо приходи",v:compareMonths.reduce((s,m)=>s+m.rev,0),c:"#10b981"},
                {l:"Общо разходи",v:compareMonths.reduce((s,m)=>s+m.exp,0),c:"#ef4444"},
                {l:"Обща печалба",v:compareMonths.reduce((s,m)=>s+m.profit,0),c:"#38bdf8"},
              ].map(({l,v,c})=>(
                <div key={l} style={{background:"#1e293b",borderRadius:10,padding:"14px 16px",borderLeft:`3px solid ${c}`}}>
                  <div style={{fontSize:10,color:"#64748b",textTransform:"uppercase",fontWeight:700,marginBottom:4}}>{l}</div>
                  <div style={{fontSize:22,fontWeight:900,color:c}}>€ {fmtM(v)}</div>
                </div>
              ))}
            </div>

            {/* Таблица по месеци */}
            <div style={{background:"#1e293b",borderRadius:12,overflow:"hidden",marginBottom:14}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead style={{background:"#0a1628"}}>
                  <tr>
                    {["Месец","Приходи €","Разходи €","Печалба €","Дивиденти €",""].map(h=>(
                      <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compareMonths.map((m,i)=>(
                    <tr key={m.label} style={{borderTop:"1px solid #0f172a"}}
                      onMouseEnter={e=>e.currentTarget.style.background="#243044"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td style={{padding:"9px 14px",fontWeight:600,color:"#f1f5f9"}}>{m.label}</td>
                      <td style={{padding:"9px 14px",color:"#10b981",fontWeight:700}}>€ {fmtM(m.rev)}</td>
                      <td style={{padding:"9px 14px",color:"#ef4444"}}>€ {fmtM(m.exp)}</td>
                      <td style={{padding:"9px 14px",fontWeight:800,color:m.profit>=0?"#38bdf8":"#ef4444"}}>€ {fmtM(m.profit)}</td>
                      <td style={{padding:"9px 14px",color:"#f59e0b",fontWeight:700}}>€ {fmtM(dividends[m.key]||0)}</td>
                      <td style={{padding:"9px 14px",width:120}}>
                        <div style={{height:6,background:"#334155",borderRadius:3,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${Math.min(100,(m.rev/Math.max(...compareMonths.map(x=>x.rev),1))*100)}%`,background:"linear-gradient(90deg,#10b981,#059669)",borderRadius:3}}/>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr style={{borderTop:"2px solid #334155",background:"#0a1628"}}>
                    <td style={{padding:"10px 14px",fontWeight:800,color:"#f59e0b"}}>ОБЩО</td>
                    <td style={{padding:"10px 14px",fontWeight:800,color:"#10b981"}}>€ {fmtM(compareMonths.reduce((s,m)=>s+m.rev,0))}</td>
                    <td style={{padding:"10px 14px",fontWeight:800,color:"#ef4444"}}>€ {fmtM(compareMonths.reduce((s,m)=>s+m.exp,0))}</td>
                    <td style={{padding:"10px 14px",fontWeight:900,color:"#38bdf8"}}>€ {fmtM(compareMonths.reduce((s,m)=>s+m.profit,0))}</td>
                    <td style={{padding:"10px 14px",fontWeight:800,color:"#f59e0b"}}>€ {fmtM(compareMonths.reduce((s,m)=>s+(dividends[m.key]||0),0))}</td>
                    <td/>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        }
      </div>

      {/* Modal */}
      {modal!==null && (
        <ExpenseModal item={modal} onSave={save} onClose={()=>setModal(null)}/>
      )}

      {/* Modal */}
      {modal!==null && (
        <ExpenseModal item={modal} onSave={save} onClose={()=>setModal(null)}/>
      )}
    </div>
  );
}

function ExpenseModal({item, onSave, onClose}) {
  const [f,setF] = useState({description:"",amount:"",category:"Друго",is_paid:false,notes:"",from_cash:true,date:new Date().toISOString().split("T")[0],...item});
  const s = (k,v) => setF(x=>({...x,[k]:v}));
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.78)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#1e293b",borderRadius:16,width:"100%",maxWidth:480,boxShadow:"0 30px 80px rgba(0,0,0,.6)"}}>
        <div style={{padding:"16px 22px",borderBottom:"1px solid #334155",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h2 style={{margin:0,fontSize:17,fontWeight:800}}>{item?.id?"Редактирай разход":"Нов фиксиран разход"}</h2>
          <button onClick={onClose} style={{background:"#334155",border:"none",color:"#94a3b8",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:16}}>×</button>
        </div>
        <div style={{padding:22,display:"flex",flexDirection:"column",gap:12}}>
          <Row label="Описание *">
            <input value={f.description} onChange={e=>s("description",e.target.value)} placeholder="Наем, Заплата Иван..." style={{flex:1}}/>
          </Row>
          <Row label="Категория">
            <select value={f.category} onChange={e=>s("category",e.target.value)} style={{flex:1}}>
              {["Наем","Заплати","Сметки","Счетоводство","Куриери","Осигуровки","ДДС","Части","Реклама","Друго"].map(c=><option key={c}>{c}</option>)}
            </select>
          </Row>
          <Row label="Сума (€) *">
            <input type="number" min="0" step="0.01" value={f.amount||""} onChange={e=>s("amount",e.target.value)} placeholder="0.00" style={{flex:1}}/>
          </Row>
          <Row label="Плащане">
            <div style={{display:"flex",gap:8}}>
              {[true, false].map(val => (
                <button key={String(val)} type="button" onClick={()=>s("from_cash", val)} style={{
                  flex:1, padding:"8px 12px", borderRadius:8, border:"none", cursor:"pointer", fontWeight:700, fontSize:12,
                  background: f.from_cash === val ? (val ? "#064e3b" : "#1e3a5f") : "#0f172a",
                  color: f.from_cash === val ? (val ? "#6ee7b7" : "#93c5fd") : "#64748b",
                }}>
                  {val ? "💰 От каса" : "🏦 Не от каса"}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Статус">
            <button type="button" onClick={()=>s("is_paid",!f.is_paid)} style={{
              padding:"8px 20px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,
              background:f.is_paid?"#064e3b":"#450a0a",
              color:f.is_paid?"#6ee7b7":"#fca5a5",
            }}>{f.is_paid?"✅ Платено":"❌ Неплатено"}</button>
          </Row>
          <Row label="Бележки">
            <input value={f.notes||""} onChange={e=>s("notes",e.target.value)} placeholder="Допълнителна информация..." style={{flex:1}}/>
          </Row>
        </div>
        <div style={{padding:"14px 22px",borderTop:"1px solid #334155",display:"flex",justifyContent:"flex-end",gap:10}}>
          <button onClick={onClose} style={{background:"#334155",color:"#94a3b8",border:"none",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:600}}>Отказ</button>
          <button onClick={()=>{if(!f.description||!f.amount){alert("Попълни описание и сума!");return;}onSave(f);}} style={{background:"linear-gradient(135deg,#38bdf8,#0ea5e9)",color:"#fff",border:"none",borderRadius:8,padding:"9px 22px",cursor:"pointer",fontWeight:700}}>💾 Запази</button>
        </div>
      </div>
    </div>
  );
}
