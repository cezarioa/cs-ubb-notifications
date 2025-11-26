// db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database tables
async function initialize() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        url TEXT UNIQUE NOT NULL,
        content_preview TEXT,
        hash VARCHAR(64) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        endpoint TEXT UNIQUE NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create index for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_announcements_hash ON announcements(hash);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC);
    `);

  } finally {
    client.release();
  }
}

// Check if announcement exists by hash
async function announcementExists(hash) {
  const result = await pool.query(
    'SELECT id FROM announcements WHERE hash = $1',
    [hash]
  );
  return result.rows.length > 0;
}

// Add new announcement
async function addAnnouncement(title, url, contentPreview, hash) {
  const result = await pool.query(
    `INSERT INTO announcements (title, url, content_preview, hash) 
     VALUES ($1, $2, $3, $4) 
     ON CONFLICT (hash) DO NOTHING
     RETURNING *`,
    [title, url, contentPreview, hash]
  );
  return result.rows[0];
}

// Get recent announcements
async function getRecentAnnouncements(limit = 10) {
  const result = await pool.query(
    'SELECT * FROM announcements ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return result.rows;
}

// Get announcement count
async function getAnnouncementCount() {
  const result = await pool.query('SELECT COUNT(*) FROM announcements');
  return parseInt(result.rows[0].count);
}

// Add subscription
async function addSubscription(endpoint, p256dh, auth) {
  const result = await pool.query(
    `INSERT INTO subscriptions (endpoint, p256dh, auth) 
     VALUES ($1, $2, $3) 
     ON CONFLICT (endpoint) DO UPDATE 
     SET p256dh = $2, auth = $3
     RETURNING *`,
    [endpoint, p256dh, auth]
  );
  return result.rows[0];
}

// Remove subscription
async function removeSubscription(endpoint) {
  await pool.query('DELETE FROM subscriptions WHERE endpoint = $1', [endpoint]);
}

// Get all subscriptions
async function getAllSubscriptions() {
  const result = await pool.query('SELECT * FROM subscriptions');
  return result.rows;
}

// Get subscriber count
async function getSubscriberCount() {
  const result = await pool.query('SELECT COUNT(*) FROM subscriptions');
  return parseInt(result.rows[0].count);
}

// Remove invalid subscription (for cleanup)
async function removeInvalidSubscription(endpoint) {
  await pool.query('DELETE FROM subscriptions WHERE endpoint = $1', [endpoint]);
}

module.exports = {
  initialize,
  announcementExists,
  addAnnouncement,
  getRecentAnnouncements,
  getAnnouncementCount,
  addSubscription,
  removeSubscription,
  getAllSubscriptions,
  getSubscriberCount,
  removeInvalidSubscription
};