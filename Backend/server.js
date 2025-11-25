import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import axios from "axios";
import * as cheerio from "cheerio";
import AuthorProfile from './models/AuthorProfile.js';
import { JournalistModel } from './models/Journalist.js';
import authorRoutes from './routes/authorRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5002;
const MONGO_URI = process.env.MONGO_URI;

const allowedOrigins = [
  "http://localhost:8080",     // Local development
  "http://localhost:5173",     // Vite dev server
  "https://aten.vercel.app"   // Production
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

app.use(express.json());

app.use('/api/authors', authorRoutes);

// ---------------- MongoDB setup ----------------
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((err) => console.error("MongoDB connection error:", err));

// Author schema & model
const AuthorSchema = new mongoose.Schema({
  name: String,
  profileLink: String,
  outlet: String,
  scrapedAt: { type: Date, default: Date.now },
});

// Check if model already exists, otherwise define
const Author = mongoose.models.Author || mongoose.model("Author", AuthorSchema);

// ---------------- Delay helper ----------------
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// User agent rotation
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

const TOPICS = [
  "Technology",
  "Politics",
  "Business",
  "Science",
  "Entertainment",
  "Sports",
  "Health",
  "Environment",
];

// ---------------- Stage 0: Find official website of outlet using DuckDuckGo ----------------
async function findOutletWebsite(outletName) {
  try {
    console.log(`🔍 Finding website for: ${outletName} using DuckDuckGo...`);
    
    // Try DuckDuckGo HTML API (no key required)
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(outletName + ' official website news india')}`;
    
    try {
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 10000
      });
      
      const cheerio = await import('cheerio');
      const $ = cheerio.load(response.data);
      
      // Extract the first result link
      const firstResult = $('.result__a').first();
      if (firstResult.length > 0) {
        const href = firstResult.attr('href');
        if (href && href.startsWith('http')) {
          console.log(`✅ Found via DuckDuckGo: ${href}`);
          return href;
        }
      }
    } catch (ddgErr) {
      console.log(`⚠️  DuckDuckGo search failed: ${ddgErr.message}`);
    }
    
    // Fallback: try common patterns
    console.log(`Trying common domain patterns...`);
    const commonDomains = [
      `https://www.${outletName.toLowerCase().replace(/\s+/g, '')}.com`,
      `https://www.${outletName.toLowerCase().replace(/\s+/g, '')}.in`,
      `https://${outletName.toLowerCase().replace(/\s+/g, '')}.com`,
      `https://${outletName.toLowerCase().replace(/\s+/g, '')}online.com`,
    ];
    
    for (const domain of commonDomains) {
      try {
        const response = await axios.head(domain, { timeout: 5000 });
        if (response.status === 200) {
          console.log(`✅ Found via pattern matching: ${domain}`);
          return domain;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Last resort: return first common domain
    console.log(`⚠️  Using best guess: ${commonDomains[0]}`);
    return commonDomains[0];
  } catch (err) {
    console.error("Error finding outlet website:", err.message);
    return null;
  }
}

// ---------------- Find multiple author pages using DuckDuckGo ----------------
async function findAuthorsPages(outlet, maxPages = 5) {
  try {
    console.log(`🔍 Finding author pages for: ${outlet} using DuckDuckGo...`);
    
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(outlet + ' authors journalists team staff contributors')}`;
    
    try {
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 10000
      });
      
      const cheerio = await import('cheerio');
      const $ = cheerio.load(response.data);
      
      const pages = [];
      $('.result__a').each((i, el) => {
        if (pages.length >= maxPages) return false;
        
        const href = $(el).attr('href');
        if (href && href.startsWith('http') && 
            /author|profile|writer|journalist|team|staff|contributor|people/i.test(href)) {
          pages.push(href);
        }
      });
      
      console.log(`✅ Found ${pages.length} author pages via DuckDuckGo`);
      return [...new Set(pages)]; // remove duplicates
    } catch (ddgErr) {
      console.log(`⚠️  DuckDuckGo search failed: ${ddgErr.message}`);
      return [];
    }
  } catch (err) {
    console.error("Error finding author pages:", err.message);
    return [];
  }
}

// ---------------- Cheerio-based scraper for authors ----------------
async function scrapeAuthorsFromPage(url, limit = 50) {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": getRandomUserAgent(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Referer": "https://www.google.com/",
      },
      timeout: 30000,
      maxRedirects: 5,
    });

    const $ = cheerio.load(response.data);
    const authors = [];
    const seen = new Set();

    // STRICT VALIDATION: Category/section names to reject
    const INVALID_NAMES = [
      'travel', 'news', 'desk', 'bureau', 'team', 'editor', 'reporter',
      'international', 'national', 'sports', 'business', 'politics',
      'entertainment', 'technology', 'health', 'education', 'general',
      'lifestyle', 'opinion', 'analysis', 'cricket', 'food', 'auto',
      'world', 'india', 'fashion', 'gaming', 'music', 'movies', 'tv',
      'science', 'environment', 'climate', 'regional', 'state', 'agencies',
      'wire service', 'news desk', 'bureau chief', 'editorial', 'staff',
      'editorial board', 'news team', 'web team', 'digital team'
    ];

    // Helper function to validate journalist name - SUPPORTS ALL LANGUAGES
    function isValidJournalistName(name) {
      if (!name || typeof name !== 'string') return false;

      const trimmed = name.trim();

      // Length check (3-60 characters - relaxed for single-name Indic authors)
      if (trimmed.length < 3 || trimmed.length > 60) return false;

      // Must have at least 1 word (relaxed for Indic languages)
      const words = trimmed.split(/\s+/);
      const usesIndicScript = /[\u0900-\u097F\u0980-\u09FF\u0A80-\u0AFF\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0D7F\u0E00-\u0E7F]/.test(trimmed);
      
      // For Indic scripts (Hindi, Bengali, Tamil, Malayalam, Thai, etc.), allow single names
      if (!usesIndicScript && (words.length < 2 || words.length > 6)) return false;
      if (usesIndicScript && (words.length < 1 || words.length > 6)) return false;

      const lowerName = trimmed.toLowerCase();

      // Reject if exactly matches category
      if (INVALID_NAMES.includes(lowerName)) return false;

      // Reject if any single word matches category (for 2-word names ONLY if English)
      if (!usesIndicScript) {
        const invalidWords = words.filter(word =>
          INVALID_NAMES.includes(word.toLowerCase())
        );
        if (invalidWords.length > 0 && words.length <= 2) return false;
      }

      // Must contain valid characters: 
      // - English: letters, spaces, dots, hyphens, apostrophes
      // - Indic: Devanagari, Bengali, Tamil, Malayalam, Telugu, Kannada, Gujarati, Punjabi, Thai, etc.
      if (!/^[A-Za-z\u0900-\u097F\u0980-\u09FF\u0A80-\u0AFF\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0D7F\u0E00-\u0E7F\s\.\-\']+$/.test(trimmed)) return false;

      // Reject common non-name patterns (only for English names)
      if (!usesIndicScript) {
        const rejectPatterns = [
          /^(the|by|from|with|and|or)\s/i,
          /\d{2,}/, // Contains multiple digits
          /\s(desk|team|bureau|staff|editor|reporter|correspondent)$/i,
          /^(breaking|latest|trending|updated)/i
        ];

        for (const pattern of rejectPatterns) {
          if (pattern.test(trimmed)) return false;
        }
      }

      // Each word should be at least 1 character (relaxed for all languages)
      if (words.some(word => word.length < 1)) return false;

      return true;
    }

    // Extract from meta tags (very reliable)
    $('meta[name="author"], meta[property="article:author"], meta[name="byl"]').each((i, el) => {
      const name = $(el).attr('content');
      if (name && isValidJournalistName(name)) {
        // Try to find a profile link for this author
        const profileLink = url.includes(name.toLowerCase().replace(/\s+/g, '-'))
          ? url
          : `${new URL(url).origin}/author/${name.toLowerCase().replace(/\s+/g, '-')}`;

        const key = profileLink + name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          authors.push({ name: name.trim(), profileLink });
        }
      }
    });

    // Define selectors for finding author links
    const CANDIDATES = [
      "a[rel='author']",
      "span[itemprop='author'] a",
      "div.byline a",
      "p.byline a",
      "a[href*='/author/']",
      "a[href*='/profile/']",
      "a[href*='/journalist/']",
      "a[href*='/reporter/']",
      "a[href*='/team/']",
      "a[href*='/contributors/']",
      "a[href*='/people/']",
      "a[href*='/staff/']",
      "a[href*='/writer/']",
      "a[href*='/topic/']", 
      ".author-name a",
      ".author a",
      ".contributor a",
      ".journalist a",
      ".staff-member a",
      ".byline a",
      "[class*='author'] a",
      "[class*='writer'] a",
      "[class*='byline'] a",
    ];

    // Collect all matching anchor elements
    const anchors = [];
    for (const selector of CANDIDATES) {
      $(selector).each((i, el) => {
        anchors.push($(el));
      });
    }

    // Process each anchor
    for (const $a of anchors) {
      if (authors.length >= limit) break;

      const href = $a.attr("href");
      let name = $a.text().trim();

      if (!href || !name) continue;

      // Skip invalid links
      if (
        href.startsWith("javascript:") ||
        href.startsWith("#") ||
        /facebook|twitter|instagram|linkedin|mailto|youtube|whatsapp|telegram/i.test(href)
      ) continue;

      // Resolve relative URLs
      const absHref = href.startsWith("http")
        ? href
        : new URL(href, url).href;

      // ============ STRICT VALIDATION ============

      // Use the validation function
      if (!isValidJournalistName(name)) continue;

      // ============ END STRICT VALIDATION ============

      // Deduplicate
      const key = absHref + name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      authors.push({ name, profileLink: absHref });
    }

    console.log(`  Scraped ${authors.length} valid journalists from ${url}`);
    return authors;
  } catch (err) {
    console.error("Cheerio scrape error:", err.message);
    return [];
  }
}

// ---------------- Advanced: Scrape directly from outlet website ----------------
async function scrapeOutletWebsite(websiteUrl, outlet, limit = 30) {
  try {
    const response = await axios.get(websiteUrl, {
      headers: {
        "User-Agent": getRandomUserAgent(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Referer": "https://www.google.com/",
      },
      timeout: 30000,
    });

    const $ = cheerio.load(response.data);
    const authors = [];
    const seen = new Set();

    // Outlet-specific patterns
    const outletPatterns = {
      'ndtv': {
        articleSelectors: ['a[href*="/news/"]', 'a[href*="/india/"]', 'a[href*="/world/"]'],
        authorSelectors: ['.pst-by_ln a', '.pst-by a', '.auth_name a', 'span.posted-by a']
      },
      'thehindu': {
        articleSelectors: ['a[href*="/news/"]'],
        authorSelectors: ['.author a', 'a[href*="/profile/author/"]']
      },
      'hindustantimes': {
        articleSelectors: ['a[href*="/news/"]'],
        authorSelectors: ['.authorName a', 'a[href*="/author/"]']
      }
    };

    const outletKey = outlet.toLowerCase().replace(/\s+/g, '');

    // Collect article links from homepage
    const articleLinks = [];
    $("a").each((i, el) => {
      const href = $(el).attr("href");
      if (href && /\/(news|article|story|india|world|sports|business)\//.test(href)) {
        const fullUrl = href.startsWith("http") ? href : new URL(href, websiteUrl).href;
        if (!articleLinks.includes(fullUrl)) {
          articleLinks.push(fullUrl);
        }
      }
    });

    console.log(`Found ${articleLinks.length} article links on ${outlet} homepage`);

    // Scrape authors from article pages (sample 10 articles)
    for (const articleUrl of articleLinks.slice(0, 10)) {
      if (authors.length >= limit) break;

      try {
        console.log(`Scraping article: ${articleUrl}`);
        const articleAuthors = await scrapeAuthorsFromPage(articleUrl, 5);

        for (const author of articleAuthors) {
          const key = author.profileLink + author.name.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            authors.push({ ...author, outlet });
            console.log(`Found author: ${author.name}`);
          }
        }

        await delay(1500); // Rate limiting
      } catch (err) {
        console.log(`Failed to scrape article ${articleUrl}: ${err.message}`);
      }
    }

    // Also try to find dedicated author/team pages
    const authorPageLinks = [];
    $("a").each((i, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().toLowerCase();

      if (href && (
        /author|journalist|team|staff|contributor|writer|people|profile|topic/i.test(href) ||
        text.includes("author") ||
        text.includes("team") ||
        text.includes("staff") ||
        text.includes("journalist") ||
        text.includes("writer")
      )) {
        const fullUrl = href.startsWith("http") ? href : new URL(href, websiteUrl).href;
        if (!authorPageLinks.includes(fullUrl)) {
          authorPageLinks.push(fullUrl);
        }
      }
    });

    console.log(`Found ${authorPageLinks.length} potential author pages for ${outlet}`);

    // Scrape each author page
    for (const pageUrl of authorPageLinks.slice(0, 5)) {
      if (authors.length >= limit) break;

      try {
        console.log(`Trying to scrape author page: ${pageUrl}`);
        const pageAuthors = await scrapeAuthorsFromPage(pageUrl, 20);
        console.log(`Found ${pageAuthors.length} authors from ${pageUrl}`);

        for (const author of pageAuthors) {
          const key = author.profileLink + author.name.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            authors.push({ ...author, outlet });
          }
        }

        await delay(2000); // Increased delay for rate limiting
      } catch (err) {
        console.log(`Failed to scrape ${pageUrl}: ${err.message}`);
      }
    }

    return authors;
  } catch (err) {
    console.error("Error scraping outlet website:", err.message);
    return [];
  }
}

// Job status tracking
const scrapingJobs = new Map();

// ---------------- API Endpoint: Detect outlet website ----------------
app.post("/detect-outlet", async (req, res) => {
  const outletName = (req.body.outlet || "").trim();
  if (!outletName) return res.status(400).json({ error: "Outlet name required" });

  try {
    const website = await findOutletWebsite(outletName);
    if (!website) {
      return res.status(404).json({ error: "Could not detect outlet website" });
    }

    res.json({ outlet: outletName, website });
  } catch (err) {
    console.error("Error in /detect-outlet:", err);
    res.status(500).json({ error: "Error detecting outlet website" });
  }
});

// ---------------- Scrape & Save Authors (Async with immediate response) ----------------
app.post("/scrape-authors", async (req, res) => {
  const outlet = (req.body.outlet || "").toLowerCase().trim();
  if (!outlet) return res.status(400).json({ error: "Outlet name required" });

  // Generate job ID
  const jobId = `${outlet}_${Date.now()}`;

  // Initialize job status
  scrapingJobs.set(jobId, {
    status: 'in_progress',
    outlet,
    progress: 0,
    authorsFound: 0,
    startTime: new Date(),
  });

  // Send immediate response with job ID
  res.json({
    jobId,
    status: 'started',
    message: 'Scraping started. Check /scrape-status/:jobId for progress.',
    outlet
  });

  // Start async scraping
  (async () => {
    try {
      console.log(`Starting scrape for outlet: ${outlet}`);

      // Update progress
      scrapingJobs.set(jobId, { ...scrapingJobs.get(jobId), progress: 10, message: 'Detecting website...' });

      // Stage 0: Find outlet website
      const outletWebsite = await findOutletWebsite(outlet);
      console.log(`Detected website: ${outletWebsite}`);

      let authors = [];

      // Update progress
      scrapingJobs.set(jobId, { ...scrapingJobs.get(jobId), progress: 20, message: 'Finding author pages...', website: outletWebsite });

      // Stage 1: Find author pages using SERP API
      const pages = await findAuthorsPages(outlet);
      console.log(`Found ${pages.length} author pages`);

      // Update progress
      scrapingJobs.set(jobId, { ...scrapingJobs.get(jobId), progress: 30, message: `Scraping ${pages.length} pages...` });

      // Scrape authors from each page (limit to first 3 pages for speed)
      const pagesToScrape = pages.slice(0, 3);
      for (let i = 0; i < pagesToScrape.length; i++) {
        const pageUrl = pagesToScrape[i];
        console.log(`Scraping page ${i + 1}/${pagesToScrape.length}: ${pageUrl}`);
        const pageAuthors = await scrapeAuthorsFromPage(pageUrl, 50);
        authors.push(...pageAuthors);

        // Update progress
        const progress = 30 + ((i + 1) / pagesToScrape.length) * 40;
        scrapingJobs.set(jobId, {
          ...scrapingJobs.get(jobId),
          progress: Math.round(progress),
          authorsFound: authors.length,
          message: `Scraped ${i + 1}/${pagesToScrape.length} pages, found ${authors.length} authors...`
        });

        await delay(1000); // Reduced delay for faster scraping
      }

      // If we don't have enough authors and we have the outlet website, try scraping it directly
      if (authors.length < 30 && outletWebsite) {
        console.log(`Only found ${authors.length} authors, trying direct website scrape...`);
        scrapingJobs.set(jobId, { ...scrapingJobs.get(jobId), progress: 70, message: 'Trying direct website scrape...' });

        const directAuthors = await scrapeOutletWebsite(outletWebsite, outlet, 30);
        authors.push(...directAuthors);
      }

      // Update progress
      scrapingJobs.set(jobId, { ...scrapingJobs.get(jobId), progress: 80, message: 'Deduplicating and saving...' });

      // Deduplicate
      const seen = new Set();
      authors = authors.filter(a => {
        const key = a.profileLink + a.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      console.log(`Total unique authors found: ${authors.length}`);

      // Save/update each author in MongoDB
      const ops = authors.map((author) => ({
        updateOne: {
          filter: { profileLink: author.profileLink },
          update: { $setOnInsert: { ...author, outlet, scrapedAt: new Date() } },
          upsert: true,
        },
      }));

      if (ops.length) await Author.bulkWrite(ops);

      // Update final status
      scrapingJobs.set(jobId, {
        status: 'completed',
        outlet,
        website: outletWebsite,
        authorsFound: authors.length,
        authors,
        progress: 100,
        message: authors.length >= 30 ? "Successfully scraped 30+ authors" : `Found ${authors.length} authors (target: 30)`,
        completedAt: new Date(),
        startTime: scrapingJobs.get(jobId).startTime
      });

      console.log(`✅ Scraping completed for ${outlet}: ${authors.length} authors`);

      // Clean up old job after 5 minutes
      setTimeout(() => {
        scrapingJobs.delete(jobId);
      }, 5 * 60 * 1000);
    } catch (err) {
      console.error("Error in async scraping:", err);
      scrapingJobs.set(jobId, {
        status: 'failed',
        outlet,
        error: err.message,
        progress: 0,
        authorsFound: 0,
        message: 'Scraping failed: ' + err.message,
        failedAt: new Date()
      });
    }
  })();
});

// ---------------- Get Scraping Job Status ----------------
app.get("/scrape-status/:jobId", async (req, res) => {
  const { jobId } = req.params;

  const job = scrapingJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: "Job not found or expired" });
  }

  res.json(job);
});

// ---------------- Quick Scrape (returns immediately with available data) ----------------
app.post("/scrape-authors-quick", async (req, res) => {
  const outlet = (req.body.outlet || "").toLowerCase().trim();
  if (!outlet) return res.status(400).json({ error: "Outlet name required" });

  try {
    console.log(`\n========== Quick scrape for outlet: ${outlet} ==========`);

    // Stage 0: Find outlet website
    const outletWebsite = await findOutletWebsite(outlet);
    console.log(`✓ Detected website: ${outletWebsite}`);

    let authors = [];

    // Stage 1: Find author pages using SERP API (limit to 2 pages for speed)
    const pages = await findAuthorsPages(outlet);
    console.log(`✓ Found ${pages.length} author pages from SERP API`);

    if (pages.length > 0) {
      console.log(`Author pages: ${pages.slice(0, 3).join(', ')}`);
    }

    // Scrape only first 2 pages for quick response
    const pagesToScrape = pages.slice(0, 2);
    for (const pageUrl of pagesToScrape) {
      console.log(`→ Quick scraping: ${pageUrl}`);
      const pageAuthors = await scrapeAuthorsFromPage(pageUrl, 30);
      console.log(`  Found ${pageAuthors.length} authors from this page`);
      authors.push(...pageAuthors);
      if (authors.length >= 30) {
        console.log(`✓ Reached 30 authors, stopping SERP scraping`);
        break;
      }
      await delay(1000);
    }

    console.log(`Current total: ${authors.length} authors after SERP scraping`);

    // If still not enough, try direct website scrape
    if (authors.length < 30 && outletWebsite) {
      console.log(`\n→ Only ${authors.length} authors found. Trying direct website scrape of ${outletWebsite}...`);
      const directAuthors = await scrapeOutletWebsite(outletWebsite, outlet, 30);
      console.log(`✓ Direct scrape found ${directAuthors.length} additional authors`);
      authors.push(...directAuthors);
    }

    // Deduplicate
    const seen = new Set();
    const beforeDedup = authors.length;
    authors = authors.filter(a => {
      const key = a.profileLink + a.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`After deduplication: ${authors.length} unique authors (removed ${beforeDedup - authors.length} duplicates)`);

    // Log sample of found authors
    if (authors.length > 0) {
      console.log(`\nSample of authors found:`);
      authors.slice(0, 5).forEach((a, i) => {
        console.log(`  ${i + 1}. ${a.name} - ${a.profileLink}`);
      });
    } else {
      console.log(`\n⚠️ WARNING: No authors found for ${outlet}`);
      console.log(`Troubleshooting info:`);
      console.log(`  - Website: ${outletWebsite}`);
      console.log(`  - SERP pages found: ${pages.length}`);
      console.log(`  - Check if website is blocking requests or has different HTML structure`);
    }

    // Save to database
    if (authors.length > 0) {
      const ops = authors.map((author) => ({
        updateOne: {
          filter: { profileLink: author.profileLink },
          update: { $setOnInsert: { ...author, outlet, scrapedAt: new Date() } },
          upsert: true,
        },
      }));
      await Author.bulkWrite(ops);
      console.log(`✓ Saved ${authors.length} authors to database`);
    }

    console.log(`\n========== Quick scrape completed: ${authors.length} authors ==========\n`);

    res.json({
      outlet,
      website: outletWebsite,
      authors,
      count: authors.length,
      message: authors.length >= 30 ? "Successfully scraped 30+ authors" : `Found ${authors.length} authors (target: 30)`,
      note: "Quick scrape - for complete results, use /scrape-authors"
    });
  } catch (err) {
    console.error("❌ Error in quick scrape:", err);
    res.status(500).json({ error: "Error while scraping authors: " + err.message });
  }
});

// ---------------- Get All Authors ----------------
app.get("/authors", async (req, res) => {
  try {
    const authors = await Author.find().sort({ name: 1 });
    res.json(authors);
  } catch (err) {
    console.error(" Error fetching authors:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/authorprofiles', async (req, res) => {
  try {
    const profiles = await AuthorProfile.find().sort({ scrapedAt: -1 });
    res.json(profiles);
  } catch (err) {
    console.error('Error fetching author profiles:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------- Get Single Author Profile ----------------
app.get('/authorprofile/:id', async (req, res) => {
  try {
    const profile = await AuthorProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile);
  } catch (err) {
    console.error('Error fetching author profile:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------- Get Author Profile by Name and Outlet ----------------
app.get('/authorprofile/:outlet/:name', async (req, res) => {
  try {
    const { outlet, name } = req.params;
    const profile = await AuthorProfile.findOne({
      outlet: outlet.toLowerCase(),
      name: { $regex: new RegExp(name, 'i') }
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(profile);
  } catch (err) {
    console.error('Error fetching author profile:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Removed the /enrich-profile endpoint

// ---------------- Get Topics with journalist count ----------------
app.get('/topics', async (req, res) => {
  try {
    const topicsData = await AuthorProfile.aggregate([
      { $unwind: '$topics' },
      { $match: { topics: { $in: TOPICS } } },
      {
        $group: {
          _id: '$topics',
          journalistCount: { $sum: 1 },
          topJournalists: {
            $push: {
              name: '$name',
              outlet: '$outlet',
              profileLink: '$profileLink',
              profilePic: '$profilePic',
              articleCount: '$articles'
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          name: '$_id',
          journalistCount: 1,
          topJournalists: { $slice: ['$topJournalists', 3] }
        }
      },
      { $sort: { journalistCount: -1 } }
    ]);


    res.json(topicsData);
  } catch (err) {
    console.error('Error fetching topics:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get("/outlets", async (req, res) => {
  try {
    // Get all outlets from AuthorProfile (contains enriched data)
    const outlets = await AuthorProfile.distinct("outlet");
    
    // Normalize to lowercase, deduplicate, then return in original case
    const outletMap = new Map();
    
    // First pass: collect all variations
    for (const outlet of outlets) {
      const normalized = outlet.toLowerCase().trim();
      if (!outletMap.has(normalized)) {
        outletMap.set(normalized, outlet);
      }
    }
    
    // Return unique outlets sorted alphabetically
    const uniqueOutlets = Array.from(outletMap.values()).sort();
    
    res.json(uniqueOutlets);
  } catch (err) {
    console.error("Error fetching outlets:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get recent activities
app.get("/activities", async (req, res) => {
  try {
    // Fetch latest 20 author activities (you can modify criteria)
    const authors = await AuthorProfile.find()
      .sort({ scrapedAt: -1 }) // latest first
      .limit(20);

    // Map to Activity interface
    const activities = authors.map((author) => ({
      id: author._id.toString(),
      type: "journalist",
      name: author.name,
      outlet: author.outlet,
      topic: author.topics?.[0] || "General",
      timestamp: author.scrapedAt || new Date(),
    }));

    res.json(activities);
  } catch (err) {
    console.error("Error fetching activities:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/top-journalists", async (req, res) => {
  try {
    const journalists = await JournalistModel.find()
      .sort({ influence: -1 })
      .limit(5);

    res.json(journalists);
  } catch (err) {
    console.error(" Error fetching top journalists:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------- CSV Export Endpoint ----------------
app.get("/export/csv", async (req, res) => {
  try {
    const outlet = req.query.outlet;

    // Build query
    const query = outlet ? { outlet: outlet.toLowerCase() } : {};

    // Fetch author profiles (enriched data)
    const profiles = await AuthorProfile.find(query).sort({ scrapedAt: -1 });

    if (!profiles.length) {
      return res.status(404).json({ error: "No data to export" });
    }

    // Build CSV content
    let csv = "Name,Outlet,Profile Link,Topics,Article Count,Scraped At\n";

    for (const profile of profiles) {
      const name = (profile.name || "").replace(/,/g, " ");
      const outlet = (profile.outlet || "").replace(/,/g, " ");
      const profileLink = profile.profileLink || "";
      const topics = (profile.topics || []).join("; ").replace(/,/g, " ");
      const articleCount = profile.articles || 0;
      const scrapedAt = profile.scrapedAt ? new Date(profile.scrapedAt).toISOString() : "";

      csv += `"${name}","${outlet}","${profileLink}","${topics}",${articleCount},"${scrapedAt}"\n`;
    }

    // Set headers for CSV download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="journalists_${outlet || 'all'}_${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("Error exporting CSV:", err);
    res.status(500).json({ error: "Error exporting data" });
  }
});

// ---------------- JSON Export Endpoint ----------------
app.get("/export/json", async (req, res) => {
  try {
    const outlet = req.query.outlet;

    // Build query
    const query = outlet ? { outlet: outlet.toLowerCase() } : {};

    // Fetch author profiles (enriched data)
    const profiles = await AuthorProfile.find(query).sort({ scrapedAt: -1 });

    if (!profiles.length) {
      return res.status(404).json({ error: "No data to export" });
    }

    // Format data for export
    const exportData = {
      exportDate: new Date().toISOString(),
      outlet: outlet || "all",
      count: profiles.length,
      journalists: profiles.map(p => ({
        name: p.name,
        outlet: p.outlet,
        profileLink: p.profileLink,
        profilePic: p.profilePic,
        topics: p.topics || [],
        articleCount: p.articles || 0,
        articleLinks: p.articleLinks || [],
        scrapedAt: p.scrapedAt
      }))
    };

    // Set headers for JSON download
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="journalists_${outlet || 'all'}_${Date.now()}.json"`);
    res.json(exportData);
  } catch (err) {
    console.error("Error exporting JSON:", err);
    res.status(500).json({ error: "Error exporting data" });
  }
});

// ---------------- Analytics Endpoint (NLP-based) ----------------
app.get("/analytics", async (req, res) => {
  try {
    // Import NLP analyzer
    const nlp = await import('./utils/nlpAnalyzer.js');

    // Fetch all author profiles
    const profiles = await AuthorProfile.find({});

    if (!profiles.length) {
      return res.json({
        message: "No data to analyze. Please scrape some journalists first.",
        totalJournalists: 0
      });
    }

    // Perform activity analysis
    const analysis = nlp.analyzeActivity(profiles);

    // Get top contributors per outlet
    const outletContributors = {};
    for (const [outlet, count] of Object.entries(analysis.outletDistribution)) {
      const topAuthors = await AuthorProfile.find({ outlet })
        .sort({ articles: -1, influence: -1 })
        .limit(5)
        .select('name articles influence topics');

      outletContributors[outlet] = {
        totalJournalists: count,
        topContributors: topAuthors
      };
    }

    // Extract trending keywords from all articles
    const allArticleTitles = [];
    profiles.forEach(p => {
      if (p.articleData && p.articleData.length > 0) {
        p.articleData.forEach(article => {
          if (article.title) allArticleTitles.push(article.title);
        });
      }
    });

    const keywordAnalysis = nlp.analyzeArticleTitles(allArticleTitles);

    res.json({
      ...analysis,
      topContributorsPerOutlet: outletContributors,
      trendingKeywords: keywordAnalysis.keywords.slice(0, 20),
      generatedAt: new Date()
    });
  } catch (err) {
    console.error("Error in analytics:", err);
    res.status(500).json({ error: "Error generating analytics" });
  }
});

// ---------------- Topic Distribution Visualization Data ----------------
app.get("/analytics/topics", async (req, res) => {
  try {
    const topicData = await AuthorProfile.aggregate([
      { $unwind: '$topics' },
      {
        $group: {
          _id: '$topics',
          count: { $sum: 1 },
          avgInfluence: { $avg: '$influence' },
          totalArticles: { $sum: '$articles' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 15 }
    ]);

    res.json(topicData.map(t => ({
      topic: t._id,
      journalistCount: t.count,
      avgInfluence: parseFloat((t.avgInfluence || 0).toFixed(1)),
      totalArticles: t.totalArticles
    })));
  } catch (err) {
    console.error("Error in topic analytics:", err);
    res.status(500).json({ error: "Error generating topic analytics" });
  }
});

// ---------------- Publication Frequency Distribution ----------------
app.get("/analytics/frequency", async (req, res) => {
  try {
    const frequency = await AuthorProfile.aggregate([
      {
        $group: {
          _id: '$publicationFrequency',
          count: { $sum: 1 },
          avgInfluence: { $avg: '$influence' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json(frequency.map(f => ({
      frequency: f._id || 'Unknown',
      journalistCount: f.count,
      avgInfluence: parseFloat((f.avgInfluence || 0).toFixed(1))
    })));
  } catch (err) {
    console.error("Error in frequency analytics:", err);
    res.status(500).json({ error: "Error generating frequency analytics" });
  }
});

// ---------------- Top Keywords Across All Journalists ----------------
app.get("/analytics/keywords", async (req, res) => {
  try {
    // Get all keywords from all journalists
    const allKeywords = await AuthorProfile.aggregate([
      { $unwind: '$keywords' },
      {
        $group: {
          _id: '$keywords',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 30 }
    ]);

    res.json(allKeywords.map(k => ({
      keyword: k._id,
      frequency: k.count
    })));
  } catch (err) {
    console.error("Error in keyword analytics:", err);
    res.status(500).json({ error: "Error generating keyword analytics" });
  }
});

// ---------------- Outlet Comparison ----------------
app.get("/analytics/outlets", async (req, res) => {
  try {
    const outletStats = await AuthorProfile.aggregate([
      {
        $group: {
          _id: '$outlet',
          journalistCount: { $sum: 1 },
          totalArticles: { $sum: '$articles' },
          avgInfluence: { $avg: '$influence' },
          avgArticlesPerJournalist: { $avg: '$articles' }
        }
      },
      { $sort: { journalistCount: -1 } }
    ]);

    res.json(outletStats.map(o => ({
      outlet: o._id,
      journalistCount: o.journalistCount,
      totalArticles: o.totalArticles,
      avgInfluence: parseFloat((o.avgInfluence || 0).toFixed(1)),
      avgArticlesPerJournalist: parseFloat((o.avgArticlesPerJournalist || 0).toFixed(1))
    })));
  } catch (err) {
    console.error("Error in outlet analytics:", err);
    res.status(500).json({ error: "Error generating outlet analytics" });
  }
});

// ---------------- Top Influencers (sorted by influence score) ----------------
app.get("/top-influencers", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const influencers = await AuthorProfile.find({})
      .sort({ influence: -1 })
      .limit(limit)
      .select('name outlet influence articles topics socialLinks profilePic bio');

    res.json(influencers);
  } catch (err) {
    console.error("Error fetching top influencers:", err);
    res.status(500).json({ error: "Error fetching top influencers" });
  }
});

// Removed the /enrich-all-profiles endpoint

// ---------------- Accuracy Report (for hackathon demo) ----------------
app.get("/accuracy-report", async (req, res) => {
  try {
    const profiles = await AuthorProfile.find({});

    if (!profiles.length) {
      return res.json({
        message: "No profiles to analyze",
        totalProfiles: 0,
        averageAccuracy: 0
      });
    }

    // Calculate overall statistics
    const totalProfiles = profiles.length;
    const profilesWithAccuracy = profiles.filter(p => p.accuracyScore > 0);

    const accuracyScores = profilesWithAccuracy.map(p => p.accuracyScore || 0);
    const averageAccuracy = accuracyScores.length > 0
      ? Math.round(accuracyScores.reduce((a, b) => a + b, 0) / accuracyScores.length)
      : 0;

    // Grade distribution
    const gradeDistribution = {
      'A+': profiles.filter(p => p.accuracyGrade === 'A+').length,
      'A': profiles.filter(p => p.accuracyGrade === 'A').length,
      'B': profiles.filter(p => p.accuracyGrade === 'B').length,
      'C': profiles.filter(p => p.accuracyGrade === 'C').length,
      'D': profiles.filter(p => p.accuracyGrade === 'D').length,
      'F': profiles.filter(p => !p.accuracyGrade || p.accuracyGrade === 'F').length
    };

    // Outlet-wise accuracy
    const outletAccuracy = {};
    for (const profile of profilesWithAccuracy) {
      if (!outletAccuracy[profile.outlet]) {
        outletAccuracy[profile.outlet] = {
          count: 0,
          totalAccuracy: 0,
          profiles: []
        };
      }
      outletAccuracy[profile.outlet].count++;
      outletAccuracy[profile.outlet].totalAccuracy += profile.accuracyScore;
      outletAccuracy[profile.outlet].profiles.push({
        name: profile.name,
        accuracy: profile.accuracyScore,
        grade: profile.accuracyGrade
      });
    }

    // Calculate average per outlet
    const outletStats = Object.keys(outletAccuracy).map(outlet => ({
      outlet,
      profileCount: outletAccuracy[outlet].count,
      averageAccuracy: Math.round(outletAccuracy[outlet].totalAccuracy / outletAccuracy[outlet].count),
      topProfiles: outletAccuracy[outlet].profiles
        .sort((a, b) => b.accuracy - a.accuracy)
        .slice(0, 5)
    }));

    // Top performers
    const topPerformers = profilesWithAccuracy
      .sort((a, b) => b.accuracyScore - a.accuracyScore)
      .slice(0, 10)
      .map(p => ({
        name: p.name,
        outlet: p.outlet,
        accuracy: p.accuracyScore,
        grade: p.accuracyGrade,
        articles: p.articles,
        topics: p.topics
      }));

    // Field-wise accuracy (average breakdown)
    const fieldAccuracy = {
      name: 0,
      bio: 0,
      profilePic: 0,
      articles: 0,
      topics: 0,
      section: 0
    };

    let breakdownCount = 0;
    profilesWithAccuracy.forEach(p => {
      if (p.accuracyBreakdown) {
        try {
          const extractNumber = (str) => {
            const match = str.match(/(\d+)\/(\d+)/);
            return match ? (parseInt(match[1]) / parseInt(match[2])) * 100 : 0;
          };

          if (p.accuracyBreakdown.name) fieldAccuracy.name += extractNumber(p.accuracyBreakdown.name);
          if (p.accuracyBreakdown.bio) fieldAccuracy.bio += extractNumber(p.accuracyBreakdown.bio);
          if (p.accuracyBreakdown.profilePic) fieldAccuracy.profilePic += extractNumber(p.accuracyBreakdown.profilePic);
          if (p.accuracyBreakdown.articles) fieldAccuracy.articles += extractNumber(p.accuracyBreakdown.articles);
          if (p.accuracyBreakdown.topics) fieldAccuracy.topics += extractNumber(p.accuracyBreakdown.topics);
          if (p.accuracyBreakdown.section) fieldAccuracy.section += extractNumber(p.accuracyBreakdown.section);
          breakdownCount++;
        } catch (e) {
          // Skip if breakdown parsing fails
        }
      }
    });

    if (breakdownCount > 0) {
      Object.keys(fieldAccuracy).forEach(key => {
        fieldAccuracy[key] = Math.round(fieldAccuracy[key] / breakdownCount);
      });
    }

    res.json({
      summary: {
        totalProfiles,
        profilesEvaluated: profilesWithAccuracy.length,
        averageAccuracy: `${averageAccuracy}%`,
        grade: averageAccuracy >= 90 ? 'A+' :
               averageAccuracy >= 80 ? 'A' :
               averageAccuracy >= 70 ? 'B' :
               averageAccuracy >= 60 ? 'C' : 'D'
      },
      gradeDistribution,
      fieldAccuracy,
      outletStats: outletStats.sort((a, b) => b.averageAccuracy - a.averageAccuracy),
      topPerformers,
      methodology: {
        description: "Accuracy is calculated based on 6 key metrics with weighted scoring",
        weights: {
          name: "15% - Name validation and formatting",
          bio: "10% - Bio presence and quality",
          profilePic: "10% - Profile picture validation",
          articles: "35% - Article accuracy (most critical)",
          topics: "20% - Topic identification accuracy",
          section: "10% - Section/beat identification"
        },
        validation: {
          articles: "URLs must match outlet domain + proper date/ID patterns",
          topics: "NLP-based keyword matching with article content validation",
          bio: "Length validation (50-1000 chars) + content quality checks"
        }
      },
      generatedAt: new Date()
    });
  } catch (err) {
    console.error("Error generating accuracy report:", err);
    res.status(500).json({ error: "Error generating accuracy report" });
  }
});

// ---------------- Cleanup Invalid Profiles ----------------
app.post("/cleanup-invalid-profiles", async (req, res) => {
  try {
    console.log("\n🧹 Starting cleanup of invalid profiles...\n");

    // Category/Section names to reject
    const INVALID_NAMES = [
      'travel', 'news', 'desk', 'bureau', 'team', 'editor', 'reporter',
      'international', 'national', 'sports', 'business', 'politics',
      'entertainment', 'technology', 'health', 'education', 'general',
      'lifestyle', 'opinion', 'analysis', 'cricket', 'food', 'auto',
      'world', 'india', 'fashion', 'gaming', 'music', 'movies', 'tv',
      'science', 'environment', 'climate', 'regional', 'state', 'agencies',
      'wire service', 'news desk', 'bureau chief', 'editorial', 'staff'
    ];

    function isValidJournalistName(name) {
      if (!name || typeof name !== 'string') return false;
      const trimmed = name.trim();
      if (trimmed.length < 5 || trimmed.length > 60) return false;
      const words = trimmed.split(/\s+/);
      if (words.length < 2) return false;
      const lowerName = trimmed.toLowerCase();
      if (INVALID_NAMES.includes(lowerName)) return false;
      if (!/^[A-Za-z\s\.\-\']+$/.test(trimmed)) return false;
      return true;
    }

    // Fetch all profiles
    const allProfiles = await AuthorProfile.find({});
    console.log(`📊 Found ${allProfiles.length} total profiles`);

    const toDelete = [];
    const toKeep = [];

    for (const profile of allProfiles) {
      let shouldDelete = false;
      let reason = '';

      // Check 1: Invalid name
      if (!isValidJournalistName(profile.name)) {
        shouldDelete = true;
        reason = `Invalid name: "${profile.name}"`;
      }

      // Check 2: No articles or only 1 article (suspicious)
      if (!shouldDelete && (!profile.articles || profile.articles < 2)) {
        shouldDelete = true;
        reason = `Too few articles: ${profile.articles || 0}`;
      }

      // Check 3: Generic bio (not a real journalist bio)
      if (!shouldDelete && profile.bio) {
        const genericPhrases = [
          'read all exclusive news',
          'read all latest news',
          'latest news and updates',
          'all stories written by'
        ];
        const hasGenericBio = genericPhrases.some(phrase =>
          profile.bio.toLowerCase().includes(phrase)
        );
        if (hasGenericBio && profile.articles < 3) {
          shouldDelete = true;
          reason = 'Generic bio + few articles';
        }
      }

      if (shouldDelete) {
        toDelete.push({ ...profile.toObject(), reason });
        console.log(`  ❌ Marking for deletion: ${profile.name} (${profile.outlet}) - ${reason}`);
      } else {
        toKeep.push(profile);
      }
    }

    console.log(`\n📊 Analysis Results:`);
    console.log(`   To Keep: ${toKeep.length}`);
    console.log(`   To Delete: ${toDelete.length}`);

    // Delete invalid profiles
    if (toDelete.length > 0) {
      const idsToDelete = toDelete.map(p => p._id);
      const result = await AuthorProfile.deleteMany({ _id: { $in: idsToDelete } });
      console.log(`\n✅ Deleted ${result.deletedCount} invalid profiles`);
    }

    // Also cleanup from Author collection
    const authors = await Author.find({});
    const authorIdsToDelete = [];

    for (const author of authors) {
      if (!isValidJournalistName(author.name)) {
        authorIdsToDelete.push(author._id);
        console.log(`  ❌ Deleting author: ${author.name}`);
      }
    }

    if (authorIdsToDelete.length > 0) {
      await Author.deleteMany({ _id: { $in: authorIdsToDelete } });
      console.log(`✅ Deleted ${authorIdsToDelete.length} invalid authors from Author collection`);
    }

    res.json({
      success: true,
      totalProfiles: allProfiles.length,
      kept: toKeep.length,
      deleted: toDelete.length,
      deletedAuthors: authorIdsToDelete.length,
      deletedProfiles: toDelete.map(p => ({
        name: p.name,
        outlet: p.outlet,
        reason: p.reason
      }))
    });
  } catch (err) {
    console.error("Error cleaning up profiles:", err);
    res.status(500).json({ error: "Error cleaning up profiles: " + err.message });
  }
});

// ---------------- Test route ----------------
app.get("/", (req, res) => res.send("Server running on port " + PORT));

// ---------------- Start server ----------------
app.listen(PORT, () =>
  console.log("Server running on http://localhost:" + PORT)
);
