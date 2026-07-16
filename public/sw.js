/* TickBell push service worker: handles background and foreground notification display. */
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { title: "TickBell", body: event.data ? event.data.text() : "" }; }
  const {
    title = "TickBell",
    body = "",
    tag,
    url = "/home",
    kind = "message",
    icon = "/icon-192.png",
    badge = "/icon-192.png",
  } = payload;

  const isBell = kind === "bell";
  const options = {
    body,
    tag: tag || `${kind}-${Date.now()}`,
    renotify: true,
    icon,
    badge,
    timestamp: Date.now(),
    data: { url, kind, payload },
    requireInteraction: isBell,
    vibrate: isBell ? [300, 100, 300, 100, 400, 100, 300] : [120, 60, 120],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/home";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) {
        try { await c.navigate(target); } catch { /* cross-origin */ }
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
