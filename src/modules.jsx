import { useState } from "react";
import * as XLSX from "xlsx";
import { CATEGORIES } from "./lib/constants.js";

const today  = () => new Date().toISOString().split("T")[0];
const fmtDate= (d) => d ? new Date(d).toLocaleDateString("bg-BG") : "—";
const fmtM   = (n) => "€ " + Number(n||0).toFixed(2);

const PAYMENT_METHODS  = ["В брой","С карта","Банка","Еконт","Спиди","Не е платена"];
const EXPENSE_CATS     = ["Части","Услуга","Сметки","Наем","Заплати","Изкупуване на телефон","Теглене от каса","Друго"];
const BUYBACK_STATUSES = ["Чака потвърждение","Приет","Изкупен","Отказан"];
const DELIVERY_METHODS = ["На място","Еконт","Спиди"];
const SO_STATUSES      = ["Чака","Поръчана","Пристигнала","Отказана"];
const SO_COLORS        = {Чака:"#f59e0b",Поръчана:"#3b82f6",Пристигнала:"#10b981",Отказана:"#ef4444"};

export function MField({label,children,style={}}) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4,...style}}>
      <label style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.4}}>{label}</label>
      {children}
    </div>
  );
}
function MBtn({color="#38bdf8",bg,onClick,title,children,style={},disabled=false}) {
  return <button onClick={onClick} title={title} disabled={disabled} style={{background:bg||(color+"22"),color,border:"none",borderRadius:7,padding:"6px 10px",fontSize:13,display:"flex",alignItems:"center",gap:5,fontWeight:600,cursor:disabled?"not-allowed":"pointer",opacity:disabled?.6:1,...style}}>{children}</button>;
}
function MPrimaryBtn({onClick,children,color,disabled,style={}}) {
  return <button onClick={onClick} disabled={disabled} style={{background:color||"linear-gradient(135deg,#38bdf8,#0ea5e9)",color:"#fff",border:"none",borderRadius:9,padding:"9px 18px",fontWeight:700,fontSize:13,cursor:disabled?"not-allowed":"pointer",opacity:disabled?.6:1,display:"flex",alignItems:"center",gap:6,...style}}>{children}</button>;
}
function MCard({children,style={},className=""}) {
  const isScroll = className.includes("scroll-x");
  const s2 = isScroll
    ? {background:"#1e293b",borderRadius:12,padding:20,...style,overflowX:"auto",WebkitOverflowScrolling:"touch",display:"block"}
    : {background:"#1e293b",borderRadius:12,padding:20,...style};
  if(isScroll) return (
    <div className={className} style={s2}>
      <div style={{minWidth:520}}>{children}</div>
    </div>
  );
  return <div className={className} style={s2}>{children}</div>;
}
function MModal({title,subtitle,onClose,children,footer,maxWidth=620}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.78)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:8}}>
      <div style={{background:"#1e293b",borderRadius:16,width:"100%",maxWidth,maxHeight:"94vh",display:"flex",flexDirection:"column",boxShadow:"0 30px 80px rgba(0,0,0,.6)"}}>
        <div style={{padding:"16px 22px",borderBottom:"1px solid #334155",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div>
            <h2 style={{margin:0,fontSize:17,fontWeight:800}}>{title}</h2>
            {subtitle&&<div style={{fontSize:11,color:"#64748b",marginTop:2}}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{background:"#334155",border:"none",color:"#94a3b8",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:16}}>×</button>
        </div>
        <div style={{flex:1,overflow:"auto",padding:22}}>{children}</div>
        {footer&&<div style={{padding:"14px 22px",borderTop:"1px solid #334155",display:"flex",justifyContent:"flex-end",gap:10,flexShrink:0}}>{footer}</div>}
      </div>
    </div>
  );
}
function SBadge({text}) {
  const c=({Изкупен:"#10b981",Отказан:"#ef4444","Чака потвърждение":"#f59e0b",Платено:"#10b981",Неплатено:"#ef4444",Платена:"#10b981","Не е платена":"#ef4444","На място":"#38bdf8",Чака:"#f59e0b",Поръчана:"#3b82f6",Пристигнала:"#10b981","В брой":"#10b981","С карта":"#3b82f6",Банка:"#8b5cf6"})[text]||"#94a3b8";
  return <span style={{background:c+"22",color:c,padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{text||"—"}</span>;
}
function CancelBtn({onClick}) {
  return <button onClick={onClick} style={{background:"#334155",color:"#94a3b8",border:"none",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontWeight:600}}>Отказ</button>;
}

// ══ EXPENSES ══════════════════════════════════════════════════════════════════
export function ExpensesTab({expenses,cashRegister,onSaveExpense,onDeleteExpense,onSaveCash,notify}) {
  const [modal,setModal]=useState(null);
  const [date,setDate]=useState(today());
  const [showCash,setShowCash]=useState(false);
  const [cashInput,setCashInput]=useState("");
  const filtered=expenses.filter(e=>(e.date||"").slice(0,10)===date);
  const totalExp=filtered.reduce((s,e)=>s+Number(e.amount||0),0);
  const totalFromCash=filtered.filter(e=>e.from_cash!==false).reduce((s,e)=>s+Number(e.amount||0),0);
  const totalNotCash=filtered.filter(e=>e.from_cash===false).reduce((s,e)=>s+Number(e.amount||0),0);
  const cashEntry=cashRegister.find(c=>c.date===date);
  const openingCash=Number(cashEntry?.opening_cash||0);
  const exportDay=()=>{
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(filtered.map(e=>({Дата:e.date,Описание:e.description,Категория:e.category,"Платено на":e.paid_to||"","Сума €":Number(e.amount||0),Бележки:e.notes||""}))),  "Разходи");
    XLSX.writeFile(wb,`Разходи_${date}.xlsx`);
  };
  return (
    <div className="animate-fade">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h1 style={{margin:0,fontSize:22,fontWeight:800}}>💸 Разходи</h1>
        <div style={{display:"flex",gap:8}}>
          <MBtn color="#10b981" bg="#064e3b" onClick={exportDay}>📊 Excel</MBtn>
          <MBtn color="#f59e0b" bg="#451a03" onClick={()=>{setCashInput(cashEntry?.opening_cash||"");setShowCash(true);}}>💰 Начало на деня</MBtn>
          <MPrimaryBtn onClick={()=>setModal({})} color="linear-gradient(135deg,#ef4444,#dc2626)">+ Нов разход</MPrimaryBtn>
        </div>
      </div>
      <div className="m-exp-grid" style={{display:"grid",gridTemplateColumns:"auto 1fr 1fr 1fr",gap:14,marginBottom:18,alignItems:"end"}}>
        <MField label="Дата"><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:170}}/></MField>
        <MCard style={{padding:"12px 16px",borderLeft:"4px solid #10b981"}}><div style={{fontSize:11,color:"#64748b"}}>Начало на деня</div><div style={{fontSize:20,fontWeight:800,color:"#10b981"}}>{fmtM(openingCash)}</div></MCard>
        <MCard style={{padding:"12px 16px",borderLeft:"4px solid #ef4444"}}><div style={{fontSize:11,color:"#64748b"}}>Разходи</div><div style={{fontSize:20,fontWeight:800,color:"#ef4444"}}>{fmtM(totalExp)}</div></MCard>
        <MCard style={{padding:"12px 16px",borderLeft:"4px solid #38bdf8"}}><div style={{fontSize:11,color:"#64748b"}}>Баланс (каса)</div><div style={{fontSize:20,fontWeight:800,color:"#38bdf8"}}>{fmtM(openingCash-totalFromCash)}</div><div style={{fontSize:10,color:"#64748b",marginTop:2}}>Не от каса: {fmtM(totalNotCash)}</div></MCard>
      </div>
      <MCard className="scroll-x" style={{padding:0}}>
        <table>
          <thead style={{background:"#0a1628"}}><tr>{["Дата","Описание","Категория","Платено на","Сума","Бележки",""].map(h=><th key={h} style={{padding:"11px 14px",textAlign:"left",fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.length===0&&<tr><td colSpan={7} style={{textAlign:"center",padding:32,color:"#475569"}}>Няма разходи за {fmtDate(date)}</td></tr>}
            {filtered.map(e=>(
              <tr key={e.id} style={{borderTop:"1px solid #0f172a"}} onMouseEnter={ev=>ev.currentTarget.style.background="#243044"} onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
                <td style={{padding:"9px 14px",fontSize:12,color:"#64748b"}}>{fmtDate(e.date)}</td>
                <td style={{padding:"9px 14px",fontSize:13,fontWeight:600}}>{e.description}</td>
                <td style={{padding:"9px 14px"}}><div style={{display:"flex",gap:4,flexWrap:"wrap"}}><SBadge text={e.category}/>{e.from_cash===false&&<span style={{background:"#1e293b",color:"#64748b",padding:"3px 8px",borderRadius:20,fontSize:10,fontWeight:600}}>🏦 не от каса</span>}</div></td>
                <td style={{padding:"9px 14px",fontSize:12,color:"#94a3b8"}}>{e.paid_to||"—"}</td>
                <td style={{padding:"9px 14px",fontSize:14,fontWeight:800,color:"#ef4444"}}>{fmtM(e.amount)}</td>
                <td style={{padding:"9px 14px",fontSize:12,color:"#64748b"}}>{e.notes||"—"}</td>
                <td style={{padding:"9px 14px"}}><div style={{display:"flex",gap:4}}><MBtn color="#3b82f6" onClick={()=>setModal(e)}>✏️</MBtn><MBtn color="#ef4444" onClick={()=>{if(confirm("Изтрий?"))onDeleteExpense(e.id);}}>🗑️</MBtn></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </MCard>
      {modal!==null&&<ExpenseModal expense={modal} onSave={r=>{onSaveExpense(r);setModal(null);}} onClose={()=>setModal(null)}/>}
      {showCash&&<MModal title="💰 Начало на деня — Каса" onClose={()=>setShowCash(false)} footer={<><CancelBtn onClick={()=>setShowCash(false)}/><MPrimaryBtn onClick={()=>{onSaveCash({id:cashEntry?.id,date,opening_cash:Number(cashInput)||0});setShowCash(false);notify("💰 Касата е записана ✓");}} color="linear-gradient(135deg,#10b981,#059669)">💾 Запази</MPrimaryBtn></>}>
        <MField label={`Начална сума за ${fmtDate(date)} (€)`}><input type="number" min="0" step="0.01" value={cashInput} onChange={e=>setCashInput(e.target.value)} placeholder="0.00" style={{fontSize:22,fontWeight:800,textAlign:"center"}}/></MField>
        <p style={{color:"#64748b",fontSize:12,marginTop:12}}>Въведи с колко пари в брой започва касата.</p>
      </MModal>}
    </div>
  );
}

function ExpenseModal({expense,onSave,onClose}) {
  const [f,sf]=useState({date:today(),description:"",amount:"",category:"Друго",paid_to:"",notes:"",from_cash:true,...expense});
  const s=(k,v)=>sf(x=>({...x,[k]:v}));
  return (
    <MModal title={expense?.id?"Редактирай разход":"Нов разход"} onClose={onClose} footer={<><CancelBtn onClick={onClose}/><MPrimaryBtn onClick={()=>{if(!f.description||!f.amount){alert("Попълни описание и сума!");return;}onSave(f);}} color="linear-gradient(135deg,#ef4444,#dc2626)">💾 Запази</MPrimaryBtn></>}>
      <div className="m-modal-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <MField label="Дата"><input type="date" value={f.date} onChange={e=>s("date",e.target.value)}/></MField>
        <MField label="Категория"><select value={f.category} onChange={e=>s("category",e.target.value)}>{EXPENSE_CATS.map(c=><option key={c}>{c}</option>)}</select></MField>
        <MField label="Описание *" style={{gridColumn:"1/-1"}}><input value={f.description} onChange={e=>s("description",e.target.value)} placeholder="За какво е разходът..."/></MField>
        <MField label="Платено на"><input value={f.paid_to||""} onChange={e=>s("paid_to",e.target.value)} placeholder="Доставчик, лице..."/></MField>
        <MField label="Сума (€) *"><input type="number" min="0" step="0.01" value={f.amount||""} onChange={e=>s("amount",e.target.value)} placeholder="0.00"/></MField>
        <MField label="Бележки" style={{gridColumn:"1/-1"}}><textarea value={f.notes||""} onChange={e=>s("notes",e.target.value)} rows={2} style={{resize:"vertical"}}/></MField>
        <div style={{gridColumn:"1/-1",paddingTop:8,borderTop:"1px solid #334155"}}>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
            <div style={{position:"relative",width:44,height:24,background:f.from_cash!==false?"#10b981":"#334155",borderRadius:12,transition:"background .2s",flexShrink:0}} onClick={()=>s("from_cash",f.from_cash===false?true:false)}>
              <div style={{position:"absolute",top:2,left:f.from_cash!==false?22:2,width:20,height:20,background:"#fff",borderRadius:"50%",transition:"left .2s"}}/>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:f.from_cash!==false?"#10b981":"#94a3b8"}}>
                {f.from_cash!==false?"💰 Платено от каса":"🏦 Не е платено от каса"}
              </div>
              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>
                {f.from_cash!==false?"Сумата ще намали наличността в касата":"Касата няма да се промени"}
              </div>
            </div>
          </label>
        </div>
      </div>
    </MModal>
  );
}

// ══ ACCESSORY SALES ════════════════════════════════════════════════════════════
export function AccessorySalesTab({sales,inventory,onSave,onDelete,notify}) {
  const [modal,setModal]=useState(null);
  const [date,setDate]=useState(today());
  const filtered=sales.filter(s=>(s.date||"").slice(0,10)===date);
  const totalRev=filtered.reduce((s,r)=>s+Number(r.sale_price||0)*Number(r.quantity||1),0);
  const totalCost=filtered.reduce((s,r)=>s+Number(r.cost_price||0)*Number(r.quantity||1),0);
  const exportDay=()=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(filtered.map(r=>({Дата:r.date,Артикул:r.item_name,"Бр.":r.quantity,"Доставна €":r.cost_price,"Продажна €":r.sale_price,"Общо €":Number(r.sale_price||0)*Number(r.quantity||1),Плащане:r.payment_method,Купувач:r.buyer_name||""}))), "Аксесоари");XLSX.writeFile(wb,`Аксесоари_${date}.xlsx`);};
  return (
    <div className="animate-fade">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h1 style={{margin:0,fontSize:22,fontWeight:800}}>🎧 Продажби аксесоари</h1>
        <div style={{display:"flex",gap:8}}><MBtn color="#10b981" bg="#064e3b" onClick={exportDay}>📊 Excel</MBtn><MPrimaryBtn onClick={()=>setModal({})}>+ Нова продажба</MPrimaryBtn></div>
      </div>
      <div style={{display:"flex",gap:12,marginBottom:16,alignItems:"flex-end"}}>
        <MField label="Дата"><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:170}}/></MField>
        <MCard style={{padding:"12px 16px",borderLeft:"4px solid #10b981",flex:1}}><div style={{fontSize:11,color:"#64748b"}}>Приход</div><div style={{fontSize:20,fontWeight:800,color:"#10b981"}}>{fmtM(totalRev)}</div></MCard>
        <MCard style={{padding:"12px 16px",borderLeft:"4px solid #f59e0b",flex:1}}><div style={{fontSize:11,color:"#64748b"}}>Печалба</div><div style={{fontSize:20,fontWeight:800,color:"#f59e0b"}}>{fmtM(totalRev-totalCost)}</div></MCard>
      </div>
      <MCard className="scroll-x" style={{padding:0}}>
        <table>
          <thead style={{background:"#0a1628"}}><tr>{["Дата","Артикул","Бр.","Продажна","Общо","Плащане","Купувач",""].map(h=><th key={h} style={{padding:"11px 14px",textAlign:"left",fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.length===0&&<tr><td colSpan={8} style={{textAlign:"center",padding:32,color:"#475569"}}>Няма продажби за {fmtDate(date)}</td></tr>}
            {filtered.map(r=>(
              <tr key={r.id} style={{borderTop:"1px solid #0f172a"}} onMouseEnter={e=>e.currentTarget.style.background="#243044"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <td style={{padding:"9px 14px",fontSize:12,color:"#64748b"}}>{fmtDate(r.date)}</td>
                <td style={{padding:"9px 14px",fontSize:13,fontWeight:600}}>{r.item_name}</td>
                <td style={{padding:"9px 14px"}}>{r.quantity}</td>
                <td style={{padding:"9px 14px",fontWeight:700,color:"#10b981"}}>{fmtM(r.sale_price)}</td>
                <td style={{padding:"9px 14px",fontWeight:800,color:"#10b981"}}>{fmtM(Number(r.sale_price)*Number(r.quantity||1))}</td>
                <td style={{padding:"9px 14px"}}><SBadge text={r.payment_method}/></td>
                <td style={{padding:"9px 14px",fontSize:12,color:"#94a3b8"}}>{r.buyer_name||"—"}</td>
                <td style={{padding:"9px 14px"}}><div style={{display:"flex",gap:4}}><MBtn color="#3b82f6" onClick={()=>setModal(r)}>✏️</MBtn>
                  <MBtn color="#fbbf24" title="Гаранционна карта" onClick={()=>onWarranty&&onWarranty({id:r.id,client_name:r.buyer_name,phone:r.buyer_phone,device_type:r.brand,brand:r.brand,model:r.model,serial_number:r.serial_number||r.imei,problem:"Продажба на телефон",technician:"",warranty_days:r.warranty_days||30,warranty_amount:r.warranty_amount||1,warranty_unit:r.warranty_unit||"месеца",date_out:r.date})}>🛡️</MBtn>
                  <MBtn color="#ef4444" onClick={()=>{if(confirm("Изтрий?"))onDelete(r.id);}}>🗑️</MBtn></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </MCard>
      {modal!==null&&<AccSaleModal sale={modal} inventory={inventory} onSave={r=>{onSave(r,modal);setModal(null);}} onClose={()=>setModal(null)}/>}
    </div>
  );
}

function AccSaleModal({sale,inventory,onSave,onClose}) {
  const [f,sf]=useState({date:today(),item_name:"",inventory_id:null,quantity:1,cost_price:"",sale_price:"",payment_method:"В брой",buyer_name:"",notes:"",...sale});
  const [invSearch,setInvSearch]=useState("");
  const [invCat,setInvCat]=useState("Всички");
  const s=(k,v)=>sf(x=>({...x,[k]:v}));
  const avail=inventory.filter(i=>Number(i.quantity)>0);
  const cats=["Всички",...new Set(avail.map(i=>i.category).filter(Boolean))];
  const filteredInv=avail.filter(i=>{
    const q=invSearch.toLowerCase();
    const matchCat=invCat==="Всички"||i.category===invCat;
    const matchSearch=!q||i.name.toLowerCase().includes(q)||(i.supplier||"").toLowerCase().includes(q)||(i.category||"").toLowerCase().includes(q);
    return matchCat&&matchSearch;
  });
  const selectItem=(inv)=>{s("inventory_id",inv.id);s("item_name",inv.name);s("cost_price",inv.cost||0);s("sale_price",inv.price||0);};
  return (
    <MModal title={sale?.id?"Редактирай":"Нова продажба аксесоар"} onClose={onClose} maxWidth={680} footer={<><CancelBtn onClick={onClose}/><MPrimaryBtn onClick={()=>{if(!f.item_name){alert("Избери артикул!");return;}onSave(f);}}>💾 Запази</MPrimaryBtn></>}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {/* Search + category filter */}
        <div>
          <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.4,marginBottom:6}}>Избери от склада</div>
          <input
            placeholder="🔍  Търси по наименование, категория, доставчик..."
            value={invSearch} onChange={e=>setInvSearch(e.target.value)}
            style={{marginBottom:8}}
          />
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
            {cats.map(c=>(
              <button key={c} onClick={()=>setInvCat(c)} style={{
                padding:"3px 10px",borderRadius:6,fontSize:11,fontWeight:600,
                cursor:"pointer",border:"none",
                background:invCat===c?"#38bdf8":"#0f172a",
                color:invCat===c?"#0f172a":"#64748b",
              }}>{c}</button>
            ))}
          </div>
          {/* Items grid */}
          <div style={{display:"flex",flexWrap:"wrap",gap:6,maxHeight:160,overflow:"auto",padding:2}}>
            {filteredInv.map(i=>(
              <button key={i.id} onClick={()=>selectItem(i)} style={{
                background: f.inventory_id===i.id?"#064e3b":"#0f172a",
                color: f.inventory_id===i.id?"#6ee7b7":"#94a3b8",
                border: f.inventory_id===i.id?"1px solid #10b981":"1px solid #334155",
                borderRadius:7,padding:"6px 12px",fontSize:11,cursor:"pointer",textAlign:"left",
              }}>
                <div style={{fontWeight:600,marginBottom:2}}>{i.name}</div>
                <div style={{display:"flex",gap:8,fontSize:10}}>
                  <span style={{color:"#64748b"}}>{i.category}</span>
                  <span style={{color:"#f59e0b"}}>{i.quantity} бр.</span>
                  <span style={{color:"#10b981",fontWeight:700}}>{fmtM(i.price)}</span>
                </div>
              </button>
            ))}
            {filteredInv.length===0&&<p style={{color:"#475569",fontSize:12,padding:"8px 0"}}>Няма намерени артикули</p>}
          </div>
        </div>
        <div className="m-modal-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <MField label="Наименование *"><input value={f.item_name} onChange={e=>s("item_name",e.target.value)} placeholder="Артикул..."/></MField>
          <MField label="Дата"><input type="date" value={f.date} onChange={e=>s("date",e.target.value)}/></MField>
          <MField label="Бройки"><input type="number" min="1" value={f.quantity} onChange={e=>s("quantity",Number(e.target.value))}/></MField>
          <MField label="Плащане"><select value={f.payment_method} onChange={e=>s("payment_method",e.target.value)}>{PAYMENT_METHODS.map(p=><option key={p}>{p}</option>)}</select></MField>
          <MField label="Доставна (€)"><input type="number" min="0" step="0.01" value={f.cost_price||""} onChange={e=>s("cost_price",e.target.value)} placeholder="0.00"/></MField>
          <MField label="Продажна (€)"><input type="number" min="0" step="0.01" value={f.sale_price||""} onChange={e=>s("sale_price",e.target.value)} placeholder="0.00"/></MField>
          <MField label="Купувач" style={{gridColumn:"1/-1"}}><input value={f.buyer_name||""} onChange={e=>s("buyer_name",e.target.value)} placeholder="Имена..."/></MField>
        </div>
      </div>
    </MModal>
  );
}

// ══ BUYBACKS ════════════════════════════════════════════════════════════════════
export function BuybacksTab({buybacks,inventory,onSave,onDelete,onAddToInventory,notify}) {
  const [modal,setModal]=useState(null);
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("Всички");
  const filtered=buybacks.filter(b=>{
    const q=search.toLowerCase();
    return (!q||[b.brand,b.model,b.imei,b.seller_name,b.seller_phone].some(f=>(f||"").toLowerCase().includes(q)))&&(filter==="Всички"||b.status===filter);
  });
  const printProtocol=(b)=>{
    const w=window.open("","_blank");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Протокол изкупуване</title>
    <style>body{font-family:Arial,sans-serif;padding:40px;color:#111;max-width:720px;margin:auto}h1{font-size:20px;border-bottom:3px solid #1a56db;padding-bottom:8px;color:#1a56db;margin-bottom:20px}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{border:1px solid #ccc;padding:9px 12px;font-size:13px;vertical-align:top}th{background:#f3f4f6;text-align:left;font-weight:600;width:180px}.sig-row{display:flex;justify-content:space-between;margin-top:60px;gap:40px}.sig-box{flex:1;text-align:center}.sig-box hr{border:1px solid #999;margin-bottom:6px}.sig-box p{font-size:12px;color:#555;margin:2px 0}.notice{margin-top:20px;padding:12px;background:#fef9c3;border:1px solid #fde047;border-radius:6px;font-size:12px;color:#713f12}@media print{body{padding:20px}}</style></head><body>
    <h1>📄 ПРОТОКОЛ ЗА ИЗКУПУВАНЕ НА УСТРОЙСТВО</h1>
    <table>
      <tr><th>Дата</th><td>${fmtDate(b.date)}</td></tr>
      <tr><th>Три имена на продавача</th><td>${b.seller_name||"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"}</td></tr>
      <tr><th>ЕГН на продавача</th><td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td></tr>
      <tr><th>Телефон за контакт</th><td>${b.seller_phone||"&nbsp;"}</td></tr>
      <tr><th>Марка</th><td>${b.brand||"&nbsp;"}</td></tr>
      <tr><th>Модел</th><td>${b.model||"&nbsp;"}</td></tr>
      <tr><th>IMEI / Сериен №</th><td>${b.imei||"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"}</td></tr>
      <tr><th>Цвят</th><td>${b.color||"&nbsp;"}</td></tr>
      <tr><th>Състояние</th><td>${b.condition||"&nbsp;"}</td></tr>
      <tr><th>Описание на дефекти</th><td>${b.problem||"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"}</td></tr>
      <tr><th>Сума на изкупуване</th><td style="font-size:18px;font-weight:800;color:#065f46">€ ${Number(b.price||0).toFixed(2)}</td></tr>
    </table>
    <div class="notice">Декларирам, че съм законен собственик на описаното устройство и го предавам доброволно срещу посочената сума. Устройството не е предмет на престъпление и не е обременено с права на трети лица.</div>
    <div class="sig-row">
      <div class="sig-box"><hr><p>Продавач: <b>${b.seller_name||"........................"}</b></p><p>Подпис: ........................</p></div>
      <div class="sig-box"><hr><p>Купувач: <b>........................</b></p><p>Подпис: ........................</p></div>
    </div>
    <p style="font-size:11px;color:#999;margin-top:24px;text-align:center">RepairPro — ${new Date().toLocaleString("bg-BG")}</p>
    <script>window.onload=()=>{window.print();}</script></body></html>`);
    w.document.close();
  };
  const exportAll=()=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(filtered.map(b=>({Дата:b.date,Марка:b.brand,Модел:b.model,IMEI:b.imei||"",Продавач:b.seller_name||"",Телефон:b.seller_phone||"","Цена €":Number(b.price||0),Статус:b.status,"В склада":b.added_to_stock?"Да":"Не"}))), "Изкупуване");XLSX.writeFile(wb,`Изкупуване_${today()}.xlsx`);};
  return (
    <div className="animate-fade">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h1 style={{margin:0,fontSize:22,fontWeight:800}}>📱 Изкупуване на телефони</h1>
        <div style={{display:"flex",gap:8}}><MBtn color="#10b981" bg="#064e3b" onClick={exportAll}>📊 Excel</MBtn><MPrimaryBtn onClick={()=>setModal({})}>+ Нов запис</MPrimaryBtn></div>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <input placeholder="🔍  Търси..." value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1}}/>
        <div style={{display:"flex",gap:5}}>{["Всички",...BUYBACK_STATUSES].map(s=>(
          <button key={s} onClick={()=>setFilter(s)} style={{padding:"5px 11px",borderRadius:7,fontSize:11,fontWeight:600,cursor:"pointer",border:"none",background:filter===s?({Изкупен:"#10b981",Отказан:"#ef4444","Чака потвърждение":"#f59e0b"}[s]||"#38bdf8"):"#1e293b",color:filter===s?"#fff":"#64748b"}}>{s}</button>
        ))}</div>
      </div>
      <MCard className="scroll-x" style={{padding:0}}>
        <table>
          <thead style={{background:"#0a1628"}}><tr>{["Дата","Устройство","IMEI","Продавач","Телефон","Цена","Статус","Склад",""].map(h=><th key={h} style={{padding:"11px 14px",textAlign:"left",fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.length===0&&<tr><td colSpan={9} style={{textAlign:"center",padding:32,color:"#475569"}}>Няма записи</td></tr>}
            {filtered.map(b=>(
              <tr key={b.id} style={{borderTop:"1px solid #0f172a"}} onMouseEnter={e=>e.currentTarget.style.background="#243044"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <td style={{padding:"9px 14px",fontSize:12,color:"#64748b"}}>{fmtDate(b.date)}</td>
                <td style={{padding:"9px 14px",fontSize:13,fontWeight:600}}>{b.brand} {b.model}</td>
                <td style={{padding:"9px 14px",fontSize:11,fontFamily:"monospace",color:"#94a3b8"}}>{b.imei||"—"}</td>
                <td style={{padding:"9px 14px",fontSize:12}}>{b.seller_name||"—"}</td>
                <td style={{padding:"9px 14px",fontSize:12,color:"#94a3b8"}}>{b.seller_phone||"—"}</td>
                <td style={{padding:"9px 14px",fontSize:13,fontWeight:700,color:"#10b981"}}>{fmtM(b.price)}</td>
                <td style={{padding:"9px 14px"}}><SBadge text={b.status}/></td>
                <td style={{padding:"9px 14px"}}>{b.added_to_stock?<span style={{fontSize:11,color:"#10b981"}}>✅ Заприходен</span>:b.status==="Изкупен"?<MBtn color="#8b5cf6" onClick={()=>onAddToInventory(b)} style={{fontSize:11,padding:"3px 8px"}}>📦 Заприходи</MBtn>:<span style={{fontSize:11,color:"#64748b"}}>—</span>}</td>
                <td style={{padding:"9px 14px"}}><div style={{display:"flex",gap:3}}>
                  <MBtn color="#3b82f6" onClick={()=>setModal(b)}>✏️</MBtn>
                  <MBtn color="#8b5cf6" onClick={()=>printProtocol(b)} title="Протокол">📄</MBtn>
                  <MBtn color="#ef4444" onClick={()=>{if(confirm("Изтрий?"))onDelete(b.id);}}>🗑️</MBtn>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </MCard>
      {modal!==null&&<BuybackModal buyback={modal} onSave={r=>{onSave(r);setModal(null);}} onClose={()=>setModal(null)}/>}
    </div>
  );
}

function BuybackModal({buyback,onSave,onClose}) {
  const [f,sf]=useState({date:today(),brand:"",model:"",imei:"",color:"",condition:"",problem:"",seller_name:"",seller_phone:"",price:"",status:"Чака потвърждение",notes:"",...buyback});
  const s=(k,v)=>sf(x=>({...x,[k]:v}));
  return (
    <MModal title={buyback?.id?"Редактирай":"Ново изкупуване"} onClose={onClose} maxWidth={700} footer={<><CancelBtn onClick={onClose}/><MPrimaryBtn onClick={()=>{if(!f.brand||!f.model){alert("Въведи марка и модел!");return;}onSave(f);}}>💾 Запази</MPrimaryBtn></>}>
      <div className="m-modal-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <MField label="Дата"><input type="date" value={f.date} onChange={e=>s("date",e.target.value)}/></MField>
        <MField label="Статус"><select value={f.status} onChange={e=>s("status",e.target.value)}>{BUYBACK_STATUSES.map(x=><option key={x}>{x}</option>)}</select></MField>
        <MField label="Марка *"><input value={f.brand||""} onChange={e=>s("brand",e.target.value)} placeholder="Apple / Samsung..."/></MField>
        <MField label="Модел *"><input value={f.model||""} onChange={e=>s("model",e.target.value)} placeholder="iPhone 13..."/></MField>
        <MField label="IMEI"><input value={f.imei||""} onChange={e=>s("imei",e.target.value)} placeholder="358XXXXXXXXXXXX"/></MField>
        <MField label="Цвят"><input value={f.color||""} onChange={e=>s("color",e.target.value)} placeholder="Черен / Бял..."/></MField>
        <MField label="Състояние"><input value={f.condition||""} onChange={e=>s("condition",e.target.value)} placeholder="Счупен дисплей..."/></MField>
        <MField label="Цена (€)"><input type="number" min="0" step="0.01" value={f.price||""} onChange={e=>s("price",e.target.value)} placeholder="0.00"/></MField>
        <MField label="Три имена на продавача"><input value={f.seller_name||""} onChange={e=>s("seller_name",e.target.value)} placeholder="Иван Иванов"/></MField>
        <MField label="Телефон на продавача"><input value={f.seller_phone||""} onChange={e=>s("seller_phone",e.target.value)} placeholder="0888 123 456"/></MField>
        <MField label="Дефекти / Проблем" style={{gridColumn:"1/-1"}}><textarea value={f.problem||""} onChange={e=>s("problem",e.target.value)} rows={2} style={{resize:"vertical"}} placeholder="Описание..."/></MField>
      </div>
    </MModal>
  );
}

// ══ PARTS SALES ════════════════════════════════════════════════════════════════
export function PartsSalesTab({sales,inventory,onSave,onDelete}) {
  const [modal,setModal]=useState(null);
  const [date,setDate]=useState(today());
  const [search,setSearch]=useState("");
  const filtered=sales.filter(s=>{const q=search.toLowerCase();return(!q||[s.part_name,s.buyer_name,s.buyer_city,s.tracking_number].some(f=>(f||"").toLowerCase().includes(q)))&&(!date||(s.date||"").slice(0,10)===date);});
  const totalRev=filtered.reduce((s,r)=>s+Number(r.sale_price||0)*Number(r.quantity||1),0);
  const exportAll=()=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(filtered.map(r=>({Дата:r.date,Артикул:r.part_name,"Бр.":r.quantity,"Продажна €":r.sale_price,Плащане:r.payment_method,Статус:r.payment_status,Доставка:r.delivery_method,Купувач:r.buyer_name||"",Телефон:r.buyer_phone||"",Град:r.buyer_city||"","Товарителница":r.tracking_number||""}))), "Продажби части");XLSX.writeFile(wb,`Продажби_части_${today()}.xlsx`);};
  return (
    <div className="animate-fade">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h1 style={{margin:0,fontSize:22,fontWeight:800}}>🔩 Продажба резервни части</h1>
        <div style={{display:"flex",gap:8}}><MBtn color="#10b981" bg="#064e3b" onClick={exportAll}>📊 Excel</MBtn><MPrimaryBtn onClick={()=>setModal({})}>+ Нова продажба</MPrimaryBtn></div>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"flex-end"}}>
        <MField label="Дата"><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:170}}/></MField>
        <button onClick={()=>setDate("")} style={{background:"#334155",color:"#94a3b8",border:"none",borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:12,marginBottom:1}}>Всички</button>
        <input placeholder="🔍  Търси..." value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1}}/>
        <MCard style={{padding:"10px 16px",borderLeft:"4px solid #10b981"}}><div style={{fontSize:11,color:"#64748b"}}>Приход</div><div style={{fontSize:18,fontWeight:800,color:"#10b981"}}>{fmtM(totalRev)}</div></MCard>
      </div>
      <MCard className="scroll-x" style={{padding:0}}>
        <table>
          <thead style={{background:"#0a1628"}}><tr>{["Дата","Артикул","Бр.","Продажна","Плащане","Статус","Доставка","Купувач","Товарит.",""].map(h=><th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.length===0&&<tr><td colSpan={10} style={{textAlign:"center",padding:32,color:"#475569"}}>Няма продажби</td></tr>}
            {filtered.map(r=>(
              <tr key={r.id} style={{borderTop:"1px solid #0f172a"}} onMouseEnter={e=>e.currentTarget.style.background="#243044"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <td style={{padding:"8px 12px",fontSize:11,color:"#64748b"}}>{fmtDate(r.date)}</td>
                <td style={{padding:"8px 12px",fontSize:12,fontWeight:600}}>{r.part_name}</td>
                <td style={{padding:"8px 12px"}}>{r.quantity}</td>
                <td style={{padding:"8px 12px",fontWeight:700,color:"#10b981"}}>{fmtM(r.sale_price)}</td>
                <td style={{padding:"8px 12px"}}><SBadge text={r.payment_method}/></td>
                <td style={{padding:"8px 12px"}}><SBadge text={r.payment_status}/></td>
                <td style={{padding:"8px 12px"}}><SBadge text={r.delivery_method}/></td>
                <td style={{padding:"8px 12px",fontSize:12}}>{r.buyer_name||"—"}</td>
                <td style={{padding:"8px 12px",fontSize:11,fontFamily:"monospace",color:"#94a3b8"}}>{r.tracking_number||"—"}</td>
                <td style={{padding:"8px 12px"}}><div style={{display:"flex",gap:3}}>
                  <MBtn color="#3b82f6" onClick={()=>setModal(r)}>✏️</MBtn>
                  {r.payment_status==="Не е платена"&&<MBtn color="#10b981" onClick={()=>onSave({...r,payment_status:"Платена"})} title="Отбележи платена">✅</MBtn>}
                  <MBtn color="#ef4444" onClick={()=>{if(confirm("Изтрий?"))onDelete(r.id);}}>🗑️</MBtn>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </MCard>
      {modal!==null&&<PartsSaleModal sale={modal} inventory={inventory} onSave={r=>{onSave(r);setModal(null);}} onClose={()=>setModal(null)}/>}
    </div>
  );
}

// Print stock receipt
function printStockReceipt(sale) {
  const items = sale.items || [{name:sale.part_name,qty:sale.quantity||1,cost:sale.cost_price||0,price:sale.sale_price||0}];
  const totalCost = items.reduce((s,i)=>s+Number(i.cost||0)*Number(i.qty||1),0);
  const totalSale = items.reduce((s,i)=>s+Number(i.price||0)*Number(i.qty||1),0);
  const w = window.open("","_blank");
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Стокова разписка</title>
  <style>
    body{font-family:Arial,sans-serif;padding:32px;color:#111;max-width:680px;margin:auto}
    h1{font-size:18px;border-bottom:3px solid #1a56db;padding-bottom:8px;color:#1a56db;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin:12px 0}
    td,th{border:1px solid #ccc;padding:8px 10px;font-size:13px}
    th{background:#f3f4f6;font-weight:700;text-align:left}
    .total{background:#f0fdf4;font-weight:800;font-size:15px}
    .info{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:13px}
    .info span{color:#555}
    .sig-row{display:flex;justify-content:space-between;margin-top:50px;gap:40px}
    .sig-box{flex:1;text-align:center}
    .sig-box hr{border:1px solid #999;margin-bottom:6px}
    @media print{body{padding:16px}}
  </style></head><body>
  <h1>📦 СТОКОВА РАЗПИСКА</h1>
  <div class="info">
    <div><b>Дата:</b> <span>${fmtDate(sale.date)}</span></div>
    <div><b>Плащане:</b> <span>${sale.payment_method||"—"}</span></div>
    <div><b>Купувач:</b> <span>${sale.buyer_name||"—"}</span></div>
    <div><b>Телефон:</b> <span>${sale.buyer_phone||"—"}</span></div>
    ${sale.delivery_method&&sale.delivery_method!=="На място"?`<div><b>Доставка:</b> <span>${sale.delivery_method} ${sale.delivery_type||""}</span></div><div><b>Град:</b> <span>${sale.buyer_city||"—"}</span></div>`:""}
    ${sale.tracking_number?`<div><b>Товарителница:</b> <span>${sale.tracking_number}</span></div>`:""}
  </div>
  <table>
    <thead><tr><th>#</th><th>Наименование</th><th>Бр.</th><th>Доставна €</th><th>Продажна €</th><th>Общо €</th></tr></thead>
    <tbody>
      ${items.map((i,idx)=>`<tr><td>${idx+1}</td><td>${i.name}</td><td>${i.qty||1}</td><td>${Number(i.cost||0).toFixed(2)}</td><td>${Number(i.price||0).toFixed(2)}</td><td><b>${(Number(i.price||0)*Number(i.qty||1)).toFixed(2)}</b></td></tr>`).join("")}
      <tr class="total"><td colspan="3">ОБЩО</td><td>${totalCost.toFixed(2)}</td><td></td><td>€ ${totalSale.toFixed(2)}</td></tr>
    </tbody>
  </table>
  <div class="sig-row">
    <div class="sig-box"><hr><p>Продал: ........................</p></div>
    <div class="sig-box"><hr><p>Купил: <b>${sale.buyer_name||"........................"}</b></p></div>
  </div>
  <p style="font-size:11px;color:#999;margin-top:20px;text-align:center">RepairPro — ${new Date().toLocaleString("bg-BG")}</p>
  <script>window.onload=()=>{window.print();}</script>
  </body></html>`);
  w.document.close();
}

function PartsSaleModal({sale,inventory,onSave,onClose}) {
  const emptyForm = {date:today(),part_name:"",inventory_id:null,category:"",quantity:1,cost_price:"",sale_price:"",payment_method:"В брой",payment_status:"Платена",delivery_method:"На място",delivery_type:"",buyer_name:"",buyer_phone:"",buyer_city:"",buyer_address:"",tracking_number:"",notes:""};
  const [f,sf]  = useState({...emptyForm,...sale});
  const [items, setItems] = useState(sale?.items || []);
  const [invSearch,  setInvSearch]  = useState("");
  const [invCat,     setInvCat]     = useState("Всички");
  const [manualMode, setManualMode] = useState(false);
  const sv=(k,v)=>sf(x=>({...x,[k]:v}));

  const avail = inventory.filter(i=>Number(i.quantity)>0);
  const cats  = ["Всички",...new Set(avail.map(i=>i.category).filter(Boolean))];
  const filteredInv = avail.filter(i=>{
    const q=invSearch.toLowerCase();
    return (invCat==="Всички"||i.category===invCat)&&(!q||i.name.toLowerCase().includes(q)||(i.category||"").toLowerCase().includes(q)||(i.supplier||"").toLowerCase().includes(q));
  });

  const addItem=(inv)=>{
    setItems(prev=>{
      const ex=prev.find(x=>x.inv_id===inv.id);
      if(ex) return prev.map(x=>x.inv_id===inv.id?{...x,qty:x.qty+1}:x);
      // default markup: use existing price as sale price, calculate markup %
      const cost=Number(inv.cost||0);
      const price=Number(inv.price||0);
      const markup=cost>0?Math.round(((price-cost)/cost)*100):0;
      return [...prev,{inv_id:inv.id,name:inv.name,category:inv.category||"",qty:1,cost,markup,price}];
    });
    if(items.length===0) sv("part_name",inv.name);
  };
  const removeItem=(inv_id)=>setItems(prev=>prev.filter(x=>x.inv_id!==inv_id));
  const updateQty=(inv_id,qty)=>setItems(prev=>prev.map(x=>x.inv_id===inv_id?{...x,qty:Math.max(1,Number(qty))}:x));
  const updateMarkup=(inv_id,markup)=>setItems(prev=>prev.map(x=>x.inv_id===inv_id?{...x,markup:Number(markup),price:Number((x.cost*(1+Number(markup)/100)).toFixed(2))}:x));
  const updatePrice=(inv_id,price)=>setItems(prev=>prev.map(x=>x.inv_id===inv_id?{...x,price:Number(price),markup:x.cost>0?Math.round(((Number(price)-x.cost)/x.cost)*100):0}:x));

  const totalCost = items.reduce((s,i)=>s+Number(i.cost||0)*Number(i.qty||1),0);
  const totalSale = items.reduce((s,i)=>s+Number(i.price||0)*Number(i.qty||1),0);

  const handleSave=()=>{
    if(items.length===0&&!f.part_name){alert("Добави поне един артикул!");return;}
    const finalPart = items.length>0 ? items.map(i=>i.name).join(", ") : f.part_name;
    const finalCost = items.length>0 ? totalCost : Number(f.cost_price||0);
    const finalSale = items.length>0 ? totalSale : Number(f.sale_price||0);
    onSave({...f, part_name:finalPart, cost_price:finalCost, sale_price:finalSale, quantity:items.length>0?items.reduce((s,i)=>s+i.qty,0):f.quantity, items:items.length>0?items:null});
  };

  const handlePrint=()=>{
    const finalPart = items.length>0?items.map(i=>i.name).join(", "):f.part_name;
    printStockReceipt({...f, part_name:finalPart, cost_price:totalCost||f.cost_price, sale_price:totalSale||f.sale_price, items:items.length>0?items:[{name:f.part_name,qty:f.quantity||1,cost:f.cost_price||0,price:f.sale_price||0}]});
  };

  return (
    <MModal title={sale?.id?"Редактирай":"Нова продажба части"} onClose={onClose} maxWidth={860}
      footer={<>
        <CancelBtn onClick={onClose}/>
        <button onClick={handlePrint} style={{background:"#2e1065",color:"#a78bfa",border:"1px solid #7c3aed",borderRadius:8,padding:"9px 16px",cursor:"pointer",fontWeight:600,fontSize:13}}>🖨️ Разписка</button>
        <MPrimaryBtn onClick={handleSave}>💾 Запази</MPrimaryBtn>
      </>}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

        {/* LEFT: inventory picker */}
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.4}}>{manualMode?"Ръчно въвеждане":"Избери от склада"}</div>
            <button onClick={()=>{setManualMode(p=>!p);sv("inventory_id",null);}} style={{fontSize:11,background:"#334155",color:"#94a3b8",border:"none",borderRadius:6,padding:"3px 10px",cursor:"pointer"}}>
              {manualMode?"📦 От склада":"✏️ Ръчно"}
            </button>
          </div>
          {manualMode ? (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <MField label="Наименование на частта *">
                <input value={f.part_name} onChange={e=>sv("part_name",e.target.value)} placeholder="Въведи ръчно..."/>
              </MField>
              <MField label="Категория">
                <select value={f.category||""} onChange={e=>sv("category",e.target.value)}>
                  <option value="">— Избери —</option>
                  {CATEGORIES.map(c=><option key={c}>{c}</option>)}
                </select>
              </MField>
            </div>
          ) : (<>
          <input placeholder="🔍  Търси по наименование, категория..." value={invSearch} onChange={e=>setInvSearch(e.target.value)} style={{marginBottom:8}}/>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
            {cats.map(c=>(
              <button key={c} onClick={()=>setInvCat(c)} style={{padding:"3px 10px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",border:"none",background:invCat===c?"#38bdf8":"#0f172a",color:invCat===c?"#0f172a":"#64748b"}}>{c}</button>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:220,overflow:"auto"}}>
            {filteredInv.map(i=>{
              const inCart=items.find(x=>x.inv_id===i.id);
              return (
                <button key={i.id} onClick={()=>addItem(i)} style={{
                  background:inCart?"#064e3b":"#0f172a",
                  border:inCart?"1px solid #10b981":"1px solid #334155",
                  borderRadius:7,padding:"7px 12px",cursor:"pointer",textAlign:"left",
                  display:"flex",justifyContent:"space-between",alignItems:"center",
                }}>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:inCart?"#6ee7b7":"#e2e8f0"}}>{i.name}</div>
                    <div style={{fontSize:10,color:"#64748b"}}>{i.category} · {i.quantity} бр.</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#10b981"}}>{fmtM(i.price)}</div>
                    {inCart&&<div style={{fontSize:10,color:"#6ee7b7"}}>+{inCart.qty} добавено</div>}
                  </div>
                </button>
              );
            })}
            {filteredInv.length===0&&<p style={{color:"#475569",fontSize:12,padding:"8px 0"}}>Няма намерени артикули</p>}
          </div>

          )}
          </>)}
          {/* Cart */}
          {!manualMode && items.length>0&&(
            <div style={{marginTop:12,background:"#0f172a",borderRadius:10,padding:10}}>
              <div style={{fontSize:11,color:"#64748b",fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>Избрани части</div>
              {/* Header */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 36px 52px 52px 52px 56px 18px",gap:4,marginBottom:4}}>
                {["Артикул","Бр.","Дост.","Надц.%","Цена €","Общо €",""].map(h=><div key={h} style={{fontSize:9,color:"#475569",fontWeight:700,textTransform:"uppercase",textAlign:"center"}}>{h}</div>)}
              </div>
              {items.map(i=>(
                <div key={i.inv_id} style={{display:"grid",gridTemplateColumns:"1fr 36px 52px 52px 52px 56px 18px",gap:4,padding:"5px 0",borderBottom:"1px solid #1e293b",alignItems:"center"}}>
                  <div style={{fontSize:11,color:"#e2e8f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={i.name}>{i.name}</div>
                  {/* Qty */}
                  <input type="number" min="1" value={i.qty} onChange={e=>updateQty(i.inv_id,e.target.value)}
                    style={{padding:"3px 4px",fontSize:11,textAlign:"center"}}/>
                  {/* Cost - readonly */}
                  <div style={{fontSize:11,color:"#f59e0b",textAlign:"center",padding:"3px 0"}}>{Number(i.cost).toFixed(2)}</div>
                  {/* Markup % */}
                  <div style={{position:"relative"}}>
                    <input type="number" min="0" step="1" value={i.markup||0} onChange={e=>updateMarkup(i.inv_id,e.target.value)}
                      style={{padding:"3px 4px",fontSize:11,textAlign:"center",paddingRight:14}}/>
                    <span style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",fontSize:9,color:"#64748b",pointerEvents:"none"}}>%</span>
                  </div>
                  {/* Sale price */}
                  <input type="number" min="0" step="0.01" value={i.price} onChange={e=>updatePrice(i.inv_id,e.target.value)}
                    style={{padding:"3px 4px",fontSize:11,textAlign:"right",color:"#10b981",fontWeight:700}}/>
                  {/* Total */}
                  <div style={{fontSize:11,color:"#10b981",fontWeight:800,textAlign:"right"}}>{(i.price*i.qty).toFixed(2)}</div>
                  <button onClick={()=>removeItem(i.inv_id)} style={{background:"#7f1d1d",color:"#fca5a5",border:"none",borderRadius:4,width:18,height:18,cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",marginTop:8,paddingTop:6,borderTop:"1px solid #334155",flexWrap:"wrap",gap:8}}>
                <span style={{fontSize:11,color:"#64748b"}}>Себестойност: <b style={{color:"#f59e0b"}}>{fmtM(totalCost)}</b></span>
                <span style={{fontSize:11,color:"#64748b"}}>Печалба: <b style={{color:"#8b5cf6"}}>{fmtM(totalSale-totalCost)}</b></span>
                <span style={{fontSize:14,fontWeight:800,color:"#10b981"}}>ОБЩО: {fmtM(totalSale)}</span>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: order details */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.4}}>Детайли на продажбата</div>
          <MField label="Дата"><input type="date" value={f.date} onChange={e=>sv("date",e.target.value)}/></MField>
          <MField label="Плащане"><select value={f.payment_method} onChange={e=>sv("payment_method",e.target.value)}>{PAYMENT_METHODS.map(p=><option key={p}>{p}</option>)}</select></MField>
          <MField label="Статус плащане"><select value={f.payment_status} onChange={e=>sv("payment_status",e.target.value)}><option>Платена</option><option>Не е платена</option></select></MField>
          <MField label="Доставка"><select value={f.delivery_method} onChange={e=>sv("delivery_method",e.target.value)}>{DELIVERY_METHODS.map(d=><option key={d}>{d}</option>)}</select></MField>
          {f.delivery_method!=="На място"&&<MField label="Вид доставка"><select value={f.delivery_type||""} onChange={e=>sv("delivery_type",e.target.value)}><option value="">— Избери —</option><option>До офис на куриер</option><option>До личен адрес</option></select></MField>}
          <MField label="Купувач"><input value={f.buyer_name||""} onChange={e=>sv("buyer_name",e.target.value)} placeholder="Иван Иванов"/></MField>
          <MField label="Телефон"><input value={f.buyer_phone||""} onChange={e=>sv("buyer_phone",e.target.value)} placeholder="0888 123 456"/></MField>
          {f.delivery_method!=="На място"&&<>
            <MField label="Град / Село"><input value={f.buyer_city||""} onChange={e=>sv("buyer_city",e.target.value)} placeholder="София..."/></MField>
            <MField label="Адрес"><input value={f.buyer_address||""} onChange={e=>sv("buyer_address",e.target.value)} placeholder="ул. ..."/></MField>
            <MField label="Товарителница"><input value={f.tracking_number||""} onChange={e=>sv("tracking_number",e.target.value)} placeholder="1234567890"/></MField>
          </>}
          {items.length===0&&<>
            <MField label="Наименование (ръчно)"><input value={f.part_name} onChange={e=>sv("part_name",e.target.value)} placeholder="Артикул..."/></MField>
            <MField label="Бройки"><input type="number" min="1" value={f.quantity} onChange={e=>sv("quantity",Number(e.target.value))}/></MField>
            <MField label="Доставна (€)"><input type="number" min="0" step="0.01" value={f.cost_price||""} onChange={e=>sv("cost_price",e.target.value)} placeholder="0.00"/></MField>
            <MField label="Продажна (€)"><input type="number" min="0" step="0.01" value={f.sale_price||""} onChange={e=>sv("sale_price",e.target.value)} placeholder="0.00"/></MField>
          </>}
          {items.length>0&&(
            <div style={{background:"#064e3b",borderRadius:8,padding:12,marginTop:"auto"}}>
              <div style={{fontSize:12,color:"#6ee7b7",marginBottom:4}}>📊 Обобщение</div>
              <div style={{fontSize:11,color:"#6ee7b7"}}>Артикули: {items.length} вида, {items.reduce((s,i)=>s+i.qty,0)} бр.</div>
              <div style={{fontSize:11,color:"#6ee7b7",margin:"2px 0"}}>Себестойност: {fmtM(totalCost)}</div>
              <div style={{fontSize:16,fontWeight:800,color:"#10b981",marginTop:4}}>Общо: {fmtM(totalSale)}</div>
            </div>
          )}
        </div>
      </div>
    </MModal>
  );
}

// ══ PHONE SALES ════════════════════════════════════════════════════════════════
export function PhoneSalesTab({sales,onSave,onDelete,onWarranty}) {
  const [modal,setModal]=useState(null);
  const [search,setSearch]=useState("");
  const [date,setDate]=useState("");
  const filtered=sales.filter(s=>{const q=search.toLowerCase();return(!q||[s.brand,s.model,s.imei,s.buyer_name].some(f=>(f||"").toLowerCase().includes(q)))&&(!date||(s.date||"").slice(0,10)===date);});
  const totalRev=filtered.reduce((s,r)=>s+Number(r.sale_price||0),0);
  const totalCost=filtered.reduce((s,r)=>s+Number(r.cost_price||0),0);
  const exportAll=()=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(filtered.map(r=>({Дата:r.date,Марка:r.brand,Модел:r.model,Цвят:r.color||"",IMEI:r.imei||"","Сериен №":r.serial_number||"",Купувач:r.buyer_name||"","Доставна €":r.cost_price,"Продажна €":r.sale_price,"Печалба €":Number(r.sale_price||0)-Number(r.cost_price||0),Плащане:r.payment_method}))), "Продажби телефони");XLSX.writeFile(wb,`Продажби_телефони_${today()}.xlsx`);};
  return (
    <div className="animate-fade">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h1 style={{margin:0,fontSize:22,fontWeight:800}}>📲 Продажба на телефони</h1>
        <div style={{display:"flex",gap:8}}><MBtn color="#10b981" bg="#064e3b" onClick={exportAll}>📊 Excel</MBtn><MPrimaryBtn onClick={()=>setModal({})}>+ Нова продажба</MPrimaryBtn></div>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"flex-end"}}>
        <MField label="Дата"><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:170}}/></MField>
        <button onClick={()=>setDate("")} style={{background:"#334155",color:"#94a3b8",border:"none",borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:12,marginBottom:1}}>Всички</button>
        <input placeholder="🔍  Търси..." value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1}}/>
        <MCard style={{padding:"10px 14px",borderLeft:"4px solid #10b981"}}><div style={{fontSize:11,color:"#64748b"}}>Приход</div><div style={{fontSize:16,fontWeight:800,color:"#10b981"}}>{fmtM(totalRev)}</div></MCard>
        <MCard style={{padding:"10px 14px",borderLeft:"4px solid #8b5cf6"}}><div style={{fontSize:11,color:"#64748b"}}>Печалба</div><div style={{fontSize:16,fontWeight:800,color:"#8b5cf6"}}>{fmtM(totalRev-totalCost)}</div></MCard>
      </div>
      <MCard className="scroll-x" style={{padding:0}}>
        <table>
          <thead style={{background:"#0a1628"}}><tr>{["Дата","Устройство","IMEI","Купувач","Доставна","Продажна","Плащане",""].map(h=><th key={h} style={{padding:"11px 14px",textAlign:"left",fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.length===0&&<tr><td colSpan={8} style={{textAlign:"center",padding:32,color:"#475569"}}>Няма продажби</td></tr>}
            {filtered.map(r=>(
              <tr key={r.id} style={{borderTop:"1px solid #0f172a"}} onMouseEnter={e=>e.currentTarget.style.background="#243044"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <td style={{padding:"9px 14px",fontSize:11,color:"#64748b"}}>{fmtDate(r.date)}</td>
                <td style={{padding:"9px 14px",fontSize:13,fontWeight:600}}>{r.brand} {r.model} {r.color?`(${r.color})`:""}</td>
                <td style={{padding:"9px 14px",fontSize:11,fontFamily:"monospace",color:"#94a3b8"}}>{r.imei||"—"}</td>
                <td style={{padding:"9px 14px",fontSize:12}}>{r.buyer_name||"—"}</td>
                <td style={{padding:"9px 14px",fontSize:12,color:"#64748b"}}>{fmtM(r.cost_price)}</td>
                <td style={{padding:"9px 14px",fontWeight:700,color:"#10b981"}}>{fmtM(r.sale_price)}</td>
                <td style={{padding:"9px 14px"}}><SBadge text={r.payment_method}/></td>
                <td style={{padding:"9px 14px"}}><div style={{display:"flex",gap:4}}><MBtn color="#3b82f6" onClick={()=>setModal(r)}>✏️</MBtn>
                  <MBtn color="#fbbf24" title="Гаранционна карта" onClick={()=>onWarranty&&onWarranty({id:r.id,client_name:r.buyer_name,phone:r.buyer_phone,device_type:r.brand,brand:r.brand,model:r.model,serial_number:r.serial_number||r.imei,problem:"Продажба на телефон",technician:"",warranty_days:r.warranty_days||30,warranty_amount:r.warranty_amount||1,warranty_unit:r.warranty_unit||"месеца",date_out:r.date})}>🛡️</MBtn>
                  <MBtn color="#ef4444" onClick={()=>{if(confirm("Изтрий?"))onDelete(r.id);}}>🗑️</MBtn></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </MCard>
      {modal!==null&&<PhoneSaleModal sale={modal} onSave={r=>{onSave(r);setModal(null);}} onClose={()=>setModal(null)}/>}
    </div>
  );
}

function PhoneSaleModal({sale,onSave,onClose}) {
  const [f,sf]=useState({date:today(),brand:"",model:"",color:"",imei:"",serial_number:"",storage:"",warranty_days:30,warranty_amount:1,warranty_unit:"месеца",cost_price:"",sale_price:"",payment_method:"В брой",buyer_name:"",buyer_phone:"",notes:"",...sale});
  const s=(k,v)=>sf(x=>({...x,[k]:v}));
  return (
    <MModal title={sale?.id?"Редактирай":"Нова продажба телефон"} onClose={onClose} maxWidth={700} footer={<><CancelBtn onClick={onClose}/><MPrimaryBtn onClick={()=>{if(!f.brand||!f.model){alert("Въведи марка и модел!");return;}onSave(f);}}>💾 Запази</MPrimaryBtn></>}>
      <div className="m-modal-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <MField label="Дата"><input type="date" value={f.date} onChange={e=>s("date",e.target.value)}/></MField>
        <MField label="Плащане"><select value={f.payment_method} onChange={e=>s("payment_method",e.target.value)}>{PAYMENT_METHODS.map(p=><option key={p}>{p}</option>)}</select></MField>
        <MField label="Марка *"><input value={f.brand||""} onChange={e=>s("brand",e.target.value)} placeholder="Apple / Samsung..."/></MField>
        <MField label="Модел *"><input value={f.model||""} onChange={e=>s("model",e.target.value)} placeholder="iPhone 14..."/></MField>
        <MField label="Цвят"><input value={f.color||""} onChange={e=>s("color",e.target.value)} placeholder="Черен..."/></MField>
        <MField label="Памет"><input value={f.storage||""} onChange={e=>s("storage",e.target.value)} placeholder="128GB..."/></MField>
        <MField label="IMEI"><input value={f.imei||""} onChange={e=>s("imei",e.target.value)} placeholder="358XXXXXXXXXXXX"/></MField>
        <MField label="Сериен №"><input value={f.serial_number||""} onChange={e=>s("serial_number",e.target.value)} placeholder="C02XXXXXXX"/></MField>
        <MField label="Гаранция">
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <input type="number" min="0" value={f.warranty_amount||1}
              onChange={e=>{
                const amt=Number(e.target.value)||1;
                s("warranty_amount",amt);
                const unit=f.warranty_unit||"месеца";
                s("warranty_days",unit==="дни"?amt:unit==="месеца"?amt*30:amt*365);
              }} style={{width:80}}/>
            <select value={f.warranty_unit||"месеца"} onChange={e=>{
              s("warranty_unit",e.target.value);
              const amt=Number(f.warranty_amount||1);
              const unit=e.target.value;
              s("warranty_days",unit==="дни"?amt:unit==="месеца"?amt*30:amt*365);
            }}>
              <option value="дни">Дни</option>
              <option value="месеца">Месеца</option>
              <option value="години">Години</option>
            </select>
            <span style={{fontSize:11,color:"#64748b"}}>{`= ${(f.warranty_unit||"месеца")==="дни"?(f.warranty_amount||1):(f.warranty_unit)==="месеца"?(f.warranty_amount||1)*30:(f.warranty_amount||1)*365} дни`}</span>
          </div>
        </MField>
        <MField label=""></MField>
        <MField label="Доставна (€)"><input type="number" min="0" step="0.01" value={f.cost_price||""} onChange={e=>s("cost_price",e.target.value)} placeholder="0.00"/></MField>
        <MField label="Продажна (€)"><input type="number" min="0" step="0.01" value={f.sale_price||""} onChange={e=>s("sale_price",e.target.value)} placeholder="0.00"/></MField>
        <MField label="Купувач"><input value={f.buyer_name||""} onChange={e=>s("buyer_name",e.target.value)} placeholder="Иван Иванов"/></MField>
        <MField label="Телефон"><input value={f.buyer_phone||""} onChange={e=>s("buyer_phone",e.target.value)} placeholder="0888 123 456"/></MField>
        <MField label="Бележки" style={{gridColumn:"1/-1"}}><textarea value={f.notes||""} onChange={e=>s("notes",e.target.value)} rows={2} style={{resize:"vertical"}}/></MField>
      </div>
    </MModal>
  );
}

// ══ STOCK ORDERS ════════════════════════════════════════════════════════════════
export function StockOrdersTab({orders,onSave,onDelete,notify}) {
  const [modal,setModal]=useState(null);
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("Всички");
  const filtered=orders.filter(o=>{const q=search.toLowerCase();return(!q||[o.part_name,o.client_name,o.client_phone,o.supplier,o.category].some(f=>(f||"").toLowerCase().includes(q)))&&(filter==="Всички"||o.status===filter);});
  const exportAll=()=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(filtered.map(o=>({Дата:o.date,Артикул:o.part_name,Категория:o.category||"","Бр.":o.quantity,Клиент:o.client_name||"",Телефон:o.client_phone||"","Цена клиент €":Number(o.client_price||0),Доставчик:o.supplier||"",Статус:o.status,Бележки:o.notes||""}))), "Поръчки");XLSX.writeFile(wb,`Поръчки_${today()}.xlsx`);};
  return (
    <div className="animate-fade">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h1 style={{margin:0,fontSize:22,fontWeight:800}}>📋 Поръчки към доставчици</h1>
        <div style={{display:"flex",gap:8}}><MBtn color="#10b981" bg="#064e3b" onClick={exportAll}>📊 Excel</MBtn><MPrimaryBtn onClick={()=>setModal({})}>+ Нова поръчка</MPrimaryBtn></div>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <input placeholder="🔍  Търси по артикул, клиент, доставчик..." value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1}}/>
        <div style={{display:"flex",gap:5}}>{["Всички",...SO_STATUSES].map(s=>(
          <button key={s} onClick={()=>setFilter(s)} style={{padding:"5px 11px",borderRadius:7,fontSize:11,fontWeight:600,cursor:"pointer",border:"none",background:filter===s?(SO_COLORS[s]||"#38bdf8"):"#1e293b",color:filter===s?"#fff":"#64748b"}}>{s}</button>
        ))}</div>
      </div>
      <MCard className="scroll-x" style={{padding:0}}>
        <table>
          <thead style={{background:"#0a1628"}}><tr>{["Дата","Артикул","Кат.","Бр.","Клиент","Телефон","Цена клиент","Доставчик","Статус","Бележки",""].map(h=><th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.length===0&&<tr><td colSpan={11} style={{textAlign:"center",padding:32,color:"#475569"}}>Няма поръчки</td></tr>}
            {filtered.map(o=>(
              <tr key={o.id} style={{borderTop:"1px solid #0f172a"}} onMouseEnter={e=>e.currentTarget.style.background="#243044"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <td style={{padding:"8px 12px",fontSize:11,color:"#64748b"}}>{fmtDate(o.date)}</td>
                <td style={{padding:"8px 12px",fontSize:13,fontWeight:600}}>{o.part_name}</td>
                <td style={{padding:"8px 12px",fontSize:11,color:"#94a3b8"}}>{o.category||"—"}</td>
                <td style={{padding:"8px 12px"}}>{o.quantity}</td>
                <td style={{padding:"8px 12px",fontSize:12}}>{o.client_name||"—"}</td>
                <td style={{padding:"8px 12px",fontSize:12,color:"#94a3b8"}}>{o.client_phone||"—"}</td>
                <td style={{padding:"8px 12px",fontWeight:700,color:"#10b981"}}>{o.client_price>0?fmtM(o.client_price):"—"}</td>
                <td style={{padding:"8px 12px",fontSize:12,color:"#38bdf8"}}>{o.supplier||"—"}</td>
                <td style={{padding:"8px 12px"}}><SBadge text={o.status}/></td>
                <td style={{padding:"8px 12px",fontSize:11,color:"#64748b",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.notes||"—"}</td>
                <td style={{padding:"8px 12px"}}><div style={{display:"flex",gap:3}}><MBtn color="#3b82f6" onClick={()=>setModal(o)}>✏️</MBtn><MBtn color="#ef4444" onClick={()=>{if(confirm("Изтрий?"))onDelete(o.id);}}>🗑️</MBtn></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </MCard>
      {modal!==null&&<StockOrderModal order={modal} onSave={r=>{onSave(r);setModal(null);}} onClose={()=>setModal(null)}/>}
    </div>
  );
}

function StockOrderModal({order,onSave,onClose}) {
  const [f,sf]=useState({date:today(),part_name:"",category:"",quantity:1,client_name:"",client_phone:"",client_price:"",supplier:"",status:"Чака",notes:"",...order});
  const s=(k,v)=>sf(x=>({...x,[k]:v}));
  return (
    <MModal title={order?.id?"Редактирай поръчка":"Нова поръчка към доставчик"} onClose={onClose} maxWidth={700} footer={<><CancelBtn onClick={onClose}/><MPrimaryBtn onClick={()=>{if(!f.part_name){alert("Въведи артикул!");return;}onSave(f);}}>💾 Запази</MPrimaryBtn></>}>
      <div className="m-modal-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <MField label="Дата"><input type="date" value={f.date} onChange={e=>s("date",e.target.value)}/></MField>
        <MField label="Статус"><select value={f.status} onChange={e=>s("status",e.target.value)}>{SO_STATUSES.map(x=><option key={x}>{x}</option>)}</select></MField>
        <MField label="Артикул *" style={{gridColumn:"1/-1"}}><input value={f.part_name} onChange={e=>s("part_name",e.target.value)} placeholder="Дисплей iPhone 14, Батерия Samsung S22..."/></MField>
        <MField label="Категория"><select value={f.category||""} onChange={e=>s("category",e.target.value)}><option value="">— Избери —</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></MField>
        <MField label="Бройки"><input type="number" min="1" value={f.quantity} onChange={e=>s("quantity",Number(e.target.value))}/></MField>
        <MField label="От кой доставчик"><input value={f.supplier||""} onChange={e=>s("supplier",e.target.value)} placeholder="TechParts, iRepair..."/></MField>
        <MField label="Цена към клиент (€)"><input type="number" min="0" step="0.01" value={f.client_price||""} onChange={e=>s("client_price",e.target.value)} placeholder="0.00"/></MField>
        <MField label="Имена на клиент"><input value={f.client_name||""} onChange={e=>s("client_name",e.target.value)} placeholder="Иван Иванов (ако е за клиент)"/></MField>
        <MField label="Телефон на клиент"><input value={f.client_phone||""} onChange={e=>s("client_phone",e.target.value)} placeholder="0888 123 456"/></MField>
        <MField label="Бележки" style={{gridColumn:"1/-1"}}><textarea value={f.notes||""} onChange={e=>s("notes",e.target.value)} rows={2} style={{resize:"vertical"}} placeholder="Цвят, версия, допълнителна информация..."/></MField>
      </div>
    </MModal>
  );
}

// ══ SUPPLIER DEBTS ════════════════════════════════════════════════════════════
export function SupplierDebtsTab({debts,onSave,onDelete,notify}) {
  const [modal,   setModal]   = useState(null);
  const [selected,setSelected]= useState(new Set());
  const [search,  setSearch]  = useState("");
  const [showPaid,setShowPaid]= useState(false);
  const [payModal,setPayModal]= useState(false);

  const filtered=debts.filter(d=>{
    const q=search.toLowerCase();
    return(!q||[d.supplier,d.part_name,d.model,d.category].some(f=>(f||"").toLowerCase().includes(q)))&&(showPaid?true:!d.is_paid);
  });

  const toggleSel=(id)=>setSelected(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAll=()=>selected.size===filtered.filter(d=>!d.is_paid).length?setSelected(new Set()):setSelected(new Set(filtered.filter(d=>!d.is_paid).map(d=>d.id)));

  const markPaid=async(method)=>{
    for(const id of selected){const d=debts.find(x=>x.id===id);if(d&&!d.is_paid)await onSave({...d,is_paid:true,paid_date:today(),payment_method:method});}
    const cnt=selected.size;setSelected(new Set());notify(`✅ ${cnt} задължения отбелязани като платени`);
  };

  const totalUnpaid=debts.filter(d=>!d.is_paid).reduce((s,d)=>s+Number(d.total_amount||d.cost_price||0),0);
  const totalPaid=debts.filter(d=>d.is_paid).reduce((s,d)=>s+Number(d.total_amount||d.cost_price||0),0);

  const exportAll=()=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(filtered.map(d=>({
    "Дата поръчка":d.date_ordered,"Дата пристигане":d.date_arrived||"",Доставчик:d.supplier,
    Артикул:d.part_name,Модел:d.model||"",Категория:d.category||"","Бр.":d.quantity,
    "Доставна €":d.cost_price,"Общо €":d.total_amount||d.cost_price,
    Платено:d.is_paid?"Да":"Не","Дата плащане":d.paid_date||"","Начин плащане":d.payment_method||"",
  }))), "Задължения");XLSX.writeFile(wb,`Задължения_${today()}.xlsx`);};

  return (
    <div className="animate-fade">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:800}}>💳 Задължения към доставчици</h1>
          <p style={{margin:"3px 0 0",fontSize:12,color:"#64748b"}}>Неплатено: <b style={{color:"#ef4444"}}>{fmtM(totalUnpaid)}</b> &nbsp;|&nbsp; Платено общо: <b style={{color:"#10b981"}}>{fmtM(totalPaid)}</b></p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <MBtn color="#10b981" bg="#064e3b" onClick={exportAll}>📊 Excel</MBtn>
          {selected.size>0&&<MBtn color="#10b981" bg="#064e3b" onClick={()=>setPayModal(true)}>✅ Плати ({selected.size})</MBtn>}
          <MPrimaryBtn onClick={()=>setModal({})}>+ Нов запис</MPrimaryBtn>
        </div>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center"}}>
        <input placeholder="🔍  Търси по доставчик, артикул, модел..." value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1}}/>
        <button onClick={()=>setShowPaid(p=>!p)} style={{background:showPaid?"#334155":"#1e293b",color:showPaid?"#94a3b8":"#64748b",border:"1px solid #334155",borderRadius:7,padding:"7px 14px",cursor:"pointer",fontSize:12,whiteSpace:"nowrap"}}>{showPaid?"Скрий платените":"Покажи всички"}</button>
      </div>
      <MCard className="scroll-x" style={{padding:0}}>
        <table>
          <thead style={{background:"#0a1628"}}>
            <tr>
              <th style={{padding:"11px 14px",width:36}}><input type="checkbox" onChange={toggleAll} checked={selected.size>0&&selected.size===filtered.filter(d=>!d.is_paid).length} style={{width:14,height:14}}/></th>
              {["Поръчано","Пристигнало","Доставчик","Артикул","Модел","Бр.","Доставна","Общо","Статус","Платено на","Начин",""].map(h=><th key={h} style={{padding:"11px 12px",textAlign:"left",fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0&&<tr><td colSpan={13} style={{textAlign:"center",padding:32,color:"#475569"}}>Няма задължения</td></tr>}
            {filtered.map(d=>(
              <tr key={d.id} style={{borderTop:"1px solid #0f172a",background:d.is_paid?"rgba(16,185,129,.04)":"rgba(239,68,68,.03)"}}
                onMouseEnter={e=>e.currentTarget.style.background=d.is_paid?"rgba(16,185,129,.08)":"rgba(239,68,68,.08)"}
                onMouseLeave={e=>e.currentTarget.style.background=d.is_paid?"rgba(16,185,129,.04)":"rgba(239,68,68,.03)"}>
                <td style={{padding:"9px 14px"}}>{!d.is_paid&&<input type="checkbox" checked={selected.has(d.id)} onChange={()=>toggleSel(d.id)} style={{width:14,height:14}}/>}</td>
                <td style={{padding:"9px 12px",fontSize:11,color:"#64748b"}}>{fmtDate(d.date_ordered)}</td>
                <td style={{padding:"9px 12px",fontSize:11,color:"#64748b"}}>{d.date_arrived?fmtDate(d.date_arrived):"—"}</td>
                <td style={{padding:"9px 12px",fontSize:13,fontWeight:600,color:"#38bdf8"}}>{d.supplier}</td>
                <td style={{padding:"9px 12px",fontSize:12,fontWeight:600}}>{d.part_name}</td>
                <td style={{padding:"9px 12px",fontSize:12,color:"#94a3b8"}}>{d.model||"—"}</td>
                <td style={{padding:"9px 12px"}}>{d.quantity}</td>
                <td style={{padding:"9px 12px",color:"#f59e0b"}}>{fmtM(d.cost_price)}</td>
                <td style={{padding:"9px 12px",fontWeight:800,color:d.is_paid?"#10b981":"#ef4444"}}>{fmtM(d.total_amount||d.cost_price)}</td>
                <td style={{padding:"9px 12px"}}><SBadge text={d.is_paid?"Платено":"Неплатено"}/></td>
                <td style={{padding:"9px 12px",fontSize:11,color:"#64748b"}}>{d.paid_date?fmtDate(d.paid_date):"—"}</td>
                <td style={{padding:"9px 12px"}}>{d.payment_method?<SBadge text={d.payment_method}/>:<span style={{color:"#475569",fontSize:11}}>—</span>}</td>
                <td style={{padding:"9px 12px"}}><div style={{display:"flex",gap:3}}>
                  <MBtn color="#3b82f6" onClick={()=>setModal(d)}>✏️</MBtn>
                  {!d.is_paid&&<MBtn color="#10b981" onClick={()=>onSave({...d,is_paid:true,paid_date:today(),payment_method:"В брой"})} title="Плати (В брой)">✅</MBtn>}
                  <MBtn color="#ef4444" onClick={()=>{if(confirm("Изтрий?"))onDelete(d.id);}}>🗑️</MBtn>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </MCard>

      {modal!==null&&<DebtModal debt={modal} onSave={r=>{onSave(r);setModal(null);}} onClose={()=>setModal(null)}/>}

      {payModal&&<MModal title={`✅ Плати ${selected.size} задължения`} onClose={()=>setPayModal(false)} maxWidth={380}
        footer={<CancelBtn onClick={()=>setPayModal(false)}/>}>
        <p style={{color:"#94a3b8",fontSize:13,marginBottom:16}}>Избери начин на плащане:</p>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {["В брой","С карта","Банка","Еконт","Спиди"].map(m=>(
            <button key={m} onClick={()=>{markPaid(m);setPayModal(false);}} style={{background:"#0f172a",color:"#e2e8f0",border:"1px solid #334155",borderRadius:8,padding:"12px 16px",cursor:"pointer",fontSize:14,fontWeight:600,textAlign:"left"}}>💳 {m}</button>
          ))}
        </div>
      </MModal>}
    </div>
  );
}

function DebtModal({debt,onSave,onClose}) {
  const [f,sf]=useState({date_ordered:today(),date_arrived:"",supplier:"",part_name:"",model:"",category:"",quantity:1,cost_price:"",total_amount:"",is_paid:false,paid_date:"",payment_method:"",notes:"",...debt,is_paid:debt?.is_paid||false});
  const s=(k,v)=>sf(x=>({...x,[k]:v}));
  const handleCost=(val)=>{s("cost_price",val);if(!f.total_amount||f.total_amount===String(Number(f.cost_price)*Number(f.quantity)))s("total_amount",(Number(val)*Number(f.quantity)).toFixed(2));};
  const handleQty=(val)=>{s("quantity",Number(val));s("total_amount",(Number(f.cost_price||0)*Number(val)).toFixed(2));};
  const handleSave = () => {
    if(!f.supplier||!f.part_name){alert("Въведи доставчик и артикул!");return;}
    const clean = {
      ...f,
      date_arrived:   f.date_arrived   || null,
      paid_date:      f.paid_date      || null,
      payment_method: f.payment_method || null,
      model:          f.model          || null,
      category:       f.category       || null,
      notes:          f.notes          || null,
      cost_price:     Number(f.cost_price  || 0),
      total_amount:   Number(f.total_amount|| 0),
      quantity:       Number(f.quantity    || 1),
    };
    onSave(clean);
  };
  return (
    <MModal title={debt?.id?"Редактирай задължение":"Ново задължение"} onClose={onClose} maxWidth={700} footer={<><CancelBtn onClick={onClose}/><MPrimaryBtn onClick={handleSave}>💾 Запази</MPrimaryBtn></>}>
      <div className="m-modal-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <MField label="Дата на поръчката"><input type="date" value={f.date_ordered} onChange={e=>s("date_ordered",e.target.value)}/></MField>
        <MField label="Дата на пристигане"><input type="date" value={f.date_arrived||""} onChange={e=>s("date_arrived",e.target.value||null)}/></MField>
        <MField label="Доставчик *"><input value={f.supplier} onChange={e=>s("supplier",e.target.value)} placeholder="TechParts, iRepair..."/></MField>
        <MField label="Категория"><select value={f.category||""} onChange={e=>s("category",e.target.value)}><option value="">— Избери —</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></MField>
        <MField label="Артикул *" style={{gridColumn:"1/-1"}}><input value={f.part_name} onChange={e=>s("part_name",e.target.value)} placeholder="Дисплей iPhone 14 Pro Max OLED..."/></MField>
        <MField label="Модел на устройството"><input value={f.model||""} onChange={e=>s("model",e.target.value)} placeholder="iPhone 14 Pro..."/></MField>
        <MField label="Бройки"><input type="number" min="1" value={f.quantity} onChange={e=>handleQty(e.target.value)}/></MField>
        <MField label="Доставна цена (€)"><input type="number" min="0" step="0.01" value={f.cost_price||""} onChange={e=>handleCost(e.target.value)} placeholder="0.00"/></MField>
        <MField label="Обща сума за плащане (€)"><input type="number" min="0" step="0.01" value={f.total_amount||""} onChange={e=>s("total_amount",e.target.value)} placeholder="0.00"/></MField>
        <div style={{gridColumn:"1/-1",borderTop:"1px solid #334155",paddingTop:12}}>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
            <input type="checkbox" checked={f.is_paid} onChange={e=>s("is_paid",e.target.checked)} style={{width:16,height:16}}/>
            <span style={{fontSize:13,fontWeight:600,color:f.is_paid?"#10b981":"#94a3b8"}}>✅ Платено</span>
          </label>
        </div>
        {f.is_paid&&<>
          <MField label="Дата на плащане"><input type="date" value={f.paid_date||today()} onChange={e=>s("paid_date",e.target.value)}/></MField>
          <MField label="Начин на плащане"><select value={f.payment_method||""} onChange={e=>s("payment_method",e.target.value)}><option value="">— Избери —</option>{["В брой","С карта","Банка","Еконт","Спиди"].map(p=><option key={p}>{p}</option>)}</select></MField>
        </>}
        <MField label="Бележки" style={{gridColumn:"1/-1"}}><textarea value={f.notes||""} onChange={e=>s("notes",e.target.value)} rows={2} style={{resize:"vertical"}}/></MField>
      </div>
    </MModal>
  );
}
