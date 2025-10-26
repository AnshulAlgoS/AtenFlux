import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import puppeteer from "puppeteer";
import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";
import Author from "../models/Author.js";

dotenv.config();
const SERP_API_KEY = process.env.SERP_API_KEY;

puppeteerExtra.use(StealthPlugin());

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const AuthorProfileSchema = new mongoose.Schema({
  name: String,
  outlet: String,
  profileLink: String,
  profilePic: String,
  topics: [String],
  articles: Number,
  articleLinks: [String],
  scrapedAt: { type: Date, default: Date.now },
});

const AuthorProfile =
  mongoose.models.AuthorProfile ||
  mongoose.model("AuthorProfile", AuthorProfileSchema);

async function findAuthorPages(authorName, outlet, limit = 3) {
  try {
    const res = await axios.get("https://serpapi.com/search.json", {
      params: {
        engine: "google",
        q: `${authorName} ${outlet} author OR journalist OR profile`,
        api_key: SERP_API_KEY,
        num: limit,
      },
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const results = res.data.organic_results || [];
    const pages = results
      .map((r) => r.link)
      .filter((link) => link && /author|profile|writer|journalist|team/i.test(link));

    return [...new Set(pages)].slice(0, limit);
  } catch (err) {
    console.error("SerpAPI error:", err.message);
    return [];
  }
}

export async function scrapeAuthorDetails(url, outlet) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/116.0.0.0 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(2000);

    const authorProfile = await page.evaluate(() => {
      const nameSelectors = [
        "meta[name='author']",
        "meta[property='article:author']",
        ".author-name",
        ".author-heading",
        "h1, h2, h3",
      ];

      let name = null;
      for (const sel of nameSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          name = el.getAttribute("content") || el.textContent;
          if (name) {
            name = name.trim();
            break;
          }
        }
      }

      const articleLinks = Array.from(document.querySelectorAll("a"))
        .map((a) => a.href)
        .filter((h) => h && !h.includes("javascript") && !h.includes("facebook") && !h.includes("twitter") && !h.includes("instagram"));

      const topics = Array.from(document.querySelectorAll("a, span, div"))
        .map((el) => el.textContent.trim())
        .filter((t) => t && t.length < 30);

      return {
        name,
        articleLinks: [...new Set(articleLinks)],
        articles: articleLinks.length,
        topics: [...new Set(topics)],
      };
    });

    await browser.close();

    if (!authorProfile.name) return null;

    return {
      name: authorProfile.name,
      outlet,
      profileLink: url,
      profilePic: null,
      topics: authorProfile.topics,
      articles: authorProfile.articles,
      articleLinks: authorProfile.articleLinks,
      scrapedAt: new Date(),
    };
  } catch (err) {
    await browser.close();
    console.error("Error scraping author details:", err.message);
    return null;
  }
}

export async function enrichProfilesFromAuthors(limitProfiles = 5) {
  try {
    const authorsDB = await Author.aggregate([{ $sample: { size: 8 } }]);
    if (!authorsDB.length) return [];

    const profiles = [];
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    for (const author of authorsDB) {
      const pages = await findAuthorPages(author.name, author.outlet, 3);

      for (const pageUrl of pages) {
        if (profiles.length >= limitProfiles) break;

        const profile = await scrapeAuthorDetails(pageUrl, author.outlet);
        if (!profile) continue;

        await AuthorProfile.findOneAndUpdate(
          { name: profile.name, outlet: profile.outlet },
          { $setOnInsert: profile },
          { upsert: true }
        );

        profiles.push(profile);
        await delay(1000);
      }

      if (profiles.length >= limitProfiles) break;
    }

    await browser.close();

    console.log(`Enriched ${profiles.length} author profiles.`);
    return profiles;
  } catch (err) {
    console.error("Error in enrichProfilesFromAuthors:", err);
    return [];
  }
}
