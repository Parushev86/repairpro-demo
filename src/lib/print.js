import QRCode from "qrcode";
import { fmtDate, fmtMoney } from "./constants.js";

export async function generateQR(text) {
  return QRCode.toDataURL(text, { width: 120, margin: 1, color: { dark: "#000", light: "#fff" } });
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
  <button onclick="downloadTXT()" style="background:#7c3aed;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">⬇️ TXT</button>
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
function downloadTXT() {
  const rows = document.querySelectorAll('table tr');
  let text = 'ПРИЕМНО-ПРЕДАВАТЕЛЕН ПРОТОКОЛ\n';
  text += '='.repeat(40) + '\n\n';
  rows.forEach(row => {
    const cells = row.querySelectorAll('th,td');
    if(cells.length === 4) {
      text += cells[0].innerText.trim() + ': ' + cells[1].innerText.trim() + '\t\t';
      text += cells[2].innerText.trim() + ': ' + cells[3].innerText.trim() + '\n';
    } else if(cells.length === 2) {
      text += cells[0].innerText.trim() + ': ' + cells[1].innerText.trim() + '\n';
    }
  });
  text += '\n' + '='.repeat(40) + '\n';
  text += 'Генериран: ' + new Date().toLocaleString('bg-BG') + '\n';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'protokol_' + Date.now() + '.txt';
  link.click();
}
</script>
</body></html>`;

  const w = window.open("", "_blank", "width=800,height=700");
  w.document.write(html);
  w.document.close();
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
  <button onclick="downloadTXT()" style="background:#7c3aed;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">⬇️ TXT</button>
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
function downloadTXT() {
  const rows = document.querySelectorAll('table tr');
  let text = 'ПРИЕМНО-ПРЕДАВАТЕЛЕН ПРОТОКОЛ\n';
  text += '='.repeat(40) + '\n\n';
  rows.forEach(row => {
    const cells = row.querySelectorAll('th,td');
    if(cells.length === 4) {
      text += cells[0].innerText.trim() + ': ' + cells[1].innerText.trim() + '\t\t';
      text += cells[2].innerText.trim() + ': ' + cells[3].innerText.trim() + '\n';
    } else if(cells.length === 2) {
      text += cells[0].innerText.trim() + ': ' + cells[1].innerText.trim() + '\n';
    }
  });
  text += '\n' + '='.repeat(40) + '\n';
  text += 'Генериран: ' + new Date().toLocaleString('bg-BG') + '\n';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'protokol_' + Date.now() + '.txt';
  link.click();
}
</script>
</body></html>`;
  const w = window.open("", "_blank", "width=450,height=350");
  w.document.write(html);
  w.document.close();
}
