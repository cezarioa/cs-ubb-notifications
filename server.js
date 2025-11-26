// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const db = require('./db');
const scraper = require('./scraper');
const notifier = require('./notifier');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get recent announcements
app.get('/api/announcements', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const announcements = await db.getRecentAnnouncements(limit);
    res.json({ success: true, data: announcements });
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch announcements' });
  }
});

// Subscribe to notifications
app.post('/api/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ success: false, error: 'Invalid subscription data' });
    }

    await db.addSubscription(endpoint, keys.p256dh, keys.auth);
    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (error) {
    console.error('Error subscribing:', error);
    res.status(500).json({ success: false, error: 'Failed to subscribe' });
  }
});

// Unsubscribe from notifications
app.post('/api/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    
    if (!endpoint) {
      return res.status(400).json({ success: false, error: 'Endpoint required' });
    }

    await db.removeSubscription(endpoint);
    res.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ success: false, error: 'Failed to unsubscribe' });
  }
});

// Manual scraper trigger (admin endpoint - add auth in production)
app.post('/api/check-new', async (req, res) => {
  try {
    const newAnnouncements = await scraper.checkForNewAnnouncements();
    
    if (newAnnouncements.length > 0) {
      await notifier.sendNotifications(newAnnouncements);
      res.json({ 
        success: true, 
        message: `Found ${newAnnouncements.length} new announcement(s)`,
        announcements: newAnnouncements
      });
    } else {
      res.json({ success: true, message: 'No new announcements' });
    }
  } catch (error) {
    console.error('Error checking announcements:', error);
    res.status(500).json({ success: false, error: 'Failed to check announcements' });
  }
});

// Get stats (admin endpoint)
app.get('/api/stats', async (req, res) => {
  try {
    const subscriberCount = await db.getSubscriberCount();
    const announcementCount = await db.getAnnouncementCount();
    
    res.json({ 
      success: true, 
      data: {
        subscribers: subscriberCount,
        announcements: announcementCount
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// Initialize database and start server
async function start() {
  try {
    await db.initialize();
    console.log('✓ Database initialized');

    // Schedule scraper to run every 30 minutes
    cron.schedule('*/30 * * * *', async () => {
      console.log('Running scheduled scraper check...');
      try {
        const newAnnouncements = await scraper.checkForNewAnnouncements();
        if (newAnnouncements.length > 0) {
          console.log(`Found ${newAnnouncements.length} new announcement(s)`);
          await notifier.sendNotifications(newAnnouncements);
        }
      } catch (error) {
        console.error('Scraper error:', error);
      }
    });
    console.log('✓ Scraper scheduled (every 30 minutes)');

    // Run initial check on startup
    setTimeout(async () => {
      try {
        const newAnnouncements = await scraper.checkForNewAnnouncements();
        if (newAnnouncements.length > 0) {
          console.log(`Initial check: Found ${newAnnouncements.length} new announcement(s)`);
        }
      } catch (error) {
        console.error('Initial scraper error:', error);
      }
    }, 5000);

    app.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();