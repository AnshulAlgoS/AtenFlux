import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import puppeteer from "puppeteer";
import axios from "axios";
import { enrichProfilesFromAuthors } from "./scrapers/enrichAuthors.js";
import AuthorProfile from './models/AuthorProfile.js';
import { JournalistModel } from './models/Journalist.js';



dotenv.config();

const app = express();
const PORT = process.env.PORT || 5002;
const MONGO_URI = process.env.MONGO_URI;
const SERP_API_KEY = process.env.SERP_API_KEY;

const allowedOrigins = [
  "http://localhost:8080",     
  "https://aten.vercel.app"   
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

// ---------------- MongoDB setup ----------------
mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("MongoDB connected");

    // ---------------- Call profile enrichment on server start ----------------
    try {
      console.log("Enriching author profiles from existing authors...");

      // Dynamically import the profile enrichment function
      const { enrichProfilesFromAuthors } = await import("./scrapers/enrichAuthors.js");

      // Run the enrichment
      const profiles = await enrichProfilesFromAuthors();
      console.log(`Finished enriching ${profiles.length} author profiles`);
    } catch (err) {
      console.error("Error enriching profiles:", err);
    }
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

// ---------------- Find multiple author pages dynamically ----------------
async function findAuthorsPages(outlet, maxPages = 5) {
  try {
    const res = await axios.get("https://serpapi.com/search.json", {
      params: {
        engine: "google",
        q: `${outlet} authors OR journalists OR team`,
        api_key: SERP_API_KEY,
        num: maxPages,
      },
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const results = res.data.organic_results || [];
    const pages = [];
    for (const r of results) {
      if (r.link && /author|profile|writer|journalist|team/i.test(r.link)) {
        pages.push(r.link);
      }
    }
    return [...new Set(pages)]; // remove duplicates
  } catch (err) {
    console.error("SerpAPI error:", err.message);
    return [];
  }
}

// ---------------- Puppeteer scraper ----------------
async function scrapeAuthorsFromPage(url, limit = 50) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/116.0.0.0 Safari/537.36"
    );
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await new Promise(resolve => setTimeout(resolve, 2000));


    const authors = await page.evaluate((limit) => {
      const list = [];
      const seen = new Set();
      const CANDIDATES = [
        "a[rel='author']",
        "meta[name='author']",
        "meta[property='article:author']",
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
        ".author-name a",
        ".author a",
        ".contributor a",
      ];
      // Collect text/href pairs from all matching elements
      const anchors = [];
      for (const selector of CANDIDATES) {
        document.querySelectorAll(selector).forEach((a) => anchors.push(a));
      }

      for (const a of anchors) {
        const href = (a.getAttribute("href") || "").trim();
        let name = (a.textContent || "").trim();

        if (!href || !name) continue;

        // Skip javascript links, fragments, or social sites
        if (
          href.startsWith("javascript:") ||
          href.startsWith("#") ||
          /facebook|twitter|instagram|linkedin|mailto/i.test(href)
        )
          continue;

        // Resolve relative URLs
        const absHref = href.startsWith("http")
          ? href
          : new URL(href, window.location.origin).href;

        // Basic name sanity checks
        const invalidName = /(Breaking|News|Desk|Updated|Reporter|Bureau|Team|India|Edition|Home|Page|Section|View|Follow|http|www|\d|@|\.com)/i;
        if (!/^[A-Za-z\s\.\-]+$/.test(name)) continue;

        if (invalidName.test(name)) continue;
        if (name.length < 3 || name.length > 40) continue;
        if (name.split(" ").length > 5) continue;

        // Context sanity: avoid nav/footer/comments
        const path = a.closest("header, footer, nav, aside, .comment, .related");
        if (path) continue;

        // Deduplicate and push
        const key = absHref + name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        list.push({ name, profileLink: absHref });
        if (list.length >= limit) break;
      }

      return list;
    }, limit);

    await browser.close();
    return authors;
  } catch (err) {
    await browser.close();
    console.error(" Puppeteer scrape error:", err.message);
    return [];
  }
}

// ---------------- Scrape & Save Authors (only) ----------------
app.post("/scrape-authors", async (req, res) => {
  const outlet = (req.body.outlet || "").toLowerCase().trim();
  if (!outlet) return res.status(400).json({ error: "Outlet name required" });

  try {
    // Find author pages
    const pages = await findAuthorsPages(outlet);
    let authors = [];

    // Scrape authors from each page
    for (const pageUrl of pages) {
      const pageAuthors = await scrapeAuthorsFromPage(pageUrl, 50);
      authors.push(...pageAuthors);
    }

    // Deduplicate
    const seen = new Set();
    authors = authors.filter(a => {
      const key = a.profileLink + a.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    //  Save/update each author in MongoDB
    const ops = authors.map((author) => ({
      updateOne: {
        filter: { profileLink: author.profileLink },
        update: { $setOnInsert: { ...author, outlet, scrapedAt: new Date() } },
        upsert: true,
      },
    }));

    if (ops.length) await Author.bulkWrite(ops);

    res.json({ authors });
  } catch (err) {
    console.error("Error in /scrape-authors:", err);
    res.status(500).json({ error: "Error while scraping authors" });
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
    const outlets = await Author.distinct("outlet");
    res.json(outlets);
  } catch (err) {
    console.error(" Error fetching outlets:", err);
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


// ---------------- Test route ----------------
app.get("/", (req, res) => res.send("Server running on port " + PORT));

// ---------------- Start server ----------------
app.listen(PORT, () =>
  console.log("Server running on http://localhost:" + PORT)
);
