// server.js - Complete Node.js Backend for CS UBB Push Notifications
const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const cheerio = require('cheerio');
const cron = require('node-cron');
const mongoose = require('mongoose');
const https = require('https');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// CONFIGURATION
// ============================================

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const TARGET_URL = 'https://www.cs.ubbcluj.ro/anunturi/anunturi-studenti/';

// Validate environment variables
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('❌ ERROR: VAPID keys not configured!');
  console.error('Run: npx web-push generate-vapid-keys');
  console.error('Then set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Railway');
  process.exit(1);
}

if (!MONGODB_URI) {
  console.error('❌ ERROR: MONGODB_URI not configured!');
  console.error('Set MONGODB_URI in Railway environment variables');
  process.exit(1);
}

webpush.setVapidDetails(
  'mailto:your-email@example.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// ============================================
// DATABASE SCHEMAS
// ============================================

mongoose.connect(MONGODB_URI);

const subscriptionSchema = new mongoose.Schema({
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: String,
    auth: String
  },
  createdAt: { type: Date, default: Date.now }
});

const announcementSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: String,
  url: String,
  firstSeen: { type: Date, default: Date.now }
});

const Subscription = mongoose.model('Subscription', subscriptionSchema);
const Announcement = mongoose.model('Announcement', announcementSchema);

// ============================================
// SCRAPER FUNCTION
// ============================================

async function scrapeAnnouncements() {
  try {
    console.log('🔍 Checking for new announcements...');
    
    const response = await fetch(TARGET_URL);
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const announcements = [];
    
    // Extract announcement links
    $('a[href*="cs.ubbcluj.ro"]').each((index, element) => {
      const href = $(element).attr('href');
      const title = $(element).text().trim();
      
      // Filter out navigation and non-announcement links
      if (href && 
          title && 
          href.includes('cs.ubbcluj.ro') && 
          !href.includes('/anunturi/') && 
          title.length > 10) {
        announcements.push({
          id: href,
          title: title,
          url: href
        });
      }
    });
    
    return announcements;
  } catch (error) {
    console.error('❌ Scraping error:', error.message);
    return [];
  }
}

// ============================================
// NOTIFICATION FUNCTION
// ============================================

async function sendNotification(subscription, announcement) {
  const payload = JSON.stringify({
    title: '🆕 New CS Announcement!',
    body: announcement.title,
    icon: '/icon.png',
    badge: '/badge.png',
    data: {
      url: announcement.url
    }
  });

  try {
    await webpush.sendNotification(subscription, payload);
    console.log('✅ Notification sent successfully');
  } catch (error) {
    console.error('❌ Notification error:', error.message);
    
    // Remove invalid subscriptions
    if (error.statusCode === 410) {
      await Subscription.deleteOne({ endpoint: subscription.endpoint });
      console.log('🗑️  Removed expired subscription');
    }
  }
}

// ============================================
// CHECK FOR NEW ANNOUNCEMENTS
// ============================================

async function checkForNewAnnouncements() {
  const currentAnnouncements = await scrapeAnnouncements();
  
  if (currentAnnouncements.length === 0) {
    console.log('⚠️  No announcements found');
    return;
  }
  
  // Check each announcement
  for (const announcement of currentAnnouncements) {
    const existing = await Announcement.findOne({ id: announcement.id });
    
    if (!existing) {
      // New announcement found!
      console.log('🆕 NEW ANNOUNCEMENT:', announcement.title);
      
      // Save to database
      await Announcement.create(announcement);
      
      // Send notifications to all subscribers
      const subscriptions = await Subscription.find({});
      console.log(`📤 Sending to ${subscriptions.length} subscribers`);
      
      for (const sub of subscriptions) {
        await sendNotification({
          endpoint: sub.endpoint,
          keys: sub.keys
        }, announcement);
      }
    }
  }
  
  console.log(`✓ Check complete. ${currentAnnouncements.length} announcements tracked`);
}

// ============================================
// API ENDPOINTS
// ============================================

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'running',
    message: 'CS UBB Push Notification Service',
    subscribers: 0 // Will be updated with actual count
  });
});

// Get VAPID public key
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Subscribe endpoint
app.post('/api/subscribe', async (req, res) => {
  try {
    const subscription = req.body;
    
    // Save or update subscription
    await Subscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys
      },
      { upsert: true, new: true }
    );
    
    console.log('✅ New subscriber added');
    res.status(201).json({ success: true });
  } catch (error) {
    console.error('❌ Subscription error:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Unsubscribe endpoint
app.post('/api/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    await Subscription.deleteOne({ endpoint });
    
    console.log('👋 Subscriber removed');
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// Get recent announcements
app.get('/api/announcements', async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .sort({ firstSeen: -1 })
      .limit(10);
    
    res.json(announcements);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// Manual trigger (for testing)
app.post('/api/check-now', async (req, res) => {
  try {
    await checkForNewAnnouncements();
    res.json({ success: true, message: 'Check triggered' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CRON JOB - Check every 15 minutes
// ============================================

cron.schedule('*/15 * * * *', () => {
  console.log('\n⏰ Scheduled check triggered');
  checkForNewAnnouncements();
});

// Initial check on startup
setTimeout(() => {
  console.log('🚀 Running initial check...');
  checkForNewAnnouncements();
}, 5000);

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║  CS UBB Push Notification Service       ║
  ║  Server running on port ${PORT}            ║
  ║  Checking every 15 minutes              ║
  ╚══════════════════════════════════════════╝
  `);
});