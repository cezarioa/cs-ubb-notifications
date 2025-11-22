// service-worker.js - Handles push notifications in the background

self.addEventListener('install', (event) => {
    console.log('Service Worker installed');
    self.skipWaiting();
  });
  
  self.addEventListener('activate', (event) => {
    console.log('Service Worker activated');
    event.waitUntil(clients.claim());
  });
  
  // Handle push notifications
  self.addEventListener('push', (event) => {
    console.log('Push notification received', event);
    
    let data = {};
    
    if (event.data) {
      try {
        data = event.data.json();
      } catch (e) {
        data = {
          title: 'New Announcement',
          body: event.data.text()
        };
      }
    }
    
    const options = {
      body: data.body || 'New announcement from CS UBB',
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/badge-72.png',
      vibrate: [200, 100, 200],
      data: {
        url: data.data?.url || 'https://www.cs.ubbcluj.ro/anunturi/anunturi-studenti/'
      },
      actions: [
        {
          action: 'open',
          title: 'Read Now'
        },
        {
          action: 'close',
          title: 'Close'
        }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'New CS Announcement', options)
    );
  });
  
  // Handle notification clicks
  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    if (event.action === 'open' || !event.action) {
      const urlToOpen = event.notification.data.url;
      
      event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then((clientList) => {
            // Check if there's already a window open
            for (let i = 0; i < clientList.length; i++) {
              const client = clientList[i];
              if (client.url === urlToOpen && 'focus' in client) {
                return client.focus();
              }
            }
            // Open new window
            if (clients.openWindow) {
              return clients.openWindow(urlToOpen);
            }
          })
      );
    }
  });