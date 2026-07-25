// RepairPro Service Worker v1.0
const CACHE_NAME = "repairpro-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(clients.claim());
});

// Push нотификации
self.addEventListener("push", (e) => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || "💬 RepairPro", {
      body: data.body || "Ново съобщение",
      icon: "/icon-192.png",
      badge: "/icon-72.png",
      tag: data.tag || "chat",
      renotify: true,
      data: { url: data.url || "/" },
    })
  );
});

// Клик върху нотификацията
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const url = e.notification.data?.url || "/";
      for (const client of list) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          client.postMessage({ type: "NOTIFICATION_CLICK", url });
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// Background sync — проверява за нови съобщения
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});
