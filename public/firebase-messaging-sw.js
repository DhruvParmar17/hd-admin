// Standalone Service Worker for HD PLY Web Push Notifications
self.addEventListener('push', function(event) {
  event.waitUntil(
    self.registration.showNotification('HD PLY - New Order Alert!', {
      body: 'A new wholesale requirement has passed verification.',
      icon: '/icons/icon-192x192.png',
      vibrate: [300, 100, 300, 100, 500], // Native hardware vibration sequence
      tag: 'admin-enquiry-alert',
      requireInteraction: true
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/dashboard/admin')
  );
});
