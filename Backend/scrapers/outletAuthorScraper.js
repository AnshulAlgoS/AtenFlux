import puppeteer from "puppeteer";
import dotenv from "dotenv";
import axios from "axios";
import { analyzeArticleTitles, categorizeTopics, extractKeywords, calculateInfluence } from "../utils/nlpAnalyzer.js";

dotenv.config();

const SERP_API_KEY = process.env.SERP_API_KEY;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeAuthorName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[^\w\s\u0900-\u097F\u0980-\u09FF\u0A80-\u0AFF\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0D7F]/g, '') // Remove special chars except Unicode
    .replace(/\s+/g, ' ')
    .trim();
}

function areNamesSimilar(name1, name2) {
  const norm1 = normalizeAuthorName(name1);
  const norm2 = normalizeAuthorName(name2);
  
  if (norm1 === norm2) return true;
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const shorter = norm1.length < norm2.length ? norm1 : norm2;
    const longer = norm1.length >= norm2.length ? norm1 : norm2;
    if (shorter.length >= longer.length * 0.7) {
      return true;
    }
  }
  
  return false;
}

function authorExists(newAuthor, existingMap) {
  if (!newAuthor || !newAuthor.name) return false;
  const newName = normalizeAuthorName(newAuthor.name);
  for (const [key, existing] of existingMap.entries()) {
    if (areNamesSimilar(newAuthor.name, existing.name)) {
      return true;
    }
  }
  return false;
}

const OUTLET_OVERRIDES = [
  {
    url: 'https://www.dinamalar.com',
    keywords: ['dinamalar', 'dina malar'],
  },
  {
    url: 'https://www.manoramaonline.com',
    keywords: ['malayala manorama', 'malayalam manorama', 'manoramaonline', 'manorama online', 'manorama'],
  }
];
export async function scrapeOutletIntelligent(outletName, maxAuthors = 35) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`INTELLIGENT UNIVERSAL SCRAPER`);
  console.log(`Outlet: ${outletName}`);
  console.log(`Target: ${maxAuthors} authors minimum`);
  console.log(`${'='.repeat(80)}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-extensions'
    ],
    defaultViewport: { width: 1920, height: 1080 },
    protocolTimeout: 600000,
    timeout: 600000,
    ignoreHTTPSErrors: true,
  });

  try {
    const website = await detectOutletWebsite(outletName, browser);
    if (!website) {
      throw new Error(`Could not detect website for outlet: ${outletName}`);
    }

    console.log(`Detected website: ${website}\n`);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`PHASE 1: COLLECTING ARTICLES (Target: ${maxAuthors * 15} for ${maxAuthors} authors)`);
    console.log('='.repeat(80));

    const allArticles = await collectArticlesFromWebsite(website, browser, maxAuthors * 15); // Collect ~15 articles per author needed
    console.log(`\nCollected ${allArticles.length} articles`);

    console.log(`\n${'='.repeat(80)}`);
    console.log(` PHASE 2: EXTRACTING UNIQUE AUTHORS FROM ARTICLES`);
    console.log('='.repeat(80));

    let authors = await extractAuthorsFromArticles(allArticles, website, browser, maxAuthors);

    authors = authors.filter(author => isValidJournalistName(author.name));

    const seen = new Map();
    const uniqueAuthors = [];

    for (const author of authors) {
      const normKey = normalizeAuthorName(author.name);

      if (seen.has(normKey)) continue;

      let isDuplicate = false;
      for (const [existingKey, existingAuthor] of seen.entries()) {
        if (areNamesSimilar(author.name, existingAuthor.name)) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        seen.set(normKey, author);
        uniqueAuthors.push(author);
      }
    }

    authors = uniqueAuthors;

    if (authors.length === 0) {
      console.log(`\n No valid authors discovered for ${outletName}`);
      await browser.close();
      return { error: 'No valid authors found', outlet: outletName, website };
    }

    if (authors.length > maxAuthors) {
      console.log(`\n Found ${authors.length} authors, limiting to ${maxAuthors} as requested`);
      authors = authors.slice(0, maxAuthors);
    }

    console.log(`\n Found ${authors.length} valid unique journalists after validation`);

    if (authors.length < maxAuthors && authors.length < 40) {
      console.log(`\n⚠️  Only found ${authors.length} authors (target: ${maxAuthors}). Trying additional discovery...`);
      
      try {
        const page = await browser.newPage();
        await page.setUserAgent(getRandomUserAgent());
        page.setDefaultTimeout(15000);
        page.setDefaultNavigationTimeout(15000);
        
        await page.goto(website, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await delay(1000);

        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
          await delay(300);
        }
        
        const moreArticleUrls = await extractArticleUrlsFromPage(page, website);
        const additionalArticles = moreArticleUrls.slice(0, 100).map(url => ({ url, page: 'homepage-fallback' }));
        
        if (additionalArticles.length > 0) {
          console.log(`  Found ${additionalArticles.length} additional articles from homepage`);
          const additionalAuthors = await extractAuthorsFromArticles(additionalArticles, website, browser, maxAuthors - authors.length);
          const existingNames = new Set(authors.map(a => normalizeAuthorName(a.name)));
          for (const author of additionalAuthors) {
            if (isValidJournalistName(author.name) && !existingNames.has(normalizeAuthorName(author.name))) {
              let isDuplicate = false;
              for (const existing of authors) {
                if (areNamesSimilar(author.name, existing.name)) {
                  isDuplicate = true;
                  break;
                }
              }
              if (!isDuplicate) {
                authors.push(author);
                existingNames.add(normalizeAuthorName(author.name));
              }
            }
          }
          console.log(`  After fallback: Found ${authors.length} total authors`);
        }
        
        await page.close();
      } catch (fallbackErr) {
        console.log(`  ⚠️  Fallback discovery failed: ${fallbackErr.message}`);
      }
    }

    console.log(`\n\n${'='.repeat(80)}`);
    console.log(`PHASE 3: EXTRACTING PROFILES FOR ${authors.length} AUTHORS`);
    console.log('='.repeat(80));

    const results = [];
    const PARALLEL_LIMIT = 10;

    for (let i = 0; i < authors.length; i += PARALLEL_LIMIT) {
      const batch = authors.slice(i, Math.min(i + PARALLEL_LIMIT, authors.length));

      const batchPromises = batch.map(async (author, batchIdx) => {
        const authorNum = i + batchIdx + 1;
        try {
        const data = await extractAuthorData(author, outletName, browser, website);
        if (data) {
            console.log(`  [${authorNum}/${authors.length}] ✅ ${author.name} - ${data.totalArticles || 0} articles`);
          return data;
          }
          return null;
        } catch (err) {
          console.log(`  [${authorNum}/${authors.length}] ⚠️  ${author.name} - Error`);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(r => r !== null));
    }

    await browser.close();

    console.log(`\n\n${'='.repeat(80)}`);
    console.log(`SCRAPING COMPLETE`);
    console.log('='.repeat(80));
    console.log(`Outlet: ${outletName}`);
    console.log(`Website: ${website}`);
    console.log(`Authors Extracted: ${results.length}/${authors.length}`);
    console.log(`Total Articles: ${results.reduce((sum, r) => sum + r.totalArticles, 0)}`);
    console.log('='.repeat(80));

    return {
      outlet: outletName,
      website: website,
      authorsCount: results.length,
      authors: results
    };

  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}`);
    await browser.close();
    return { error: err.message, outlet: outletName };
  }
}

// ============================================================
// AUTO-DETECT OUTLET WEBSITE
// ============================================================

async function detectOutletWebsite(outletName, browser) {
  console.log(`\nDetecting website for: ${outletName}...`);
  
  const normalizedOutlet = outletName.toLowerCase();
  const override = OUTLET_OVERRIDES.find(entry => 
    entry.keywords.some(keyword => normalizedOutlet.includes(keyword))
  );
  if (override) {
    console.log(`   ✓ Using preset website for ${outletName}: ${override.url}`);
    return override.url;
  }
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  try {
    console.log(`   Strategy 1: Searching DuckDuckGo...`);
    
    try {
      await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(outletName + ' news india official website')}`, {
        waitUntil: 'networkidle2',
        timeout: 12000
      });
      await delay(1500);

      const ddgWebsite = await page.evaluate(() => {
        const results = document.querySelectorAll('a[data-testid="result-title-a"], article a, .result__a');
        
        for (const link of results) {
          const href = link.href;
          
          if (!href || href.includes('duckduckgo.com')) continue;
          
          try {
            const url = new URL(href);
            const baseUrl = `${url.protocol}//${url.hostname}`;
            
            // Must look like a news website
            if (url.hostname.includes('.') && 
                !url.hostname.includes('wikipedia') &&
                !url.hostname.includes('facebook') &&
                !url.hostname.includes('twitter') &&
                !url.hostname.includes('youtube')) {
              return baseUrl;
            }
          } catch (e) {}
        }
        
        return null;
      });

      if (ddgWebsite) {
        console.log(`  Found via DuckDuckGo: ${ddgWebsite}`);
        await page.close();
        return ddgWebsite;
      }
    } catch (err) {
      console.log(`  ⚠️  DuckDuckGo search failed: ${err.message}`);
    }

    // Strategy 2: Try Google Search
    console.log(`  Strategy 2: Searching Google...`);
    
    try {
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(outletName + ' news india official website')}`, {
        waitUntil: 'networkidle2',
        timeout: 12000
      });
      await delay(1500);

      const googleWebsite = await page.evaluate(() => {
        const selectors = [
          'div.yuRUbf > a',
          'div.yuRUbf > div > a',
          'a[href^="http"]'
        ];
        
        for (const selector of selectors) {
          const links = document.querySelectorAll(selector);
          
          for (const link of links) {
            const href = link.href;
            
            if (!href) continue;
            if (href.includes('google.com')) continue;
            if (href.includes('youtube.com')) continue;
            if (href.includes('wikipedia')) continue;
            if (href.includes('/search?')) continue;
            if (href.includes('/url?')) continue;
            
            if (!href.startsWith('http')) continue;
            
            try {
              const url = new URL(href);
              const baseUrl = `${url.protocol}//${url.hostname}`;
              
              if (url.hostname.includes('.') && 
                  (url.hostname.includes('.com') || url.hostname.includes('.in') || 
                   url.hostname.includes('.net') || url.hostname.includes('.org'))) {
                return baseUrl;
              }
            } catch (e) {}
          }
        }
        
        return null;
      });

      if (googleWebsite) {
        console.log(`  Found via Google: ${googleWebsite}`);
        await page.close();
        return googleWebsite;
      }
    } catch (err) {
      console.log(`  Google search failed: ${err.message}`);
    }

    // Strategy 3: Try Bing Search
    console.log(`  Strategy 3: Searching Bing...`);
    
    try {
      await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(outletName + ' news india official')}`, {
        waitUntil: 'networkidle2',
        timeout: 12000
      });
      await delay(1000);

      const bingWebsite = await page.evaluate(() => {
        const links = document.querySelectorAll('li.b_algo a, h2 a');
        
        for (const link of links) {
          const href = link.href;
          
          if (!href || href.includes('bing.com') || href.includes('microsoft')) continue;
          
          try {
            const url = new URL(href);
            const baseUrl = `${url.protocol}//${url.hostname}`;
            
            if (url.hostname.includes('.') && !url.hostname.includes('wikipedia')) {
              return baseUrl;
            }
          } catch (e) {}
        }
        
        return null;
      });

      if (bingWebsite) {
        console.log(`  Found via Bing: ${bingWebsite}`);
        await page.close();
        return bingWebsite;
      }
    } catch (err) {
      console.log(`   Bing search failed: ${err.message}`);
    }

    // Strategy 4: Smart URL construction
    console.log(`  Strategy 4: Trying smart URL construction...`);
    
    const normalizedName = outletName.toLowerCase()
      .replace(/^the\s+/i, '')
      .replace(/\s+/g, '')
      .trim();
    
    const possibleUrls = [
      `https://www.${normalizedName}.com`,
      `https://www.${normalizedName}.in`,
      `https://${normalizedName}.com`,
      `https://${normalizedName}.in`,
      `https://www.${normalizedName}online.com`,
      `https://www.${normalizedName}online.in`,
    ];

    for (const testUrl of possibleUrls) {
      try {
        console.log(`    Testing: ${testUrl}`);
        const response = await page.goto(testUrl, { 
          waitUntil: 'domcontentloaded', 
          timeout: 8000 
        });
        
        if (response && response.ok() && response.status() === 200) {
          // Check if it looks like a news website
          const isNews = await page.evaluate(() => {
            const bodyText = document.body.innerText.toLowerCase();
            const hasNewsKeywords = bodyText.includes('news') || 
                                   bodyText.includes('article') ||
                                   bodyText.includes('latest') ||
                                   bodyText.includes('story');
            const hasNavigation = document.querySelectorAll('nav, header').length > 0;
            
            return hasNewsKeywords && hasNavigation;
          });
          
          if (isNews) {
            console.log(` Found via URL construction: ${testUrl}`);
            await page.close();
            return testUrl;
          }
        }
      } catch (err) {
        // This URL didn't work, try next
        continue;
      }
    }

    console.log(`  Could not detect website for "${outletName}"`);
    await page.close();
    return null;

  } catch (err) {
    console.error(` Error: ${err.message}`);
    await page.close();
    return null;
  }
}

// ============================================================
// COLLECT ARTICLES FROM WEBSITE (200-400 articles)
// ============================================================

// Rotating user agents for better stealth
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ============================================================
// COLLECT ARTICLES FROM RSS FEEDS
// ============================================================

async function collectFromRSS(website, browser, limit) {
  const articles = [];
  const page = await browser.newPage();
  await page.setUserAgent(getRandomUserAgent());
  
  const rssPaths = [
    '/rss', '/rss.xml', '/feed', '/feed.xml', '/feeds/rss', 
    '/rssfeeds', '/?feed=rss', '/index.xml', '/feeds/news.xml',
    '/news/rss', '/articles/rss', '/feed/rss'
  ];
  
  for (const path of rssPaths) {
    if (articles.length >= limit) break;
    
    try {
      const rssUrl = website + path;
      await page.goto(rssUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(1000);
      
      const isRSS = await page.evaluate(() => {
        const text = document.body.textContent;
        return text.includes('<rss') || text.includes('<feed') || text.includes('<?xml');
      });
      
      if (!isRSS) continue;
      
      const articleUrls = await page.evaluate(() => {
        const urls = [];
        // Try multiple RSS formats
        const links = document.querySelectorAll('link, guid, item link, entry link');
        for (const link of links) {
          const url = link.textContent?.trim() || link.getAttribute('href') || link.href;
          if (url && url.startsWith('http') && url.length > 20) {
            urls.push(url);
          }
        }
        return urls.slice(0, 100);
      });
      
      for (const url of articleUrls) {
        if (articles.length >= limit) break;
        articles.push({ url, page: 'rss' });
      }
      
      if (articles.length > 0) break; 
      
    } catch (e) {
      continue;
    }
  }
  
  await page.close();
  return articles;
}

// ============================================================
// COLLECT ARTICLES FROM SITEMAP
// ============================================================

async function collectFromSitemap(website, browser, limit) {
  const articles = [];
  const page = await browser.newPage();
  await page.setUserAgent(getRandomUserAgent());
  
  const sitemapPaths = [
    '/sitemap.xml', '/sitemap_index.xml', '/sitemap-news.xml',
    '/sitemap-articles.xml', '/sitemap/posts.xml'
  ];
  
  for (const path of sitemapPaths) {
    if (articles.length >= limit) break;
    
    try {
      const sitemapUrl = website + path;
      await page.goto(sitemapUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await delay(1000);
      
      const articleUrls = await page.evaluate(() => {
        const urls = [];
        // Sitemap XML format
        const locs = document.querySelectorAll('loc, url loc');
        for (const loc of locs) {
          const url = loc.textContent?.trim();
          if (url && url.startsWith('http') && url.length > 20 && 
              !url.includes('/author/') && !url.includes('/tag/')) {
            urls.push(url);
          }
        }
        return urls.slice(0, 150);
      });
      
      for (const url of articleUrls) {
        if (articles.length >= limit) break;
        articles.push({ url, page: 'sitemap' });
      }
      
      if (articles.length > 0) break;
      
    } catch (e) {
      continue;
    }
    }

    await page.close();
  return articles;
}

// ============================================================
// COLLECT ARTICLES FROM SERP API (BYPASSES BLOCKING)
// ============================================================

async function collectFromSERPAPI(website, limit) {
  const articles = [];
  
  if (!SERP_API_KEY) {
    console.log(`    ⚠️  SERP_API_KEY not found, skipping SERP API search`);
    return articles;
  }
  
  try {
    const hostname = new URL(website).hostname;
    const queries = [
      `site:${hostname} news`,
      `site:${hostname} article`,
      `site:${hostname} latest news`,
      `site:${hostname} breaking news`
    ];
    
    for (const query of queries) {
      if (articles.length >= limit) break;
      
      try {
        const response = await axios.get("https://serpapi.com/search.json", {
          params: {
            engine: "google",
            q: query,
            api_key: SERP_API_KEY,
            num: 100, // Get up to 100 results per query
            gl: "in", // India
            hl: "en"
          },
          timeout: 15000
        });
        
        const results = response.data.organic_results || [];
        
        for (const result of results) {
          if (articles.length >= limit) break;
          
          if (result.link && 
              result.link.includes(hostname) &&
              result.link.length > 20 &&
              !result.link.includes('/author/') &&
              !result.link.includes('/tag/') &&
              !result.link.includes('/category/')) {
            
            articles.push({
              url: result.link,
              page: 'serp-api',
              title: result.title || null
            });
          }
        }
        
        console.log(`    ✓ SERP API: Found ${results.length} results for "${query}"`);

  } catch (err) {
        console.log(`    ⚠️  SERP API query failed for "${query}": ${err.message}`);
        continue;
      }
    }
    
    console.log(`    ✓ SERP API: Collected ${articles.length} total articles`);
    
  } catch (e) {
    console.log(`    ⚠️  SERP API collection failed: ${e.message}`);
  }
  
  return articles;
}

// ============================================================
// COLLECT ARTICLES FROM SEARCH ENGINES (FALLBACK)
// ============================================================

async function collectFromSearchEngines(website, browser, limit) {
  const articles = [];
  const hostname = new URL(website).hostname;
  const page = await browser.newPage();
  await page.setUserAgent(getRandomUserAgent());
  
  try {
    // Try DuckDuckGo first (less blocking)
    const query = `site:${hostname} news article`;
    await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, {
      waitUntil: 'networkidle2',
      timeout: 15000
    });
    await delay(2000);
    
    const ddgArticles = await page.evaluate((baseUrl) => {
      const articles = [];
      const links = document.querySelectorAll('a[data-testid="result-title-a"], .result__a, article a');
      const baseUrlObj = new URL(baseUrl);
      
      for (const link of links) {
        const href = link.href;
        if (!href || href.includes('duckduckgo.com')) continue;
        
        try {
          const url = new URL(href);
          if (url.hostname === baseUrlObj.hostname && 
              url.pathname.length > 15 &&
              !url.pathname.includes('/author/')) {
            articles.push(href);
            if (articles.length >= 50) break;
          }
        } catch (e) {}
      }
      
      return articles;
    }, website);
    
    for (const url of ddgArticles) {
      if (articles.length >= limit) break;
      articles.push({ url, page: 'search' });
    }
    
  } catch (e) {
    console.log(`    ⚠️  Search engine fallback failed: ${e.message}`);
  } finally {
    try {
      await page.close();
    } catch (e) {}
  }
  
  return articles;
}

async function collectArticlesFromWebsite(website, browser, targetCount = 300) {
  const allArticles = [];
  const seenUrls = new Set();
  
  // Enhanced stealth setup
  const page = await browser.newPage();
  const userAgent = getRandomUserAgent();
  await page.setUserAgent(userAgent);
  
  // Set extra headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8,ta;q=0.75,ml;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0'
  });
  
  page.setDefaultTimeout(25000);
  page.setDefaultNavigationTimeout(25000);
  
  // Enhanced stealth - always apply
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'hi', 'bn', 'gu', 'ta', 'ml'] });
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });

  try {
    console.log(`\n📡 Strategy 1: Checking RSS feeds...`);
    const rssArticles = await collectFromRSS(website, browser, targetCount);
    for (const article of rssArticles) {
      if (!seenUrls.has(article.url) && allArticles.length < targetCount) {
        seenUrls.add(article.url);
        allArticles.push(article);
      }
    }
    console.log(`  ✓ Collected ${rssArticles.length} articles from RSS (Total: ${allArticles.length}/${targetCount})`);
    
    // Strategy 2: SERP API (bypasses blocking)
    if (allArticles.length < targetCount) {
      console.log(`\n🔍 Strategy 2: Using SERP API to bypass blocking...`);
      const serpArticles = await collectFromSERPAPI(website, targetCount - allArticles.length);
      for (const article of serpArticles) {
        if (!seenUrls.has(article.url) && allArticles.length < targetCount) {
          seenUrls.add(article.url);
          allArticles.push(article);
        }
      }
      console.log(`  ✓ Collected ${serpArticles.length} articles from SERP API (Total: ${allArticles.length}/${targetCount})`);
    }
    
    // Strategy 3: Sitemap
    if (allArticles.length < targetCount) {
      console.log(`\n🗺️  Strategy 3: Checking sitemap...`);
      const sitemapArticles = await collectFromSitemap(website, browser, targetCount - allArticles.length);
      for (const article of sitemapArticles) {
        if (!seenUrls.has(article.url) && allArticles.length < targetCount) {
          seenUrls.add(article.url);
          allArticles.push(article);
        }
      }
      console.log(`  ✓ Collected ${sitemapArticles.length} articles from sitemap (Total: ${allArticles.length}/${targetCount})`);
    }
    
    // Strategy 4: Section pages
    if (allArticles.length < targetCount) {
      console.log(`\n📰 Strategy 4: Discovering section pages...`);
      const sections = await discoverSectionPages(website, page);
      console.log(`  ✓ Found ${sections.length} sections`);
      
      let pagesToScrape = [website, ...sections];
      try {
        const host = new URL(website).hostname.toLowerCase();
        if (host.includes('pinkvilla')) {
          const expanded = [];
          for (const s of pagesToScrape) {
            expanded.push(s);
            for (let p = 2; p <= 8; p++) {
              expanded.push(`${s}/page/${p}`);
            }
          }
          pagesToScrape = expanded;
        }
      } catch {}
      pagesToScrape = pagesToScrape.slice(0, 25);

      // LOOP START - Create a new page for each iteration to avoid detached frame errors
      for (let i = 0; i < pagesToScrape.length && allArticles.length < targetCount; i++) {
        const pageUrl = pagesToScrape[i];
        const isHomepage = pageUrl === website;
        const pageName = isHomepage ? 'homepage' : pageUrl.split('/').pop() || 'section';
        
        console.log(`  [${i + 1}/${pagesToScrape.length}] Collecting from: ${pageName}`);
        
        // Create a new page for each iteration to avoid detached frame errors
        const sectionPage = await browser.newPage();
        await sectionPage.setUserAgent(getRandomUserAgent());
        await sectionPage.setExtraHTTPHeaders({
          'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8,ta;q=0.75,ml;q=0.7',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Referer': website
        });
        sectionPage.setDefaultTimeout(20000);
        sectionPage.setDefaultNavigationTimeout(20000);
        
        try {
          await delay(500 + Math.random() * 1000);
          
          await Promise.race([
            sectionPage.goto(pageUrl, { 
              waitUntil: 'domcontentloaded', 
              timeout: 20000 
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
          ]).catch(() => {});
          
          await delay(1000 + Math.random() * 500);
          
          const isBlocked = await sectionPage.evaluate(() => {
            const bodyText = document.body?.innerText?.toLowerCase() || '';
            const title = document.title?.toLowerCase() || '';
            return bodyText.includes('access denied') || 
                   bodyText.includes('blocked') || 
                   bodyText.includes('captcha') ||
                   bodyText.includes('cloudflare') ||
                   bodyText.includes('checking your browser') ||
                   title.includes('access denied') ||
                   document.querySelector('iframe[src*="challenges"]') !== null ||
                   document.querySelector('form[action*="challenge"]') !== null;
          }).catch(() => false);
          
          if (isBlocked) {
            console.log(`    ⚠️  Page blocked, trying SERP API fallback...`);
            
            // Try SERP API first if available
            if (SERP_API_KEY && allArticles.length < targetCount) {
              try {
                const hostname = new URL(website).hostname;
                const sectionName = pageName === 'homepage' ? '' : pageName;
                const query = sectionName 
                  ? `site:${hostname} ${sectionName} news article`
                  : `site:${hostname} news article`;
                
                const serpArticles = await collectFromSERPAPI(website, Math.min(50, targetCount - allArticles.length));
                for (const article of serpArticles) {
                  if (!seenUrls.has(article.url) && allArticles.length < targetCount) {
                    seenUrls.add(article.url);
                    allArticles.push(article);
                  }
                }
                console.log(`    ✓ Collected ${serpArticles.length} articles via SERP API (Total: ${allArticles.length}/${targetCount})`);
              } catch (serpErr) {
                console.log(`    ⚠️  SERP API fallback failed: ${serpErr.message}`);
              }
            }
            
            // Close section page before continuing
            try {
              await sectionPage.close();
            } catch (e) {}
          continue;
        }
        
          for (let j = 0; j < 5; j++) {
            await sectionPage.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
            await delay(300);
          }
          await delay(800);
          
          const articleUrls = await extractArticleUrlsFromPage(sectionPage, website);
          
          for (const url of articleUrls) {
            if (!seenUrls.has(url) && allArticles.length < targetCount) {
              seenUrls.add(url);
              allArticles.push({ url, page: pageName });
            }
          }
          
          console.log(`    ✓ Collected ${articleUrls.length} articles (Total: ${allArticles.length}/${targetCount})`);
        
        } catch (err) {
          console.log(`    ⚠️  Failed to collect from ${pageName}: ${err.message}`);
        } finally {
          // Always close the section page to avoid detached frame errors
          try {
            await sectionPage.close();
    } catch (e) {
            // Ignore errors when closing
          }
        }
      } // LOOP END
    }

    // Don't close the main page here - individual section pages are already closed
    return allArticles;

  } catch (err) {
    console.error(`  ❌ Error collecting articles: ${err.message}`);
    return allArticles;
  } finally {
    // Close the main page if it exists and is not closed
    try {
      if (page && !page.isClosed()) {
        await page.close();
      }
    } catch (e) {
      // Ignore errors
    }
  }
}

// ============================================================
// HELPER: Extract article URLs from a page
// ============================================================


// ============================================================
// HELPER: Extract article URLs from a page
// ============================================================

async function extractArticleUrlsFromPage(page, website) {
  return await page.evaluate((baseUrl) => {
    const urls = new Set();
    const links = document.querySelectorAll('a[href]');
    const baseUrlObj = new URL(baseUrl);
    
    for (const link of links) {
      const href = link.href;
      if (!href || href === '#') continue;
      
      // Skip navigation/footer
      if (link.closest('nav, header, footer, [role="navigation"]')) continue;
      
      // Skip non-article links
      if (href.includes('/author/') || href.includes('/profile/') || 
          href.includes('/tag/') || href.includes('/category/') ||
          href.includes('/page/') || href.includes('facebook') || 
          href.includes('twitter') || href.includes('youtube') ||
          href.includes('instagram') || href.includes('whatsapp')) continue;
      
      try {
        const url = new URL(href);
        if (url.hostname !== baseUrlObj.hostname) continue;
        
        const pathname = url.pathname;
        const search = url.search || '';
        let domainOk = true;
        const host = baseUrlObj.hostname.toLowerCase();
        if (host.includes('ndtv')) {
          domainOk = (/\/news\//.test(pathname) || /\/india\//.test(pathname) || /\/world\//.test(pathname) || /-\d{5,}/.test(pathname));
        } else if (host.includes('pinkvilla')) {
          domainOk = (/(entertainment|news|story)/i.test(pathname) && !/\/video\//i.test(pathname));
        } else if (host.includes('bbc')) {
          domainOk = (/\/news\//.test(pathname) || /\/sport\//.test(pathname) || /\/business\//.test(pathname) || /\/\d{4}\//.test(pathname));
        } else if (host.includes('dinamalar')) {
          domainOk = pathname.includes('news') || pathname.includes('article') || /detail/i.test(pathname);
        } else if (host.includes('manorama')) {
          domainOk = pathname.includes('/news') || pathname.includes('/story') || pathname.includes('/news-updates');
        }
        if (!domainOk) continue;
        
        const queryHasNumericId = /(?:[?&])(id|storyid|nid|contentid|newsid)=\d{4,}/i.test(search);
        const endsWithAsp = pathname.endsWith('.asp') || pathname.endsWith('.aspx') || pathname.endsWith('.htm');
        const looksLikeRegionalArticle =
          (host.includes('dinamalar') && (pathname.includes('news') || pathname.includes('detail') || queryHasNumericId)) ||
          (host.includes('manorama') && (pathname.includes('/news') || pathname.includes('/story') || pathname.includes('/news-updates')));
        
        // Article detection
        const isArticle =
          /\/\d{4}\/\d{1,2}\/\d{1,2}\/.+/.test(pathname) ||
          /\/\d{4}-\d{2}-\d{2}\/.+/.test(pathname) ||
          /-\d{5,}/.test(pathname) ||
          /\d{8,}\.html/.test(pathname) ||
          /\/(article|story|news|post|blog)\/.+/.test(pathname) ||
          (pathname.includes('/news/') && pathname.length > 20) ||
          (pathname.length > 20 && !pathname.includes('/author/') && !pathname.includes('/tag/') && !pathname.includes('/category/')) ||
          (endsWithAsp && (pathname.includes('news') || pathname.includes('story') || pathname.includes('detail'))) ||
          (queryHasNumericId && (pathname.includes('news') || pathname.includes('story') || host.includes('dinamalar'))) ||
          looksLikeRegionalArticle;
        
        const minPathLength = host.includes('dinamalar') ? 10 : 15;
        
        if (isArticle && pathname.length >= minPathLength) {
          urls.add(href);
          if (urls.size >= 120) break;
        }
      } catch (e) {}
    }
    
    return Array.from(urls);
  }, website);
}

// ============================================================
// EXTRACT UNIQUE AUTHORS FROM COLLECTED ARTICLES
// ============================================================

async function extractAuthorsFromArticles(articles, website, browser, limit) {
  const authorsMap = new Map();
  
  try {
    console.log(`\n🔍 Extracting authors from ${articles.length} articles...`);
    
    let processed = 0;
    const PARALLEL_PAGES = 15; // Process 15 articles simultaneously for speed
    
    // Process articles in parallel batches - Stop once we have enough authors (30-40)
    // Process enough articles to find the target number of authors, but don't over-process
    const maxArticlesToProcess = Math.min(articles.length, limit * 15); // Process ~15 articles per author needed
    
    for (let i = 0; i < maxArticlesToProcess; i += PARALLEL_PAGES) {
      const batch = articles.slice(i, Math.min(i + PARALLEL_PAGES, maxArticlesToProcess));
      
      // Create separate pages for parallel processing
      const batchPromises = batch.map(async (article) => {
        const articlePage = await browser.newPage();
        await articlePage.setUserAgent(getRandomUserAgent());
        articlePage.setDefaultTimeout(8000);
        articlePage.setDefaultNavigationTimeout(8000);
        
        try {
          await Promise.race([
            articlePage.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 8000 }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
          ]).catch(() => {});
          
          await delay(150); // Minimal delay
          
          const authorInfo = await extractAuthorFromArticle(articlePage, website);
          
          if (authorInfo && isValidJournalistName(authorInfo.name)) {
            // Thread-safe check
            if (!authorExists(authorInfo, authorsMap)) {
              const key = normalizeAuthorName(authorInfo.name);
              authorsMap.set(key, authorInfo);
              processed++;
            }
          }
        } catch (e) {
          // Continue silently
        } finally {
          await articlePage.close();
        }
      });
      
      await Promise.all(batchPromises);
      
      if (processed % 50 === 0 || authorsMap.size % 5 === 0) {
        console.log(`    ✓ Processed ${processed}/${maxArticlesToProcess} articles, found ${authorsMap.size} unique authors`);
      }
      
      // Stop once we have enough authors (30-40) - no need to process more
      // Process at least 200 articles to ensure diversity, but stop once limit is reached
      if (authorsMap.size >= limit && processed >= 200) break;
    }
    
    const uniqueAuthors = Array.from(authorsMap.values());
    console.log(`\n✅ Extracted ${uniqueAuthors.length} unique authors from ${processed} articles`);
    
    // If we still don't have enough, log a warning
    if (uniqueAuthors.length < limit) {
      console.log(`\n⚠️  Only found ${uniqueAuthors.length} unique authors (target: ${limit}). Will try fallback strategies.`);
    }
    
    return uniqueAuthors;
    
  } catch (err) {
    console.error(`  ❌ Error extracting authors: ${err.message}`);
    return Array.from(authorsMap.values());
  }
}

// ============================================================
// REMOVED: Legacy functions (discoverAuthorsIntelligently, discoverFromRSS, 
// discoverFromAuthorDirectory) - not used, replaced by faster 3-phase approach
// ============================================================

// ============================================================
// DISCOVER SECTION PAGES
// ============================================================

async function discoverSectionPages(website, page) {
  const sections = new Set();
  const site = website.replace(/\/$/, '');
  
  try {
    await page.goto(website, { waitUntil: 'domcontentloaded', timeout: 20000 });
    
    // Extract navigation links that look like sections
    const sectionUrls = await page.evaluate((baseUrl) => {
      const prioritized = [];
      const fallback = [];
      const links = document.querySelectorAll('nav a, header a, [role="navigation"] a, .menu a');
      
      for (const link of links) {
        const href = link.href;
        const text = link.textContent?.trim().toLowerCase() || '';
        
        if (!href) continue;
        
        // Check if this looks like a section (not homepage, not external)
        const url = new URL(href);
        const baseUrlObj = new URL(baseUrl);
        
        if (url.hostname !== baseUrlObj.hostname) continue;
        if (href === baseUrl || href === baseUrl + '/') continue;
        if (href.includes('#')) continue;
        
        // Common section keywords
        const sectionKeywords = ['news', 'business', 'sports', 'entertainment', 'tech', 
                                 'world', 'national', 'india', 'politics', 'lifestyle',
                                 'opinion', 'health', 'science', 'education', 'city',
                                 'kerala', 'pravasi', 'gulf', 'malayalam', 'movie', 'cinema',
                                 'auto', 'devotional', 'spiritual', 'travel', 'metro', 'crime',
                                 'technology', 'culture', 'kids', 'youth'];
        
        const isSectionLink = sectionKeywords.some(keyword => 
          text.includes(keyword) || href.toLowerCase().includes('/' + keyword)
        );
        
        if (isSectionLink && !href.includes('/tag/') && !href.includes('/category/')) {
          if (!prioritized.includes(href)) prioritized.push(href);
        } else if (!fallback.includes(href)) {
          fallback.push(href);
        }
      }
      
      const combined = [];
      const seen = new Set();
      const pushUnique = (list) => {
        for (const entry of list) {
          if (seen.has(entry)) continue;
          seen.add(entry);
          combined.push(entry);
          if (combined.length >= 20) break;
        }
      };
      
      pushUnique(prioritized);
      if (combined.length < 10) {
        pushUnique(fallback);
      }
      
      return combined;
    }, website);
    
    sectionUrls.forEach(url => sections.add(url));
  try {
    const host = new URL(website).hostname.toLowerCase();
    if (host.includes('pinkvilla')) {
      const seeds = [
        `${site}/entertainment`,
        `${site}/entertainment/bollywood`,
        `${site}/entertainment/hollywood`,
        `${site}/entertainment/korean`,
        `${site}/entertainment/south`,
        `${site}/entertainment/tv`,
        `${site}/news`,
        `${site}/lifestyle`,
        `${site}/fashion`,
        `${site}/beauty`,
        `${site}/health`,
        `${site}/reviews`
      ];
      for (const s of seeds) sections.add(s);
    } else if (host.includes('dinamalar')) {
      const seeds = [
        `${site}/latest_news.asp`,
        `${site}/latest_news.asp?cat=1`,
        `${site}/sports_news.asp`,
        `${site}/world_news.asp`,
        `${site}/cinema_news.asp`,
        `${site}/politics_news.asp`,
        `${site}/business_news.asp`
      ];
      for (const s of seeds) sections.add(s);
    } else if (host.includes('manorama')) {
      const seeds = [
        `${site}/news/kerala`,
        `${site}/news/india`,
        `${site}/news/world`,
        `${site}/news/latest-news`,
        `${site}/news/kerala/thiruvananthapuram`,
        `${site}/news/kerala/kottayam`,
        `${site}/sports`,
        `${site}/business`,
        `${site}/lifestyle`
      ];
      for (const s of seeds) sections.add(s);
    }
  } catch {}
    
  } catch (e) {
    console.log(`    ⚠️  Could not discover sections: ${e.message}`);
  }
  
  return Array.from(sections).slice(0, 10); 
}
async function extractAuthorsFromPage(page, pageUrl, limit = 50) {
  const authors = [];
  const seenAuthors = new Set(); 
  
  try {
    await Promise.race([
      page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Navigation timeout')), 15000))
    ]).catch(() => {
      console.log(`    ⚠️  Page load timeout for ${pageUrl}, continuing...`);
    });
    
    const isBlocked = await page.evaluate(() => {
      const bodyText = document.body?.innerText?.toLowerCase() || '';
      return bodyText.includes('access denied') || 
             bodyText.includes('blocked') || 
             bodyText.includes('captcha') ||
             bodyText.includes('cloudflare') ||
             document.querySelector('iframe[src*="challenges"]') !== null;
    }).catch(() => false);
    
    if (isBlocked) {
      console.log(`    ⚠️  Page appears to be blocked, skipping...`);
      return authors;
    }
    
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await delay(400);
    }
    
    await delay(1000);
    
    const articleUrls = await page.evaluate((baseUrl) => {
      const urls = new Set();
      const links = document.querySelectorAll('a[href]');
      const baseUrlObj = new URL(baseUrl);
      
      for (const link of links) {
        const href = link.href;
        if (!href || href === '#') continue;
        
        if (link.closest('nav, header, footer, [role="navigation"]')) continue;
        
        if (href.includes('/tag/') || href.includes('/category/') || 
            href.includes('/author/') || href.includes('/profile/') ||
            href.includes('/page/') || href.includes('facebook') || 
            href.includes('twitter') || href.includes('youtube') ||
            href.includes('instagram') || href.includes('whatsapp')) continue;
        
        try {
          const url = new URL(href);
          const pathname = url.pathname;
          const search = url.search || '';
          let domainOk = true;
          const host = baseUrlObj.hostname.toLowerCase();

          if (host.includes('ndtv')) {
            domainOk = (/\/news\//.test(pathname) || /\/india\//.test(pathname) || /\/world\//.test(pathname) || /-\d{5,}/.test(pathname));
          } else if (host.includes('pinkvilla')) {
            domainOk = (/(entertainment|news|story)/i.test(pathname) && !/\/video\//i.test(pathname));
          } else if (host.includes('dinamalar')) {
            domainOk = pathname.includes('news') || pathname.includes('article') || /detail/i.test(pathname);
          } else if (host.includes('manorama')) {
            domainOk = pathname.includes('/news') || pathname.includes('/story') || pathname.includes('/news-updates');
          }

          if (!domainOk) continue;
          
          const queryHasNumericId = /(?:[?&])(id|storyid|nid|contentid|newsid)=\d{4,}/i.test(search);
          const endsWithAsp = pathname.endsWith('.asp') || pathname.endsWith('.aspx') || pathname.endsWith('.htm');
          const looksLikeRegionalArticle =
            (host.includes('dinamalar') && (pathname.includes('news') || pathname.includes('detail') || queryHasNumericId)) ||
            (host.includes('manorama') && (pathname.includes('/news') || pathname.includes('/story') || pathname.includes('/news-updates')));
          
          const looksLikeArticle = 
            /\/\d{4}\/\d{1,2}\/\d{1,2}\/.+/.test(pathname) ||
            /\/\d{4}-\d{2}-\d{2}\/.+/.test(pathname) ||
            /-\d{5,}/.test(pathname) ||
            /\d{5,}\.html/.test(pathname) ||
            /\/(article|story|news|post|blog)\/.+/.test(pathname) ||
            /\/(national|world|india|business|sports|entertainment|tech|science|health|lifestyle|opinion)\/.+/.test(pathname) ||
            (pathname.includes('/news') && pathname.length > 20) ||
            (/\d{5,}/.test(pathname) && pathname.length > 15) ||
            (endsWithAsp && (pathname.includes('news') || pathname.includes('story') || pathname.includes('detail'))) ||
            (queryHasNumericId && (pathname.includes('news') || pathname.includes('story') || host.includes('dinamalar'))) ||
            looksLikeRegionalArticle;
          
          let hasDepth = pathname.split('/').filter(p => p).length >= 2;
          if (!hasDepth && host.includes('dinamalar') && queryHasNumericId) {
            hasDepth = true;
          }
          const minPathLength = host.includes('dinamalar') ? 10 : 15;
          const notTooShort = pathname.length >= minPathLength;
          
          if (looksLikeArticle && hasDepth && notTooShort) {
            urls.add(href);
            if (urls.size >= 100) break;
          }
        } catch (e) {}
      }
      
      return Array.from(urls);
    }, pageUrl);
    
    console.log(`    → Found ${articleUrls.length} article URLs`);
    
    let checked = 0;
    for (const articleUrl of articleUrls) {
      if (authors.length >= limit) break;
      if (checked >= 100) break;
      
      checked++;
      
      try {
        await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
        await delay(800);
        
        const authorInfo = await extractAuthorFromArticle(page, pageUrl);
        
        if (authorInfo && isValidJournalistName(authorInfo.name)) {
          const normName = normalizeAuthorName(authorInfo.name);

          if (!seenAuthors.has(normName)) {
            let isDuplicate = false;

            for (const existing of seenAuthors) {
              if (areNamesSimilar(authorInfo.name, existing)) {
                isDuplicate = true;
                break;
              }
            }

            if (!isDuplicate) {
              seenAuthors.add(normName);
          authors.push(authorInfo);
          console.log(`      ✓ Found author: ${authorInfo.name}`);
            }
          }
        }
      } catch (e) {
        continue;
      }
    }
    
  } catch (e) {
    console.log(`     Page scraping failed: ${e.message}`);
  }
  
  return authors;
}

// ============================================================
// ROBUST AUTHOR NAME VALIDATION
// ============================================================

function isValidJournalistName(name) {
  if (!name || typeof name !== 'string') return false;
  
  const trimmed = name.trim();
  
  // Remove HTML entities
  const cleaned = trimmed.replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' ').replace(/&[a-z]+;/gi, '').trim();
  
  // Length check
  if (cleaned.length < 5 || cleaned.length > 60) return false;
  
  // Must have words, but allow single-word Indic names
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  const usesIndicScript = /[\u0900-\u097F\u0980-\u09FF\u0A80-\u0AFF\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0D7F]/.test(cleaned);
  if (!usesIndicScript && (words.length < 2 || words.length > 5)) return false;
  if (usesIndicScript && (words.length < 1 || words.length > 6)) return false;
  
  const lowerName = cleaned.toLowerCase();
  if (/(desk|team|bureau)/i.test(lowerName)) return false;
  
  // REJECT: Desk names, agencies, editorial boards - MUCH STRICTER
  const INVALID_PATTERNS = [
    /^(our|the)\s+(bureau|web\s*desk|correspondent|special\s*correspondent|staff|editorial\s*board|team|news\s*desk)/i,
    /(web\s*desk|bureau|correspondent|editorial\s*board|news\s*desk|staff|team)$/i,
    /^(entertainment|sports|business|tech|national|international|world|city|regional|my\s+kolkata)\s+(web\s*desk|bureau|correspondent)/i,
    /^(my\s+)?[a-z]+\s+(web\s*desk|bureau)$/i,
    /^(our|the)\s+[a-z]+\s+(web\s*desk|bureau|correspondent)/i,
    /web\s*desk/i, // Any mention of "web desk"
    /^(pti|reuters|ap|afp|dpa|ians|ani|unsplash|getty|shutterstock|agencies|agency)$/i, // Agencies
    /^(editorial|editor|reporter|correspondent|journalist|writer|staff|team|bureau|desk)$/i, // Generic roles
    /^(read|view|more|all|see|click|share|follow|subscribe|login|sign|register|sign\s*in)$/i, // Action words
    /,\s*(pti|reuters|ap|agencies)/i, // "Name, PTI" format
    /&\s*(pti|reuters|ap|agencies)/i, // "Name & PTI" format
    /^(our|the)\s+special\s+correspondent$/i,
    /^(our|the)\s+correspondent$/i,
  ];
  
  for (const pattern of INVALID_PATTERNS) {
    if (pattern.test(cleaned)) return false;
  }
  
  // REJECT: Common invalid names - EXPANDED LIST with agencies
  const INVALID_NAMES = [
    'our bureau', 'our web desk', 'our correspondent', 'our special correspondent',
    'the editorial board', 'editorial board', 'news desk', 'web desk',
    'entertainment web desk', 'sports desk', 'business desk', 'tech desk',
    'my kolkata web desk', 'our web desk & pti', 'our web desk & agencies',
    'our web desk, agencies', 'our web desk, pti', 'our web desk &amp; pti',
    'pti', 'reuters', 'ap', 'afp', 'dpa', 'ians', 'ani', 'agencies', 'agency',
    'our staff', 'editorial team', 'news team', 'web team', 'sign in',
    'our web desk &amp; agencies', 'our web desk &amp; pti',
    'press trust of india', 'asian news international', 'news international',
    'trust of india', 'news agency', 'wire service', 'news service'
  ];
  
  if (INVALID_NAMES.includes(lowerName)) return false;
  
  // Reject if contains agency names anywhere - MORE AGGRESSIVE
  const agencyNames = [
    'pti', 'reuters', 'ap', 'afp', 'dpa', 'ians', 'ani', 'agencies', 'agency',
    'press trust', 'news international', 'trust of india', 'asian news',
    'wire service', 'news service', 'news agency'
  ];
  for (const agency of agencyNames) {
    if (lowerName.includes(agency)) {
      // If name contains agency name, reject it
      return false;
    }
  }
  
  // Must contain only valid characters (no HTML entities)
  if (!/^[A-Za-z\u0900-\u097F\u0980-\u09FF\u0A80-\u0AFF\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0D7F\s\.\-\']+$/.test(cleaned)) return false;
  
  // Reject if too many digits
  const digitCount = (cleaned.match(/\d/g) || []).length;
  if (digitCount > cleaned.length * 0.1) return false;
  
  // Each word should be at least 2 characters
  if (words.some(word => word.length < 2)) return false;
  
  // Must start with capital letter (for English names)
  if (/^[a-z]/.test(cleaned) && !usesIndicScript) return false;
  
  // Reject single-word names that are common invalid terms
  if (words.length === 1 && ['bureau', 'desk', 'team', 'staff', 'editorial'].includes(lowerName)) {
    return false;
  }
  
  return true;
}

// ============================================================
// EXTRACT AUTHOR FROM ARTICLE PAGE (UNIVERSAL)
// ============================================================

async function extractAuthorFromArticle(page, baseUrl) {
  const result = await page.evaluate((base) => {
    let authorName = null;
    let authorUrl = null;
    const host = new URL(base).hostname.toLowerCase();
    
    // Method 1: JSON-LD Structured Data (HIGHEST PRIORITY - most reliable)
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        
        // Handle author field
        if (data.author) {
          // Author can be string, object, or array
          if (typeof data.author === 'string') {
            authorName = data.author;
          } else if (Array.isArray(data.author)) {
            // Take first author
            const first = data.author[0];
            authorName = typeof first === 'string' ? first : first.name;
            authorUrl = first.url || first.sameAs || first['@id'];
          } else if (data.author.name) {
            authorName = data.author.name;
            authorUrl = data.author.url || data.author.sameAs || data.author['@id'];
          }
          
          if (authorName) {
            // Only use constructed URL if we don't have a real one
            if (!authorUrl || !authorUrl.startsWith('http')) {
              const slug = authorName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\u0900-\u097F\u0980-\u09FF\u0A80-\u0AFF\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0D7F-]/g, '');
              const baseUrlObj = new URL(base);
              authorUrl = `${baseUrlObj.origin}/author/${slug}`;
            }
            return { name: authorName.trim(), profileUrl: authorUrl };
          }
        }
      } catch (e) {}
    }
    
    // Method 2: Author links (PRIORITIZE - these are actual profile URLs)
    const authorLinkSelectors = [
      'a[href*="/author/"]',
      'a[href*="/profile/"]',
      'a[href*="/journalist/"]',
      'a[href*="/writer/"]',
      'a[href*="/reporter/"]',
      'a[href*="/correspondent/"]',
      'a[href*="/agency/"]',
      'a[rel="author"]',
      '.byline a',
      '.author a',
      '.author-name a',
      '.writer a',
      '[class*="author"] a',
      '[class*="byline"] a',
      '[class*="writer"] a',
      '.pst-by_ln a',
      '.pst-by a',
      '.auth_name a',
      'span.posted-by a',
      'a[itemprop="author"]',
      '.newsdet-author a',
      '.story-author__name a',
      '.mm-author-name a'
    ];
    
    for (const selector of authorLinkSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const name = element.textContent?.trim();
        const href = element.href;
        
        if (name && href) {
          // This is the ACTUAL profile URL from the website
          return { name, profileUrl: href };
        }
      }
    }
    
    // Method 3: Meta Tags (Very reliable)
    const metaAuthor = document.querySelector('meta[name="author"], meta[property="author"], meta[property="article:author"]');
    if (metaAuthor && metaAuthor.content) {
      const name = metaAuthor.content.trim();
      if (name) {
        // No actual profile URL from meta, construct one
        const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\u0900-\u097F\u0980-\u09FF\u0A80-\u0AFF\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0D7F-]/g, '');
        const baseUrlObj = new URL(base);
        const profileUrl = `${baseUrlObj.origin}/author/${slug}`;
        return { name, profileUrl };
      }
    }
    
    // Method 4: Author text elements
    const authorTextSelectors = [
      '[itemprop="author"] [itemprop="name"]',
      '[itemprop="author"]',
      '.author-name',
      '.byline',
      '.author',
      '.writer-name',
      '.correspondent',
      'span[class*="author"]',
      'div[class*="author"]',
      'span[class*="byline"]',
      'div[class*="byline"]',
      '.article-author',
      '.story-author',
      '.post-author',
      '.newsdet-author',
      '.article_author',
      '.author_txt',
      '.mm-author-name',
      '.story-author__name',
      '.manorama-author',
      '[class*="authorname"]'
    ];
    
    for (const selector of authorTextSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        let name = element.textContent?.trim();
        
        if (!name || name.length < 3 || name.length > 60) continue;
        
        // Check if element has a link child
        const linkChild = element.querySelector('a[href]');
        if (linkChild && linkChild.href) {
          const childName = linkChild.textContent?.trim();
          if (childName && childName.length >= 3) {
            // Use the actual link from the website
            name = childName;
            return { name, profileUrl: linkChild.href };
          }
        }
        
        // Clean up prefixes/suffixes
        name = name
          .replace(/^(by|written by|posted by|author:?|द्वारा|लेखक:?|लिखित:?|লেখক:?|লিখেছেন:?|எழுதியவர்:?|எழுதி:?|எழுதியது:?|லேககர்:?|லேககன்:?|லேககள்:?|లేఖకుడు:?|ലേഖകന്‍:?|ലേഖകൻ:?|ലേഖിക:?|എഴുതി:?|രചിച്ചത്:?|വാർത്ത:?)/i, '')
          .replace(/\s+(reporter|correspondent|journalist|लेखक|संवाददाता|செய்தியாளர்|വാർത്താവതാരകൻ)$/i, '')
          .replace(/\s*&amp;\s*/gi, ' & ')
          .trim();
        
        // Basic validation
        if (name && name.length >= 5 && name.length < 60 &&
            !/\d{2}:\d{2}/.test(name) &&
            !/\d{4}/.test(name) &&
            !/(updated|published|posted|edited|ago|am|pm|ist|gmt|minutes|hours|days)/i.test(name)) {
          
            // No actual profile URL found, construct one
            const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\u0900-\u097F\u0980-\u09FF\u0A80-\u0AFF\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0D7F-]/g, '');
            const baseUrlObj = new URL(base);
            const profileUrl = `${baseUrlObj.origin}/author/${slug}`;
            return { name, profileUrl };
        }
      }
    }
    
    if (!authorName) {
      const siteSpecificSelectors = [];
      if (host.includes('dinamalar')) {
        siteSpecificSelectors.push(
          '.newsdet-author',
          '#ctl00_ContentPlaceHolder1_LblReporter',
          '#ContentPlaceHolder1_LblReporter',
          '.story-author',
          '.author_txt'
        );
      } else if (host.includes('manorama')) {
        siteSpecificSelectors.push(
          '.article-author-name',
          '.mm-author-name',
          '.story-author__name',
          '.manorama-author',
          '.article_author'
        );
      }
      
      for (const selector of siteSpecificSelectors) {
        const el = document.querySelector(selector);
        if (!el) continue;
        const text = el.textContent?.trim();
        if (text && text.length >= 3) {
          const slug = text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\u0900-\u097F\u0980-\u09FF\u0A80-\u0AFF\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0D7F-]/g, '');
          const baseUrlObj = new URL(base);
          const profileUrl = `${baseUrlObj.origin}/author/${slug}`;
          return { name: text, profileUrl };
        }
      }
    }
    
    // Method 5: Text pattern matching in article body
    const articleBody = document.querySelector('article, .article, .story, main, .content, .post, [class*="article-body"]');
    if (articleBody) {
      const text = articleBody.textContent;
      
      // Patterns for different formats
      const patterns = [
        /(?:By|द्वारा|লিখেছেন)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/,
        /(?:By|द्वारा|लिखित|लिखा|লিখেছেন)\s+([\u0900-\u097F\u0980-\u09FF]+(?:\s+[\u0900-\u097F\u0980-\u09FF]+){1,3})/,
        /(?:By|द्वारा|लिखित|लिखा|লিখেছেন|எழுதியவர்|எழுதி|எழுதியது|லேககர்)\s+([\u0B80-\u0BFF]+(?:\s+[\u0B80-\u0BFF]+){0,3})/,
        /(?:By|ദ്വാര|ലേഖകൻ|ലേഖിക|എഴുതി|രചിച്ചത്)\s+([\u0D00-\u0D7F]+(?:\s+[\u0D00-\u0D7F]+){0,3})/,
        /^([A-Z][a-z]+\s+[A-Z][a-z]+)\s*\|/m
      ];
      
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const name = match[1].trim();
          if (name && name.length >= 5 && name.length < 50) {
            // No actual profile URL found, construct one
            const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\u0900-\u097F\u0980-\u09FF\u0A80-\u0AFF\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0D7F-]/g, '');
            const baseUrlObj = new URL(base);
            const profileUrl = `${baseUrlObj.origin}/author/${slug}`;
            return { name, profileUrl };
          }
        }
      }
    }
    
    return null;
  }, baseUrl);
  
  // Validate and clean the extracted author name
  if (result && result.name) {
    // Clean HTML entities first
    let cleanedName = result.name
      .replace(/&amp;/gi, '&')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&[a-z]+;/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Remove trailing commas, periods, and common suffixes
    cleanedName = cleanedName
      .replace(/[,\.]+$/, '')
      .replace(/\s+(reporter|correspondent|journalist|writer)$/i, '')
      .trim();
    
    // Validate cleaned name
    if (!isValidJournalistName(cleanedName)) {
      return null;
    }
    
    result.name = cleanedName;
  }
  
  return result;
}

// ============================================================
// FAST ARTICLE EXTRACTION
// ============================================================

async function extractAuthorArticlesFast(page, website, authorName = null) {
  try {
    // Strategy 1: Try to find articles on author profile page
    // Scroll to load articles - FASTER with fewer scrolls
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await delay(300); // Reduced delay
    }
    
    await delay(1000); // Reduced wait time
    
    // Try clicking "Load More" or "See More" buttons if they exist - WITH TIMEOUT
    try {
      const loadMoreSelectors = [
        'button[class*="load-more"]',
        'button[class*="see-more"]',
        'a[class*="load-more"]',
        'a[class*="see-more"]',
        '.load-more',
        '.see-more'
      ];
      
      for (const selector of loadMoreSelectors) {
        try {
          const button = await page.$(selector).catch(() => null);
          if (button) {
            await Promise.race([
              button.click(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Click timeout')), 3000))
            ]).catch(() => {});
            await delay(500); // Minimal delay
          }
        } catch (e) {}
      }
    } catch (e) {}
    
    const articles = await page.evaluate((baseUrl, authorName) => {
      const articlesData = [];
      const seenUrls = new Set();
      const baseUrlObj = new URL(baseUrl);
      
      // STEP 1: Find article containers first (more accurate) - EXPANDED SELECTORS
      const articleContainers = [
        'article',
        '.article',
        '.story',
        '.post',
        '[class*="article-item"]',
        '[class*="story-item"]',
        '[class*="post-item"]',
        '[class*="news-item"]',
        '[class*="content-item"]',
        '[class*="article-card"]',
        '[class*="story-card"]',
        '[class*="news-card"]',
        '.news-card',
        '.story-card',
        '.article-card',
        '[class*="list-item"]',
        '[class*="item"]',
        'li[class*="article"]',
        'li[class*="story"]',
        'li[class*="news"]',
        'div[class*="article"]',
        'div[class*="story"]',
        'div[class*="news"]'
      ];
      
      let foundInContainers = false;
      
      for (const selector of articleContainers) {
        const containers = document.querySelectorAll(selector);
        if (containers.length === 0) continue;
        
        for (const container of containers) {
          // Must have a link
          const link = container.querySelector('a[href]');
          if (!link) continue;
          
          const href = link.href;
          if (!href || seenUrls.has(href)) continue;
          
          try {
            const url = new URL(href);
            if (url.hostname !== baseUrlObj.hostname) continue;
            
            const pathname = url.pathname;
            
            // Validate it's actually an article URL - MORE PERMISSIVE
            const isArticle =
              /\/\d{4}\/\d{1,2}\/\d{1,2}\/.+/.test(pathname) ||  // Date-based URLs
              /\/\d{4}-\d{2}-\d{2}\/.+/.test(pathname) ||        // Alternative date format
              /-\d{5,}/.test(pathname) ||                         // Has ID (5+ digits)
              /\d{8,}\.html/.test(pathname) ||                    // HTML with ID
              /\/(article|story|news|post|blog|column|opinion|report)\/.+/.test(pathname) || // Article paths
              (pathname.includes('/news/') && pathname.length > 15) || // News section
              (pathname.includes('/article/') && pathname.length > 15) || // Article section
              (pathname.match(/\/[a-z]+\/\d{4,}\//)) || // Section/year pattern
              (pathname.length > 20 && !pathname.includes('/author/') && !pathname.includes('/tag/') && !pathname.includes('/category/'));
            
            if (!isArticle || pathname.length < 15) continue;
            
            // Extract title properly - MULTIPLE STRATEGIES
            let title = '';
            
            // Strategy 1: Try heading in container first (most accurate)
            const heading = container.querySelector('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="headline"], [class*="heading"]');
            if (heading) {
              title = heading.textContent?.trim();
            }
            
            // Strategy 2: Try link text
            if (!title || title.length < 10) {
              title = link.textContent?.trim() || link.innerText?.trim();
            }
            
            // Strategy 3: Try link title attribute
            if (!title || title.length < 10) {
              title = link.getAttribute('title') || link.getAttribute('aria-label');
            }
            
            // Strategy 4: Try data attributes
            if (!title || title.length < 10) {
              title = link.getAttribute('data-title') || link.getAttribute('data-headline');
            }
            
            // Strategy 5: Try parent container for title
            if (!title || title.length < 10) {
              const parent = container.closest('[class*="article"], [class*="story"], [class*="news"]');
              if (parent) {
                const parentHeading = parent.querySelector('h1, h2, h3, h4, h5, [class*="title"], [class*="headline"]');
                if (parentHeading) title = parentHeading.textContent?.trim();
              }
            }
            
            // Clean title
            if (title) {
              title = title.replace(/\s+/g, ' ').trim();
              // Remove "Read more", "Continue reading" etc
              title = title.replace(/^(read more|continue reading|view|click|see more|more)[\s:]/i, '');
              // Remove trailing ellipsis and "..." patterns
              title = title.replace(/\.{3,}$/, '').trim();
            }
            
            // More permissive title validation
            if (title && title.length >= 10 && title.length < 300 &&
                !/^(home|menu|search|login|subscribe|share|follow|next|previous|back|close|read|view|more|click|see|all)$/i.test(title)) {
              
              // Extract date from URL if possible (store raw date, will format later)
              let publishDate = null;
              const dateMatch = href.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//) || 
                              href.match(/\/(\d{4})-(\d{1,2})-(\d{1,2})\//);
              if (dateMatch) {
                const year = dateMatch[1];
                const month = String(dateMatch[2]).length === 1 ? '0' + dateMatch[2] : dateMatch[2];
                const day = String(dateMatch[3]).length === 1 ? '0' + dateMatch[3] : dateMatch[3];
                publishDate = `${year}-${month}-${day}`;
              }
              
              articlesData.push({
                title: title.substring(0, 250),
                url: href,
                publishDate: publishDate
              });
              
              seenUrls.add(href);
              foundInContainers = true;
              
              if (articlesData.length >= 50) break; // Increased limit
            }
          } catch (e) {}
        }
        
        if (articlesData.length >= 25) break;
      }
      
      // STEP 2: If containers didn't work, try all links (but more carefully)
      if (!foundInContainers || articlesData.length < 10) {
        const allLinks = document.querySelectorAll('a[href]');
        
        for (const link of allLinks) {
          const href = link.href;
          
          if (!href || href === '#' || seenUrls.has(href)) continue;
          
          // Skip navigation, header, footer
          if (link.closest('nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"]')) continue;
          
          // Skip non-article links - MORE PERMISSIVE
          if (href.includes('/author/') || href.includes('/profile/') || 
              href.includes('/tag/') || href.includes('/category/') ||
              href.includes('/search') || href.includes('/page/') ||
              href.includes('facebook') || href.includes('twitter') || 
              href.includes('instagram') || href.includes('whatsapp') ||
              href.includes('youtube') || href.includes('mailto:') ||
              href.includes('javascript:') || href.includes('#') ||
              href.includes('/login') || href.includes('/register') ||
              href.includes('/subscribe')) continue;
          
          try {
            const url = new URL(href);
            if (url.hostname !== baseUrlObj.hostname) continue;
            
            const pathname = url.pathname;
            
            // More permissive article validation
            const isArticle =
              /\/\d{4}\/\d{1,2}\/\d{1,2}\/.+/.test(pathname) ||  // Date-based
              /\/\d{4}-\d{2}-\d{2}\/.+/.test(pathname) ||         // Alternative date
              /-\d{5,}/.test(pathname) ||                          // Has ID
              /\d{8,}\.html/.test(pathname) ||                    // HTML with ID
              /\/(article|story|news|post|blog|column|opinion|report)\/.+/.test(pathname) || // Article paths
              (pathname.includes('/news/') && pathname.length > 15) || // News section
              (pathname.includes('/article/') && pathname.length > 15) || // Article section
              (pathname.match(/\/[a-z]+\/\d{4,}\//)) || // Section/year pattern
              (pathname.length > 20 && !pathname.includes('/author/') && !pathname.includes('/tag/') && !pathname.includes('/category/'));
            
            if (!isArticle || pathname.length < 15) continue;
            
            // Get title - MULTIPLE STRATEGIES
            let title = link.textContent?.trim() || link.innerText?.trim() || link.getAttribute('title') || '';
            
            // Try to find title in parent
            if (!title || title.length < 10) {
              const parent = link.closest('article, [class*="article"], [class*="story"], [class*="post"], [class*="content"], [class*="news"], li, div');
              if (parent) {
                const heading = parent.querySelector('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="headline"], [class*="heading"]');
                if (heading) title = heading.textContent?.trim();
              }
            }
            
            // Try data attributes
            if (!title || title.length < 10) {
              title = link.getAttribute('data-title') || link.getAttribute('data-headline') || link.getAttribute('aria-label');
            }
            
            // Clean and validate - MORE PERMISSIVE
            if (title) {
              title = title.replace(/\s+/g, ' ').trim();
              title = title.replace(/^(read more|continue|view|click|see more|more)[\s:]/i, '');
              title = title.replace(/\.{3,}$/, '').trim();
              
              if (title.length >= 10 && title.length < 300 &&
                  !/^(home|menu|search|login|subscribe|share|follow|next|previous|back|close|read|view|more|click|see|all)$/i.test(title)) {
                
                // Extract date from URL if possible (store raw date, will format later)
                let publishDate = null;
                const dateMatch = href.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//) || 
                                href.match(/\/(\d{4})-(\d{1,2})-(\d{1,2})\//);
                if (dateMatch) {
                  const year = dateMatch[1];
                  const month = String(dateMatch[2]).length === 1 ? '0' + dateMatch[2] : dateMatch[2];
                  const day = String(dateMatch[3]).length === 1 ? '0' + dateMatch[3] : dateMatch[3];
                  publishDate = `${year}-${month}-${day}`;
                }
                
                articlesData.push({
                  title: title.substring(0, 250),
                  url: href,
                  publishDate: publishDate
                });
                
                seenUrls.add(href);
                
                if (articlesData.length >= 50) break; // Increased limit
              }
            }
          } catch (e) {}
        }
      }
      
      return articlesData;
    }, website, authorName);

    // Extract dates from URLs and sort by date (latest first)
    articles = articles.map(article => {
      let publishDate = null;
      // Try to extract date from URL patterns: /2024/01/15/ or /2024-01-15/
      const dateMatch = article.url.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//) || 
                       article.url.match(/\/(\d{4})-(\d{1,2})-(\d{1,2})\//);
      if (dateMatch) {
        const year = dateMatch[1];
        const month = String(dateMatch[2]).length === 1 ? '0' + dateMatch[2] : dateMatch[2];
        const day = String(dateMatch[3]).length === 1 ? '0' + dateMatch[3] : dateMatch[3];
        publishDate = `${year}-${month}-${day}`;
      }
      return { ...article, publishDate };
    }).sort((a, b) => {
      // Sort by date (latest first) if dates exist
      if (a.publishDate && b.publishDate) {
        return b.publishDate.localeCompare(a.publishDate);
      }
      // Prioritize URLs with dates in path (likely newer)
      const aHasDate = /\/(\d{4})\//.test(a.url);
      const bHasDate = /\/(\d{4})\//.test(b.url);
      if (aHasDate && !bHasDate) return -1;
      if (!aHasDate && bHasDate) return 1;
      return 0;
    });
    
    // Limit to latest 50 articles for accuracy
    articles = articles.slice(0, 50);
    
    // Strategy 2: If no articles found, use SERP API (FASTEST and most reliable)
    if (articles.length === 0 && authorName && SERP_API_KEY) {
      console.log(`    🔍 No articles on profile page, using SERP API to find articles by ${authorName}...`);
      try {
        const serpArticles = await searchSERPAPIForAuthorArticles(authorName, website);
        if (serpArticles.length > 0) {
          console.log(`    ✓ Found ${serpArticles.length} articles via SERP API`);
          articles.push(...serpArticles);
        }
      } catch (err) {
        console.log(`    ⚠️  SERP API search failed: ${err.message}`);
      }
    }
    
    // Strategy 3: If still no articles, search Google for articles by this author
    if (articles.length === 0 && authorName) {
      console.log(`    🔍 Searching Google for articles by ${authorName}...`);
      try {
        const searchArticles = await searchGoogleForAuthorArticles(authorName, website, page);
        if (searchArticles.length > 0) {
          console.log(`    ✓ Found ${searchArticles.length} articles via Google search`);
          articles.push(...searchArticles);
        }
      } catch (err) {
        console.log(`    ⚠️  Google search failed: ${err.message}`);
      }
    }
    
    // Strategy 4: Try to find articles by searching the website directly
    if (articles.length < 10 && authorName) {
      console.log(`    🔍 Searching website for more articles by ${authorName}...`);
      try {
        const siteArticles = await searchWebsiteForAuthorArticles(authorName, website, page);
        if (siteArticles.length > 0) {
          console.log(`    ✓ Found ${siteArticles.length} articles via website search`);
          // Merge without duplicates
          const existingUrls = new Set(articles.map(a => a.url));
          for (const article of siteArticles) {
            if (!existingUrls.has(article.url)) {
              articles.push(article);
            }
          }
        }
      } catch (err) {
        console.log(`    ⚠️  Website search failed: ${err.message}`);
      }
    }
    
    // Strategy 5: If still no articles, try SERP API with different queries
    if (articles.length === 0 && authorName && SERP_API_KEY) {
      console.log(`    🔍 Trying SERP API with alternative queries for ${authorName}...`);
      try {
        const hostname = new URL(website).hostname;
        const queries = [
          `site:${hostname} "${authorName}"`,
          `site:${hostname} ${authorName} article`,
          `site:${hostname} ${authorName} news`
        ];
        
        for (const query of queries) {
          if (articles.length >= 20) break;
          try {
            const serpArticles = await searchSERPAPIForAuthorArticles(authorName, website, query);
            const existingUrls = new Set(articles.map(a => a.url));
            for (const article of serpArticles) {
              if (!existingUrls.has(article.url)) {
                articles.push(article);
              }
            }
          } catch (e) {
            continue;
          }
        }
        if (articles.length > 0) {
          console.log(`    ✓ Found ${articles.length} articles via SERP API alternative queries`);
        }
      } catch (err) {
        console.log(`    ⚠️  SERP API alternative search failed: ${err.message}`);
      }
    }
    
    // Strategy 4: If still no articles, try searching the current page URL pattern
    if (articles.length === 0 && authorName) {
      console.log(`    🔍 Trying alternative article discovery methods...`);
      try {
        // Try to find article links by pattern matching on current page
        const altArticles = await page.evaluate((baseUrl, authorName) => {
          const articles = [];
          const seen = new Set();
          const baseUrlObj = new URL(baseUrl);
          const allLinks = document.querySelectorAll('a[href]');
          
          for (const link of allLinks) {
            const href = link.href;
            if (!href || seen.has(href)) continue;
            
            try {
              const url = new URL(href);
              if (url.hostname !== baseUrlObj.hostname) continue;
              
              const pathname = url.pathname;
              // Very permissive - any URL that looks like content
              if (pathname.length > 15 && 
                  !pathname.includes('/author/') && 
                  !pathname.includes('/tag/') && 
                  !pathname.includes('/category/') &&
                  !pathname.includes('/search') &&
                  !pathname.includes('/page/')) {
                
                const title = link.textContent?.trim() || link.getAttribute('title') || '';
                if (title.length >= 10) {
                  articles.push({ title: title.substring(0, 250), url: href });
                  seen.add(href);
                  if (articles.length >= 20) break;
                }
              }
            } catch (e) {}
          }
    
    return articles;
        }, website, authorName);
        
        if (altArticles.length > 0) {
          console.log(`    ✓ Found ${altArticles.length} articles via alternative method`);
          articles.push(...altArticles);
        }
      } catch (err) {
        console.log(`    ⚠️  Alternative method failed: ${err.message}`);
      }
    }
    
    // Log final article count
    if (articles.length > 0) {
      console.log(`    ✅ Total articles found: ${articles.length}`);
    } else {
      console.log(`    ⚠️  No articles found for ${authorName}`);
    }
    
    return articles;
    
  } catch (err) {
    return [];
  }
}

// ============================================================
// EXTRACT DETAILED AUTHOR DATA
// ============================================================

async function extractAuthorData(author, outletName, browser, website) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  // Set timeouts for this page - longer for slow sites
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(20000);
  
  // Add stealth settings to avoid detection
  try {
    const host = new URL(website).hostname.toLowerCase();
    if (!host.includes('ndtv')) {
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'hi', 'bn', 'gu', 'ta', 'ml'] });
      });
    }
  } catch {}

  try {
    // Load profile page - with error handling for invalid URLs
    let profileLoaded = false;
    let actualProfileUrl = author.profileUrl;
    
    try {
      const response = await Promise.race([
        page.goto(author.profileUrl, { 
        waitUntil: 'domcontentloaded', 
          timeout: 15000
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Navigation timeout')), 15000))
      ]);
      
      // Check if page actually exists (not 404)
      if (response && response.status() === 200) {
        profileLoaded = true;
        actualProfileUrl = page.url(); // Get actual URL after any redirects
      }
    } catch (profileError) {
      // Fallback: Try to find author profile via search engines
      console.log(`   🔍 Profile page not found, searching for author profile...`);
      try {
        const searchProfile = await findAuthorProfileViaSearch(author.name, website, browser);
        if (searchProfile) {
          actualProfileUrl = searchProfile.profileUrl;
          profileLoaded = true;
          console.log(`   ✅ Found profile via search: ${actualProfileUrl}`);
          // Try to load the found profile
          try {
            await page.goto(actualProfileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          } catch (e) {}
        }
      } catch (searchErr) {
        console.log(`   ⚠️  Search fallback failed: ${searchErr.message}`);
      }
      if (!profileLoaded) {
        profileLoaded = false;
      }
    }

    // Extract profile info - WITH TIMEOUT
    const profileData = await Promise.race([
      page.evaluate(() => {
      const data = { bio: null, role: null, email: null };
      
        // Bio extraction - quick selectors only
        const bioEl = document.querySelector('.bio, .author-bio, [itemprop="description"], [class*="bio"]');
      if (bioEl) {
        const text = bioEl.textContent?.trim();
        if (text && text.length > 20 && text.length < 1000) {
          data.bio = text;
        }
      }
      
        // Role extraction - quick selectors only
        const roleEl = document.querySelector('.role, [itemprop="jobTitle"], [class*="role"]');
      if (roleEl) data.role = roleEl.textContent?.trim();
      
        // Email extraction - quick
      const emailMatch = document.body.innerText.match(/([a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/);
      if (emailMatch && !emailMatch[1].includes('@example.') && emailMatch[1].length < 50) {
        data.email = emailMatch[1];
      }
      
      return data;
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
    ]).catch(() => ({ bio: null, role: null, email: null }));

    // Extract articles - with retry logic and aggressive fallbacks
    console.log(`   📝 Extracting articles for ${author.name}...`);
    let articles = await extractAuthorArticlesFast(page, website, author.name);
    
    // Articles are already sorted by date (latest first) and limited to 50 in extractAuthorArticlesFast
    
    // If no articles found, try aggressive fallbacks
    if (articles.length === 0) {
      console.log(`   ⚠️  No articles found on profile page, trying SERP API fallback...`);
      
      // Try SERP API first (most reliable)
      if (SERP_API_KEY) {
        try {
          const serpArticles = await searchSERPAPIForAuthorArticles(author.name, website);
          if (serpArticles.length > 0) {
            articles = serpArticles;
            console.log(`   ✓ Found ${articles.length} articles via SERP API fallback`);
          }
        } catch (e) {
          console.log(`   ⚠️  SERP API fallback failed: ${e.message}`);
        }
      }
      
      // If still no articles, try Google search
      if (articles.length === 0) {
        try {
          const googleArticles = await searchGoogleForAuthorArticles(author.name, website, page);
          if (googleArticles.length > 0) {
            articles = googleArticles;
            console.log(`   ✓ Found ${googleArticles.length} articles via Google search fallback`);
          }
        } catch (e) {
          console.log(`   ⚠️  Google search fallback failed: ${e.message}`);
        }
      }
    } else {
      const latestDate = articles[0]?.publishDate || 'N/A';
      console.log(`   ✓ Found ${articles.length} articles (latest: ${latestDate})`);
    }

    await page.close();

    // ALWAYS run NLP Analysis - extract topics from articles, bio, role, or name
    let keywords = [];
    let topicCategories = [];
    let influenceScore = 50;
    let topKeywords = [];
    
    if (articles.length > 0) {
      try {
        // Get all article titles
        const allTitles = articles.map(a => a.title || a.url).filter(t => t && t.length > 10);
        
        if (allTitles.length > 0) {
          // Combine all titles for NLP analysis
          const combinedText = allTitles.join(' ');
          
          // Extract topics from article titles
          topicCategories = categorizeTopics(combinedText);
          
          // Extract keywords
          const nlpAnalysis = analyzeArticleTitles(allTitles);
          if (nlpAnalysis && nlpAnalysis.keywords) {
            keywords = nlpAnalysis.keywords.slice(0, 15).map(k => k.term);
            topKeywords = nlpAnalysis.keywords.slice(0, 5).map(k => k.term);
          }
          
          // Calculate influence
          influenceScore = calculateInfluence({
            articles: articles.length,
            topics: topicCategories,
            socialLinks: {},
            bio: profileData.bio,
            profilePic: null
          });
          
          console.log(`    📊 Topics: ${topicCategories.length > 0 ? topicCategories.join(', ') : 'General'}`);
          console.log(`    🔑 Keywords: ${keywords.length} extracted`);
        }
      } catch (nlpError) {
        console.log(`    ⚠️  NLP analysis failed for ${author.name}: ${nlpError.message}`);
        // Set defaults if NLP fails
        topicCategories = ['General'];
        keywords = [];
        topKeywords = [];
      }
    } else {
      // If no articles, try to infer topics from author name, role, or bio
      try {
        const textForAnalysis = [
          author.name,
          profileData.role,
          profileData.bio
        ].filter(t => t && t.length > 0).join(' ');
        
        if (textForAnalysis.length > 10) {
          topicCategories = categorizeTopics(textForAnalysis);
          if (topicCategories.length === 0) {
            topicCategories = ['General'];
          }
          console.log(`    📊 Inferred topics from profile: ${topicCategories.join(', ')}`);
        } else {
          topicCategories = ['General'];
        }
      } catch (e) {
        topicCategories = ['General'];
      }
    }

    // Ensure all fields are present with defaults
    return {
      name: author.name || 'Unknown',
      outlet: outletName,
      profileUrl: actualProfileUrl || author.profileUrl,
      role: profileData.role || inferRole(author.name) || 'Journalist',
      bio: profileData.bio || null,
      email: profileData.email || null,
      socialLinks: author.socialLinks || {},
      profilePicture: author.profilePicture || null,
      articles: Array.isArray(articles) ? articles : [],
      totalArticles: Array.isArray(articles) ? articles.length : 0,
      keywords: Array.isArray(keywords) ? keywords : [],
      topics: Array.isArray(topicCategories) && topicCategories.length > 0 ? topicCategories : ['General'],
      influenceScore: typeof influenceScore === 'number' ? influenceScore : 50,
      topKeywords: Array.isArray(topKeywords) ? topKeywords : []
    };

  } catch (err) {
    await page.close();
    
    // Return minimal data if profile fails
    return {
      name: author.name || 'Unknown',
      outlet: outletName,
      profileUrl: author.profileUrl || website,
      role: inferRole(author.name) || 'Journalist',
      bio: null,
      email: null,
      socialLinks: {},
      profilePicture: null,
      articles: [],
      totalArticles: 0,
      keywords: [],
      topics: ['General'],
      influenceScore: 50,
      topKeywords: []
    };
  }
}

// ============================================================
// SEARCH SERP API FOR AUTHOR ARTICLES (BYPASSES BLOCKING)
// ============================================================

async function searchSERPAPIForAuthorArticles(authorName, website, customQuery = null) {
  const articles = [];
  
  if (!SERP_API_KEY) {
    return articles;
  }
  
  try {
    const hostname = new URL(website).hostname;
    
    // Try multiple query variations for better results
    const queries = customQuery ? [customQuery] : [
      `site:${hostname} "${authorName}"`,
      `site:${hostname} ${authorName}`,
      `site:${hostname} "${authorName}" article`,
      `site:${hostname} "${authorName}" news`
    ];
    
    const seenUrls = new Set();
    
    for (const query of queries) {
      if (articles.length >= 50) break;
      
      try {
        const response = await axios.get("https://serpapi.com/search.json", {
          params: {
            engine: "google",
            q: query,
            api_key: SERP_API_KEY,
            num: 50, // Get up to 50 results per query
            gl: "in", // India
            hl: "en"
          },
          timeout: 15000
        });
        
        const results = response.data.organic_results || [];
        
        for (const result of results) {
          if (articles.length >= 50) break;
          
          if (!result.link || seenUrls.has(result.link)) continue;
          
          if (result.link.includes(hostname) &&
              result.link.length > 20 &&
              !result.link.includes('/author/') &&
              !result.link.includes('/tag/') &&
              !result.link.includes('/category/') &&
              !result.link.includes('/profile/') &&
              !result.link.includes('/search') &&
              !result.link.includes('/page/')) {
            
            // Extract date from URL if possible
            let publishDate = null;
            const dateMatch = result.link.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//) || 
                             result.link.match(/\/(\d{4})-(\d{1,2})-(\d{1,2})\//);
            if (dateMatch) {
              const year = dateMatch[1];
              const month = String(dateMatch[2]).length === 1 ? '0' + dateMatch[2] : dateMatch[2];
              const day = String(dateMatch[3]).length === 1 ? '0' + dateMatch[3] : dateMatch[3];
              publishDate = `${year}-${month}-${day}`;
            }
            
            articles.push({
              title: result.title || result.snippet || 'Untitled Article',
              url: result.link,
              publishDate: publishDate
            });
            
            seenUrls.add(result.link);
          }
        }
      } catch (queryErr) {
        // Continue with next query if one fails
        continue;
      }
    }
    
  } catch (e) {
    console.log(`    ⚠️  SERP API search failed: ${e.message}`);
  }
  
  return articles;
}

// ============================================================
// SEARCH GOOGLE FOR AUTHOR ARTICLES
// ============================================================

async function searchGoogleForAuthorArticles(authorName, website, page) {
  const articles = [];
  const searchPage = await page.browser().newPage();
  await searchPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
  
  try {
    const hostname = new URL(website).hostname;
    const query = `site:${hostname} "${authorName}"`;
    
    await searchPage.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, {
      waitUntil: 'networkidle2',
      timeout: 15000
    });
    await delay(2000);
    
    const foundArticles = await searchPage.evaluate(() => {
      const articles = [];
      const links = document.querySelectorAll('a[href]');
      const seen = new Set();
      
      for (const link of links) {
        const href = link.href;
        const title = link.textContent?.trim();
        
        if (!href || !title || href.includes('google.com') || seen.has(href)) continue;
        
        // Check if it looks like an article URL
        if (/(news|article|story|report|column|opinion|blog)/i.test(href) && 
            title.length > 15 && title.length < 300) {
          articles.push({ title, url: href });
          seen.add(href);
          if (articles.length >= 15) break;
        }
      }
      
      return articles;
    });
    
    articles.push(...foundArticles);
    await searchPage.close();
  } catch (err) {
    console.log(`    ⚠️  Google search failed: ${err.message}`);
    await searchPage.close();
  }
  
  return articles;
}

// ============================================================
// SEARCH WEBSITE FOR AUTHOR ARTICLES
// ============================================================

async function searchWebsiteForAuthorArticles(authorName, website, page) {
  const articles = [];
  const searchPage = await page.browser().newPage();
  await searchPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
  searchPage.setDefaultTimeout(8000);
  searchPage.setDefaultNavigationTimeout(8000);
  
  try {
    // Try common search patterns - LIMIT to first 2 for speed
    const searchPaths = [
      `/author/${authorName.toLowerCase().replace(/\s+/g, '-')}`,
      `/author/${authorName.toLowerCase().replace(/\s+/g, '_')}`
    ];
    
    for (const path of searchPaths) {
      try {
        const searchUrl = website + path;
        await Promise.race([
          searchPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 8000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
        ]);
            await delay(400); // Minimal delay
        
        // Scroll to load content - FASTER
        for (let i = 0; i < 3; i++) {
          await searchPage.evaluate(() => window.scrollBy(0, window.innerHeight));
          await delay(300);
        }
        
        const foundArticles = await searchPage.evaluate((baseUrl) => {
          const articles = [];
          const seen = new Set();
          const baseUrlObj = new URL(baseUrl);
          const links = document.querySelectorAll('a[href]');
          
          for (const link of links) {
            const href = link.href;
            if (!href || seen.has(href)) continue;
            
            try {
              const url = new URL(href);
              if (url.hostname !== baseUrlObj.hostname) continue;
              
              const pathname = url.pathname;
              const isArticle = 
                /\/\d{4}\/\d{1,2}\/\d{1,2}\/.+/.test(pathname) ||
                /\/\d{4}-\d{2}-\d{2}\/.+/.test(pathname) ||
                /-\d{5,}/.test(pathname) ||
                /\/(article|story|news|post|blog)\/.+/.test(pathname);
              
              if (isArticle && pathname.length > 20) {
                const title = link.textContent?.trim() || 
                             link.querySelector('h1, h2, h3, h4, h5')?.textContent?.trim() || '';
                
                if (title.length >= 15 && title.length < 300) {
                  articles.push({ title: title.substring(0, 250), url: href });
                  seen.add(href);
                  if (articles.length >= 20) break;
                }
              }
            } catch (e) {}
          }
          
          return articles;
        }, website);
        
        articles.push(...foundArticles);
        if (articles.length > 0) break; // Found articles, stop trying other paths
      } catch (err) {
        continue;
      }
    }
    
    await searchPage.close();
  } catch (err) {
    console.log(`    ⚠️  Website search failed: ${err.message}`);
    await searchPage.close();
  }
  
  return articles;
}

// ============================================================
// HELPER: INFER ROLE FROM NAME
// ============================================================

function inferRole(name) {
  if (!name) return 'Journalist';
  const lower = name.toLowerCase();
  if (lower.includes('tech')) return 'Technology Reporter';
  if (lower.includes('sports')) return 'Sports Reporter';
  if (lower.includes('business')) return 'Business Reporter';
  if (lower.includes('entertainment')) return 'Entertainment Reporter';
  if (lower.includes('politics')) return 'Political Reporter';
  if (lower.includes('science')) return 'Science Reporter';
  if (lower.includes('health')) return 'Health Reporter';
  return 'Journalist';
}

// ============================================================
// FIND AUTHOR PROFILE VIA SEARCH ENGINES (FALLBACK)
// ============================================================

async function findAuthorProfileViaSearch(authorName, website, browser) {
  const searchPage = await browser.newPage();
  await searchPage.setUserAgent(getRandomUserAgent());
  
  try {
    const hostname = new URL(website).hostname;
    const query = `site:${hostname} "${authorName}" author profile`;
    
    // Try DuckDuckGo first
    await searchPage.goto(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, {
      waitUntil: 'networkidle2',
      timeout: 15000
    });
    await delay(2000);
    
    const profileUrl = await searchPage.evaluate((baseUrl, authorName) => {
      const links = document.querySelectorAll('a[data-testid="result-title-a"], .result__a, article a');
      const baseUrlObj = new URL(baseUrl);
      
      for (const link of links) {
        const href = link.href;
        if (!href || href.includes('duckduckgo.com')) continue;
        
        try {
          const url = new URL(href);
          if (url.hostname === baseUrlObj.hostname && 
              (url.pathname.includes('/author/') || 
               url.pathname.includes('/profile/') ||
               url.pathname.includes('/journalist/') ||
               url.pathname.includes('/writer/'))) {
            return href;
          }
        } catch (e) {}
      }
      
      return null;
    }, website, authorName);
    
    await searchPage.close();
    
    if (profileUrl) {
      return { profileUrl, name: authorName };
    }
    
    // Fallback to Google
    const googlePage = await browser.newPage();
    await googlePage.setUserAgent(getRandomUserAgent());
    
    try {
      await googlePage.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, {
        waitUntil: 'networkidle2',
        timeout: 15000
      });
      await delay(2000);
      
      const googleProfileUrl = await googlePage.evaluate((baseUrl) => {
        const links = document.querySelectorAll('a[href]');
        const baseUrlObj = new URL(baseUrl);
        
        for (const link of links) {
          const href = link.href;
          if (!href || href.includes('google.com')) continue;
          
          try {
            const url = new URL(href);
            if (url.hostname === baseUrlObj.hostname && 
                (url.pathname.includes('/author/') || 
                 url.pathname.includes('/profile/'))) {
              return href;
            }
          } catch (e) {}
        }
        
        return null;
      }, website);
      
      await googlePage.close();
      
      if (googleProfileUrl) {
        return { profileUrl: googleProfileUrl, name: authorName };
      }
    } catch (e) {
      await googlePage.close();
    }
    
    return null;
    
  } catch (err) {
    await searchPage.close();
    return null;
  }
}

export default scrapeOutletIntelligent;