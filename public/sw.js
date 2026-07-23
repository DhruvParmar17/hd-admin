self.addEventListener('push', (event) => {
  let data = { title: '🚨 NEW CUSTOMER ENQUIRY RECEIVED!', body: 'Tap immediately to view material details and generate bill.' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: '🚨 NEW CUSTOMER ENQUIRY RECEIVED!', body: event.data.text() };
    }
  }

  const title = data.title || '🚨 NEW CUSTOMER ENQUIRY RECEIVED!';
  const options = {
    body: data.body || 'Tap immediately to view material details and generate bill.',
    icon: data.icon || '/icon.png',
    badge: data.badge || '/badge.png',
    tag: data.tag || 'new-enquiry',
    renotify: data.renotify !== undefined ? data.renotify : true,
    requireInteraction: data.requireInteraction !== undefined ? data.requireInteraction : true,
    vibrate: data.vibrate || [500, 110, 500, 110, 500, 110, 500],
    data: { url: '/' }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Find any window with the same origin
      for (const client of clientList) {
        try {
          const clientUrl = new URL(client.url, self.location.origin);
          if (clientUrl.origin === self.location.origin && 'focus' in client) {
            return client.focus();
          }
        } catch (err) {
          console.error('URL parse failed:', err);
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
