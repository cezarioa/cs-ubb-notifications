// notifier.js
const webpush = require('web-push');
const db = require('./db');

// Configure web-push with VAPID keys
// Generate these with: npx web-push generate-vapid-keys
webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL || 'your-email@example.com'}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Send notification to a single subscriber
async function sendNotification(subscription, payload) {
  try {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth
      }
    };

    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
    return { success: true };
  } catch (error) {
    // Handle expired/invalid subscriptions
    if (error.statusCode === 404 || error.statusCode === 410) {
      console.log('Subscription expired, removing:', subscription.endpoint.substring(0, 50));
      await db.removeInvalidSubscription(subscription.endpoint);
      return { success: false, removed: true };
    }
    
    console.error('Error sending notification:', error.message);
    return { success: false, error: error.message };
  }
}

// Send notifications to all subscribers about new announcements
async function sendNotifications(announcements) {
  if (!announcements || announcements.length === 0) {
    return;
  }

  const subscriptions = await db.getAllSubscriptions();
  
  if (subscriptions.length === 0) {
    console.log('No subscribers to notify');
    return;
  }

  console.log(`Sending notifications to ${subscriptions.length} subscriber(s)...`);

  // Prepare notification payload
  const notification = announcements.length === 1 
    ? {
        title: 'Anunț nou CS UBB',
        body: announcements[0].title,
        icon: '/icon.png',
        badge: '/badge.png',
        url: announcements[0].url,
        tag: 'announcement'
      }
    : {
        title: `${announcements.length} anunțuri noi CS UBB`,
        body: announcements.map(a => a.title).join('\n').substring(0, 100) + '...',
        icon: '/icon.png',
        badge: '/badge.png',
        url: 'https://www.cs.ubbcluj.ro/anunturi/anunturi-studenti/',
        tag: 'announcement'
      };

  // Send to all subscribers
  const results = await Promise.allSettled(
    subscriptions.map(sub => sendNotification(sub, notification))
  );

  // Count successes and failures
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const removed = results.filter(r => r.status === 'fulfilled' && r.value.removed).length;
  const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success && !r.value.removed)).length;

  console.log(`Notifications sent: ${successful} successful, ${removed} removed, ${failed} failed`);
  
  return {
    total: subscriptions.length,
    successful,
    removed,
    failed
  };
}

// Send a test notification
async function sendTestNotification(subscription) {
  const payload = {
    title: 'Test Notification',
    body: 'This is a test notification from CS UBB Announcer',
    icon: '/icon.png',
    tag: 'test'
  };

  return sendNotification(subscription, payload);
}

module.exports = {
  sendNotification,
  sendNotifications,
  sendTestNotification
};