// public/sw.js — Cove service worker: Web Push ticket notifications.
// No precaching; this worker only handles push events.

self.addEventListener('push', (event) => {
  let title = 'Cove — new call';
  let body = 'You have a new screened call.';
  let url = '/dashboard';
  try {
    if (event.data) {
      const data = event.data.json();
      if (data.title) title = data.title;
      if (data.body) body = data.body;
      if (data.url) url = data.url;
    }
  } catch {
    // fall back to defaults above
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.includes(url)) return w.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
