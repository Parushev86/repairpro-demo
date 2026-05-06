import QRCode from "qrcode";
import { fmtDate, fmtMoney } from "./constants.js";

export async function generateQR(text) {
  return QRCode.toDataURL(text, { width: 120, margin: 1, color: { dark: "#000", light: "#fff" } });
}

export function downloadProtocolTXT(order) {
  const parts = (order.parts||[]).map(p=>p.name+'('+p.price+' €)').join(', ') || '—';
  const lines = [
    'ПРИЕМНО-ПРЕДАВАТЕЛЕН ПРОТОКОЛ',
    '='.repeat(44),
    '',
    'Номер: ' + order.id,
    'Дата приемане: ' + (order.date_in||'—'),
    'Дата издаване: ' + (order.date_out||'—'),
    'Клиент: ' + (order.client_name||'—'),
    'Телефон: ' + (order.phone||'—'),
    'Имейл: ' + (order.email||'—'),
    'Техник: ' + (order.technician||'—'),
    'Устройство: ' + [order.device_type,order.brand,order.model].filter(Boolean).join(' '),
    'Сериен №: ' + (order.serial_number||'—'),
    'Парола/PIN: ' + (order.device_password||'—'),
    'Проблем: ' + (order.problem||'—'),
    'Статус: ' + (order.status||'—'),
    'Вложени части: ' + parts,
    'Цена труд: € ' + (order.labor_price||'0.00'),
    'Крайна цена: € ' + (order.total_price||order.price||'0.00'),
    'Аванс: € ' + (order.deposit||'0.00'),
    'Плащане: ' + (order.payment_method||'—'),
    '',
    '='.repeat(44),
    'Генериран: ' + new Date().toLocaleString('bg-BG'),
  ];
  const text = lines.join('\n');
  const blob = new Blob([text], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'protokol_' + order.id + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

export async function printProtocol(order) {
  const qr = await generateQR(order.id);
  const partsHtml = (order.parts || []).length
    ? `<tr><th>Вложени части</th><td colspan="3">${order.parts.map(p => `${p.name} — ${fmtMoney(p.price)}`).join(", ")}</td></tr>`
    : "";

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Протокол ${order.id}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; padding: 32px; color: #111; max-width: 740px; margin: auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a56db; padding-bottom: 12px; margin-bottom: 20px; }
  .header h1 { font-size: 20px; margin: 0 0 4px; color: #1a56db; }
  .header p  { font-size: 12px; color: #555; margin: 2px 0; }
  .order-id  { font-size: 28px; font-weight: 900; font-family: monospace; color: #1a56db; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  td, th { border: 1px solid #ddd; padding: 8px 12px; font-size: 13px; vertical-align: top; }
  th { background: #f3f4f6; text-align: left; font-weight: 600; width: 160px; }
  .status { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; background: #d1fae5; color: #065f46; }
  .sig-row { display: flex; justify-content: space-between; margin-top: 50px; gap: 40px; }
  .sig-box { flex: 1; text-align: center; }
  .sig-box hr { border: 1px solid #999; margin-bottom: 6px; }
  .sig-box p { font-size: 12px; color: #555; margin: 0; }
  .warranty { margin-top: 16px; padding: 10px 14px; background: #fefce8; border: 1px solid #fde047; border-radius: 6px; font-size: 12px; color: #713f12; }
  .footer { margin-top: 20px; font-size: 11px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }
  @media print { body { padding: 16px; } .no-print { display: none !important; } }
</style></head><body>
<div class="header">
  <div>
    <h1>🔧 ПРИЕМНО-ПРЕДАВАТЕЛЕН ПРОТОКОЛ</h1>
    <p>Документ за приемане на устройство за ремонт</p>
    <div class="order-id">${order.id}</div>
  </div>
  <div style="text-align:right">
    <img src="${qr}" width="110" height="110" alt="QR" style="border:1px solid #ddd;padding:4px;border-radius:4px"/>
    <p style="font-size:10px;color:#999;margin:4px 0 0">Сканирай за бърз достъп</p>
  </div>
</div>
<table>
  <tr><th>Дата приемане</th><td>${fmtDate(order.date_in)}</td><th>Дата издаване</th><td>${order.date_out ? fmtDate(order.date_out) : "—"}</td></tr>
  <tr><th>Клиент</th><td>${order.client_name}</td><th>Телефон</th><td>${order.phone}</td></tr>
  <tr><th>Имейл</th><td>${order.email || "—"}</td><th>Техник</th><td>${order.technician || "—"}</td></tr>
  <tr><th>Устройство</th><td>${order.device_type || ""} ${order.brand || ""} ${order.model || ""}</td><th>Сериен №</th><td>${order.serial_number || "—"}</td></tr>
  <tr><th>Проблем</th><td colspan="3">${order.problem}</td></tr>
  <tr><th>Описание</th><td colspan="3">${order.description || "—"}</td></tr>
  ${partsHtml}
  <tr><th>Статус</th><td><span class="status">${order.status}</span></td><th>Гаранция</th><td>${order.warranty_days || 90} дни след ремонт</td></tr>
  <tr><th>Аванс</th><td>${fmtMoney(order.deposit)}</td><th style="background:#f0fdf4">Сума за плащане</th><td style="font-size:18px;font-weight:800;color:#065f46">${fmtMoney(order.price)}</td></tr>
</table>
${order.notes ? `<div style="padding:10px 14px;background:#f8fafc;border-radius:6px;font-size:12px;color:#555;margin-bottom:16px"><strong>Забележки:</strong> ${order.notes}</div>` : ""}
<div class="warranty">
  ⚠️ Сервизът не носи отговорност за данни на устройството. Препоръчва се предварително архивиране.
  Гаранцията е ${order.warranty_days || 90} дни и важи само за извършения ремонт.
</div>
<div class="sig-row">
  <div class="sig-box"><hr><p>Предал: <strong>${order.client_name}</strong></p></div>
  <div class="sig-box"><hr><p>Приел: <strong>${order.technician || "Техник"}</strong></p></div>
</div>
<div class="footer">RepairPro — Сервизна система | Протокол генериран на ${new Date().toLocaleString("bg-BG")}</div>
<div style="text-align:center;margin:20px 0;display:flex;gap:10px;justify-content:center" class="no-print">
  <button onclick="window.print()" style="background:#1a56db;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">🖨️ Принтирай</button>
  <button onclick="downloadJPEG()" style="background:#059669;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">⬇️ JPEG</button>

</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script>
function downloadJPEG() {
  const btn = document.querySelector('.no-print');
  btn.style.display = 'none';
  html2canvas(document.body, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
  }).then(canvas => {
    btn.style.display = 'flex';
    const link = document.createElement('a');
    link.download = 'protokol_' + Date.now() + '.jpg';
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
  });
}
// downloadTXT handled via data URL in button
</script>
</body></html>`;

  const blob = new Blob([html], {type: 'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "width=800,height=700");
}

export async function printLabel(order) {
  const qr = await generateQR(order.id);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { margin: 0; padding: 8px; font-family: Arial, sans-serif; }
  .label { border: 2px solid #000; border-radius: 6px; padding: 10px; width: 300px; }
  .id { font-size: 16px; font-weight: 900; font-family: monospace; color: #1a56db; }
  .client { font-size: 13px; font-weight: 700; margin: 4px 0 2px; }
  .info { font-size: 11px; color: #333; margin: 2px 0; }
  .row { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
  .barcode { font-family: monospace; font-size: 22px; letter-spacing: 3px; color: #000; }
  @media print { @page { margin: 0; size: 80mm 50mm; } .no-print { display: none !important; } }
</style></head><body>
<div class="label">
  <div class="row">
    <div style="flex:1">
      <div class="id">${order.id}</div>
      <div class="client">${order.client_name}</div>
      <div class="info">📱 ${order.phone}</div>
      <div class="info">${order.device_type} ${order.brand || ""} ${order.model || ""}</div>
      <div class="info">⚠️ ${order.problem}</div>
      <div class="info">📅 ${fmtDate(order.date_in)} | 👨‍🔧 ${order.technician || "—"}</div>
    </div>
    <img src="${qr}" width="80" height="80"/>
  </div>
  <div style="text-align:center;margin-top:6px">
    <div class="barcode">||| || ||| |||</div>
    <div style="font-size:10px;color:#666">${order.id}</div>
  </div>
</div>
<div style="text-align:center;margin:20px 0;display:flex;gap:10px;justify-content:center" class="no-print">
  <button onclick="window.print()" style="background:#1a56db;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">🖨️ Принтирай</button>
  <button onclick="downloadJPEG()" style="background:#059669;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">⬇️ JPEG</button>

</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script>
function downloadJPEG() {
  const btn = document.querySelector('.no-print');
  btn.style.display = 'none';
  html2canvas(document.body, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
  }).then(canvas => {
    btn.style.display = 'flex';
    const link = document.createElement('a');
    link.download = 'protokol_' + Date.now() + '.jpg';
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
  });
}
// downloadTXT handled via data URL in button
</script>
</body></html>`;
  const blob = new Blob([html], {type: 'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "width=450,height=350");
}

export function printWarranty(order) {
  const parts = (order.parts||[]).map(p=>p.name).join(', ') || 'Ремонт';
  const issueDate = order.date_out || new Date().toISOString().split('T')[0];
  const warrantyDays = order.warranty_days || 30;
  const warrantyAmount = order.warranty_amount || 1;
  const warrantyUnit = order.warranty_unit || "месеца";
  const warrantyLabel = warrantyAmount + " " + warrantyUnit;
  const expiryDate = new Date(new Date(issueDate).getTime() + warrantyDays*24*60*60*1000).toLocaleDateString('bg-BG');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Гаранционна карта</title>
  <style>
    body{font-family:Arial,sans-serif;padding:0;margin:0;background:#fff;}
    .card{border:2px solid #1a56db;border-radius:12px;padding:28px 32px;max-width:560px;margin:20px auto;position:relative;}
    .header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1a56db;padding-bottom:12px;margin-bottom:16px;}
    .logo{font-size:22px;font-weight:900;color:#1a56db;}
    .logo span{font-size:13px;display:block;color:#64748b;font-weight:400;}
    .warranty-badge{background:#1a56db;color:#fff;padding:8px 18px;border-radius:8px;font-weight:700;font-size:15px;}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;}
    .info-item label{font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:2px;}
    .info-item span{font-size:13px;font-weight:600;color:#111;}
    .device{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px;margin-bottom:16px;text-align:center;}
    .device .name{font-size:16px;font-weight:800;color:#0369a1;}
    .device .problem{font-size:12px;color:#64748b;margin-top:4px;}
    .warranty-period{background:#f0fdf4;border:2px solid #86efac;border-radius:8px;padding:14px;text-align:center;margin-bottom:16px;}
    .warranty-period .days{font-size:32px;font-weight:900;color:#16a34a;}
    .warranty-period .label{font-size:12px;color:#64748b;}
    .warranty-period .dates{font-size:13px;color:#16a34a;margin-top:4px;font-weight:600;}
    .conditions{font-size:11px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:12px;line-height:1.6;}
    .sig-row{display:flex;justify-content:space-between;margin-top:20px;gap:30px;}
    .sig-box{flex:1;text-align:center;}
    .sig-box hr{border:1px solid #94a3b8;margin-bottom:4px;}
    .sig-box p{font-size:11px;color:#64748b;margin:2px 0;}
    .watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:80px;font-weight:900;color:rgba(26,86,219,.04);pointer-events:none;white-space:nowrap;}
    .no-print{display:flex;gap:8px;justify-content:center;margin:16px 0;}
    @media print{.no-print{display:none!important} body{padding:0} .card{margin:0;border-radius:0;border:2px solid #1a56db;}}
  </style></head><body>
  <div class="card">
    <div class="watermark">ГАРАНЦИЯ</div>
    <div class="header">
      <div class="logo">🔧 RepairPro<span>Сервизна CRM система</span></div>
      <div class="warranty-badge">✅ ГАРАНЦИОННА КАРТА</div>
    </div>
    <div class="device">
      <div class="name">${[order.brand,order.model].filter(Boolean).join(' ')||order.device_type||'—'}</div>
      ${order.serial_number?`<div style="font-size:14px;color:#0369a1;margin-top:8px;font-weight:800">IMEI: ${order.serial_number}</div>`:''}
    </div>
    <div class="warranty-period">
      <div class="days">${warrantyLabel}</div>
      <div class="label">гаранция (${warrantyDays} дни)</div>
      <div class="dates">от ${new Date(issueDate).toLocaleDateString('bg-BG')} до ${expiryDate}</div>
    </div>
    <div class="info-grid">
      <div class="info-item"><label>Клиент</label><span>${order.client_name||'—'}</span></div>
      <div class="info-item"><label>Телефон</label><span>${order.phone||'—'}</span></div>
      <div class="info-item"><label>Поръчка №</label><span>${order.id}</span></div>
      <div class="info-item"><label>Дата на ремонт</label><span>${new Date(issueDate).toLocaleDateString('bg-BG')}</span></div>
      <div class="info-item"><label>Валидна до</label><span style="color:#16a34a;font-weight:800">${expiryDate}</span></div>
    </div>
    <div class="conditions">
      <b>Условия на гаранцията:</b><br>
      
      • Гаранцията покрива фабрични дефекти и хардуерни неизправности.<br>
      <b>Гаранцията не важи при:</b><br>
      • Механични повреди, влага/вода, самостоятелен ремонт.<br>
      • Софтуерни проблеми вследствие на неправилна употреба.
    </div>
    <div class="sig-row">
      <div class="sig-box"><hr><p>Издадена от: <b>${order.technician||'........................'}</b></p><p>Подпис: ........................</p></div>
      <div class="sig-box"><hr><p>Клиент: <b>${order.client_name||'........................'}</b></p><p>Подпис: ........................</p></div>
    </div>
    <div class="no-print">
      <button onclick="window.print()" style="background:#1a56db;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">🖨️ Принтирай</button>
      <button onclick="downloadJPEG()" style="background:#059669;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">⬇️ JPEG</button>
    </div>
  </div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <script>
  function downloadJPEG() {
    const btn = document.querySelector('.no-print');
    btn.style.display = 'none';
    html2canvas(document.querySelector('.card'), {scale:2,backgroundColor:'#ffffff',useCORS:true}).then(canvas => {
      btn.style.display = 'flex';
      const link = document.createElement('a');
      link.download = 'garantsia_${order.id}.jpg';
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    });
  }
  </script>
  </body></html>`;

  const blob = new Blob([html], {type: 'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "width=640,height=800");
}
