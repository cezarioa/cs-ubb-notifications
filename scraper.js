// scraper.js
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const db = require('./db');

const ANNOUNCEMENTS_URL = 'https://www.cs.ubbcluj.ro/anunturi/anunturi-studenti/';

// Generate hash for announcement (to detect duplicates)
function generateHash(title, url) {
  return crypto.createHash('sha256').update(title + url).digest('hex');
}

// Scrape announcements from the page
async function scrapeAnnouncements() {
  try {
    const response = await axios.get(ANNOUNCEMENTS_URL, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const announcements = [];

    // Parse the announcement items
    // The structure shows links with titles followed by content paragraphs
    $('a[href*="cs.ubbcluj.ro"]').each((i, elem) => {
      const $link = $(elem);
      const url = $link.attr('href');
      const title = $link.text().trim();

      // Get the next element (content preview)
      let contentPreview = '';
      const $next = $link.parent().next();
      if ($next.length) {
        contentPreview = $next.text().trim().substring(0, 200);
      }

      // Only process if we have a valid title and URL
      if (title && url && url.includes('cs.ubbcluj.ro')) {
        const hash = generateHash(title, url);
        announcements.push({
          title,
          url,
          contentPreview,
          hash
        });
      }
    });

    return announcements;
  } catch (error) {
    console.error('Error scraping announcements:', error.message);
    throw error;
  }
}

// Check for new announcements and save to database
async function checkForNewAnnouncements() {
  try {
    console.log('Checking for new announcements...');
    const scrapedAnnouncements = await scrapeAnnouncements();
    const newAnnouncements = [];

    for (const announcement of scrapedAnnouncements) {
      const exists = await db.announcementExists(announcement.hash);
      
      if (!exists) {
        const saved = await db.addAnnouncement(
          announcement.title,
          announcement.url,
          announcement.contentPreview,
          announcement.hash
        );
        
        if (saved) {
          newAnnouncements.push(announcement);
          console.log(`New announcement: ${announcement.title}`);
        }
      }
    }

    return newAnnouncements;
  } catch (error) {
    console.error('Error checking for new announcements:', error);
    throw error;
  }
}

module.exports = {
  scrapeAnnouncements,
  checkForNewAnnouncements
};