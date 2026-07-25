// PWA Registration + Push Notifications
// Постави този код в App.jsx useEffect при стартиране

export async function registerPWA() {
  if (!("serviceWorker" in navigator)) {
    console.log("Service Worker не се поддържа");
    return;
  }

  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    console.log("SW регистриран:", reg.scope);

    // Поискай разрешение за нотификации
    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      console.log("Нотификации:", perm);
    }

    return reg;
  } catch (e) {
    console.error("SW грешка:", e);
  }
}

// Показване на локална нотификация през SW
export async function showNotification(title, body, tag = "chat") {
  if (!("serviceWorker" in navigator)) return;
  if (Notification.permission !== "granted") return;

  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-72.png",
    tag,
    renotify: true,
  });
}
