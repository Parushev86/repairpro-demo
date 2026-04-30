const isElectron = typeof window !== "undefined" && !!window.electronAPI;

export function buildReadyEmail(order, settings) {
  const senderName = settings?.senderName || "Нашият Сервиз";
  const subject = `✅ Устройството Ви е готово — Поръчка ${order.id}`;
  const body = `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:20px">
<div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1)">
  <div style="background:#0f172a;padding:24px 28px">
    <h1 style="color:#38bdf8;margin:0;font-size:20px">🔧 ${senderName}</h1>
  </div>
  <div style="padding:28px">
    <h2 style="color:#0f172a;margin:0 0 16px">Здравейте, ${order.client_name}!</h2>
    <p style="color:#475569;margin:0 0 20px">Радваме се да Ви уведомим, че устройството Ви е <strong style="color:#10b981">готово за вземане</strong>.</p>
    <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px">№ поръчка:</td><td style="padding:6px 0;font-weight:700;font-family:monospace">${order.id}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Устройство:</td><td style="padding:6px 0">${order.device_type} ${order.brand || ""} ${order.model || ""}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Проблем:</td><td style="padding:6px 0">${order.problem}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Сума за плащане:</td><td style="padding:6px 0;font-size:18px;font-weight:700;color:#10b981">${Number(order.price||0).toFixed(2)} лв.</td></tr>
      </table>
    </div>
    <p style="color:#475569;font-size:13px">Можете да заповядате в нашия сервиз в работно време. При въпроси не се колебайте да се свържете с нас.</p>
    <p style="color:#475569;font-size:13px;margin-top:16px">С уважение,<br><strong>${senderName}</strong></p>
  </div>
</div>
</body></html>`;
  return { subject, body };
}

export async function sendReadyEmail(order, settings) {
  if (!isElectron) return { ok: false, error: "Не е наличен Electron" };
  if (!order.email) return { ok: false, error: "Клиентът няма имейл" };
  if (!settings?.smtpHost) return { ok: false, error: "Имейл настройките не са конфигурирани" };

  const { subject, body } = buildReadyEmail(order, settings);
  return window.electronAPI.sendEmail({ to: order.email, subject, body, settings });
}
