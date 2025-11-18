import puppeteer from "puppeteer";
import dotenv from "dotenv";
import { analyzeArticleTitles, categorizeTopics, extractKeywords, calculateInfluence } from "../utils/nlpAnalyzer.js";

dotenv.config();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================
// UNIVERSAL INTELLIGENT SCRAPER - NO HARDCODED URLS
// Discovers outlet structure and authors dynamically
// ============================================================

/**
 * Main scraping function - fully dynamic and adaptive
 */
export async function scrapeOutletIntelligent(outletName, maxAuthors = 50) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚀 INTELLIGENT UNIVERSAL SCRAPER`);
  console.log(`📰 Outlet: ${outletName}`);
  console.log(`👥 Target: ${maxAuthors} authors minimum`);
  console.log(`${'='.repeat(80)}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
    defaultViewport: null,
    protocolTimeout: 180000,
  });

  try {
    // Step 1: Discover outlet website automatically
    const website = await detectOutletWebsite(outletName, browser);
    
    if (!website) {
      throw new Error(`Could not detect website for outlet: ${outletName}`);
    }

    console.log(`✅ Detected website: ${website}\n`);

    // Step 2: Analyze outlet structure and discover authors
    const authors = await discoverAuthorsIntelligently(website, outletName, browser, maxAuthors);

    if (authors.length === 0) {
      console.log(`\n❌ No authors discovered for ${outletName}`);
      await browser.close();
      return { error: 'No authors found', outlet: outletName, website };
    }

    // Step 3: Extract detailed data for each author
    console.log(`\n\n${'='.repeat(80)}`);
    console.log(`📊 EXTRACTING DATA FOR ${authors.length} AUTHORS`);
    console.log('='.repeat(80));

    const results = [];
    const PARALLEL_LIMIT = 2;

    for (let i = 0; i < authors.length; i += PARALLEL_LIMIT) {
      const batch = authors.slice(i, Math.min(i + PARALLEL_LIMIT, authors.length));

      console.log(`\n[${'='.repeat(76)}]`);
      console.log(`  Batch ${Math.floor(i / PARALLEL_LIMIT) + 1} (Authors ${i + 1}-${Math.min(i + PARALLEL_LIMIT, authors.length)} of ${authors.length})`);
      console.log(`[${'='.repeat(76)}]`);

      const batchPromises = batch.map(async (author, batchIdx) => {
        const authorNum = i + batchIdx + 1;
        console.log(`\n  [${authorNum}/${authors.length}] Processing: ${author.name}`);

        const data = await extractAuthorData(author, outletName, browser, website);

        if (data) {
          console.log(`  [${authorNum}/${authors.length}] ✅ Done: ${author.name} (${data.totalArticles} articles)`);
          return data;
        } else {
          console.log(`  [${authorNum}/${authors.length}] ⚠️  Skipped: ${author.name}`);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(r => r !== null));

      if (i + PARALLEL_LIMIT < authors.length) {
        await delay(1000);
      }
    }

    await browser.close();

    console.log(`\n\n${'='.repeat(80)}`);
    console.log(`✅ SCRAPING COMPLETE`);
    console.log('='.repeat(80));
    console.log(`📰 Outlet: ${outletName}`);
    console.log(`🌐 Website: ${website}`);
    console.log(`👥 Authors Extracted: ${results.length}/${authors.length}`);
    console.log(`📝 Total Articles: ${results.reduce((sum, r) => sum + r.totalArticles, 0)}`);
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
  console.log(`\n🔍 Detecting website for: ${outletName}...`);
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  try {
    // Strategy 1: Try DuckDuckGo (no CAPTCHA issues)
    console.log(`  📍 Strategy 1: Searching DuckDuckGo...`);
    
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
        console.log(`  ✅ Found via DuckDuckGo: ${ddgWebsite}`);
        await page.close();
        return ddgWebsite;
      }
    } catch (err) {
      console.log(`  ⚠️  DuckDuckGo search failed: ${err.message}`);
    }

    // Strategy 2: Try Google Search
    console.log(`  📍 Strategy 2: Searching Google...`);
    
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
        console.log(`  ✅ Found via Google: ${googleWebsite}`);
        await page.close();
        return googleWebsite;
      }
    } catch (err) {
      console.log(`  ⚠️  Google search failed: ${err.message}`);
    }

    // Strategy 3: Try Bing Search
    console.log(`  📍 Strategy 3: Searching Bing...`);
    
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
        console.log(`  ✅ Found via Bing: ${bingWebsite}`);
        await page.close();
        return bingWebsite;
      }
    } catch (err) {
      console.log(`  ⚠️  Bing search failed: ${err.message}`);
    }

    // Strategy 4: Smart URL construction
    console.log(`  📍 Strategy 4: Trying smart URL construction...`);
    
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
            console.log(`  ✅ Found via URL construction: ${testUrl}`);
            await page.close();
            return testUrl;
          }
        }
      } catch (err) {
        // This URL didn't work, try next
        continue;
      }
    }

    console.log(`  ❌ Could not detect website for "${outletName}"`);
    await page.close();
    return null;

  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
    await page.close();
    return null;
  }
}

// ============================================================
// INTELLIGENTLY DISCOVER AUTHORS
// ============================================================

async function discoverAuthorsIntelligently(website, outletName, browser, limit) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`👥 DISCOVERING AUTHORS INTELLIGENTLY`);
  console.log(`🎯 Target: ${limit} unique journalists`);
  console.log('='.repeat(70));

  const authorsMap = new Map();
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  try {
    // Strategy 1: Check for RSS feeds
    console.log(`\n📡 Strategy 1: Checking for RSS feeds...`);
    const rssAuthors = await discoverFromRSS(website, page, limit);
    rssAuthors.forEach(author => {
      if (!authorsMap.has(author.name.toLowerCase())) {
        authorsMap.set(author.name.toLowerCase(), author);
      }
    });
    console.log(`  ✓ Found ${rssAuthors.length} authors from RSS`);

    // Strategy 2: Find and scrape author directory pages
    if (authorsMap.size < limit) {
      console.log(`\n📄 Strategy 2: Looking for author directory...`);
      const dirAuthors = await discoverFromAuthorDirectory(website, page, limit);
      dirAuthors.forEach(author => {
        if (!authorsMap.has(author.name.toLowerCase()) && authorsMap.size < limit) {
          authorsMap.set(author.name.toLowerCase(), author);
        }
      });
      console.log(`  ✓ Found ${dirAuthors.length} authors from directory`);
    }

    // Strategy 3: Discover section pages and scrape them
    if (authorsMap.size < limit) {
      console.log(`\n📰 Strategy 3: Discovering section pages...`);
      const sections = await discoverSectionPages(website, page);
      console.log(`  ✓ Found ${sections.length} sections`);
      
      for (const sectionUrl of sections) {
        if (authorsMap.size >= limit) break;
        
        console.log(`  📍 Scraping section: ${sectionUrl.split('/').pop() || 'homepage'}`);
        const sectionAuthors = await scrapeArticlesFromPage(sectionUrl, page, limit - authorsMap.size);
        
        sectionAuthors.forEach(author => {
          if (!authorsMap.has(author.name.toLowerCase()) && authorsMap.size < limit) {
            authorsMap.set(author.name.toLowerCase(), author);
          }
        });
      }
      console.log(`  ✓ Total after sections: ${authorsMap.size} authors`);
    }

    // Strategy 4: Scrape homepage articles
    if (authorsMap.size < limit) {
      console.log(`\n🏠 Strategy 4: Scraping homepage articles...`);
      const homeAuthors = await scrapeArticlesFromPage(website, page, limit - authorsMap.size);
      homeAuthors.forEach(author => {
        if (!authorsMap.has(author.name.toLowerCase()) && authorsMap.size < limit) {
          authorsMap.set(author.name.toLowerCase(), author);
        }
      });
      console.log(`  ✓ Found ${homeAuthors.length} authors from homepage`);
    }

    await page.close();

    const uniqueAuthors = Array.from(authorsMap.values());
    console.log(`\n  ✅ Total unique journalists discovered: ${uniqueAuthors.length}`);

    return uniqueAuthors;

  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
    await page.close();
    return [];
  }
}

// ============================================================
// DISCOVER AUTHORS FROM RSS FEEDS
// ============================================================

async function discoverFromRSS(website, page, limit) {
  const authors = [];
  
  // Common RSS paths to try
  const rssPaths = ['/rss', '/rss.xml', '/feed', '/feed.xml', '/feeds/rss', 
                    '/rssfeeds', '/?feed=rss', '/index.xml', '/feeds/news.xml'];
  
  for (const path of rssPaths) {
    try {
      const rssUrl = website + path;
      await page.goto(rssUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      
      // Check if this is actually an RSS feed
      const isRSS = await page.evaluate(() => {
        const text = document.body.textContent;
        return text.includes('<rss') || text.includes('<feed') || text.includes('<?xml');
      });
      
      if (!isRSS) continue;
      
      console.log(`    ✓ Found RSS at ${path}`);
      
      // Extract article URLs
      const articleUrls = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('link, guid'));
        return links
          .map(el => el.textContent.trim())
          .filter(url => url && url.startsWith('http'))
          .slice(0, 50);
      });
      
      // Visit articles to extract authors
      for (const articleUrl of articleUrls) {
        if (authors.length >= limit) break;
        
        try {
          await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
          await delay(300);
          
          const authorInfo = await extractAuthorFromArticle(page, website);
          if (authorInfo && !authors.find(a => a.name === authorInfo.name)) {
            authors.push(authorInfo);
          }
        } catch (e) {
          continue;
        }
      }
      
      if (authors.length > 0) break; // Found working RSS feed
      
    } catch (e) {
      continue;
    }
  }
  
  return authors;
}

// ============================================================
// DISCOVER AUTHORS FROM AUTHOR DIRECTORY
// ============================================================

async function discoverFromAuthorDirectory(website, page, limit) {
  const authors = [];
  
  // Common author directory paths
  const dirPaths = ['/authors', '/team', '/journalists', '/contributors', '/writers', 
                    '/our-team', '/people', '/staff', '/about/team', '/editorial-team'];
  
  for (const path of dirPaths) {
    try {
      const dirUrl = website + path;
      await page.goto(dirUrl, { waitUntil: 'networkidle2', timeout: 12000 });
      
      // Check if page exists and looks like author directory
      const isDirectory = await page.evaluate(() => {
        const text = document.body.textContent.toLowerCase();
        return (text.includes('author') || text.includes('journalist') || text.includes('writer') || text.includes('team')) &&
               document.querySelectorAll('a[href*="/author/"], a[href*="/profile/"], a[href*="/journalist/"]').length > 5;
      });
      
      if (!isDirectory) continue;
      
      console.log(`    ✓ Found author directory at ${path}`);
      
      // Extract all author profile links
      const authorLinks = await page.evaluate(() => {
        const links = [];
        const anchors = document.querySelectorAll('a[href]');
        
        for (const a of anchors) {
          const href = a.href;
          const text = a.textContent?.trim();
          
          if (!href || !text) continue;
          
          // Check if URL looks like author profile
          if (href.includes('/author/') || href.includes('/profile/') || 
              href.includes('/journalist/') || href.includes('/writer/') || 
              href.includes('/reporter/')) {
            
            // Check if text looks like a person's name
            if (text.length > 2 && text.length < 50 && 
                /^[A-Z]/.test(text) && !/^(read|view|more|all|see)/i.test(text)) {
              links.push({ name: text, profileUrl: href });
            }
          }
        }
        
        return links;
      });
      
      console.log(`      Found ${authorLinks.length} author profiles`);
      
      authorLinks.forEach(author => {
        if (authors.length < limit && !authors.find(a => a.name === author.name)) {
          authors.push(author);
        }
      });
      
      if (authors.length > 0) break; // Found working directory
      
    } catch (e) {
      continue;
    }
  }
  
  return authors;
}

// ============================================================
// DISCOVER SECTION PAGES
// ============================================================

async function discoverSectionPages(website, page) {
  const sections = new Set();
  
  try {
    await page.goto(website, { waitUntil: 'networkidle2', timeout: 15000 });
    
    // Extract navigation links that look like sections
    const sectionUrls = await page.evaluate((baseUrl) => {
      const urls = [];
      const links = document.querySelectorAll('nav a, header a, [role="navigation"] a, .menu a');
      
      for (const link of links) {
        const href = link.href;
        const text = link.textContent?.trim().toLowerCase();
        
        if (!href || !text) continue;
        
        // Check if this looks like a section (not homepage, not external)
        const url = new URL(href);
        const baseUrlObj = new URL(baseUrl);
        
        if (url.hostname !== baseUrlObj.hostname) continue;
        if (href === baseUrl || href === baseUrl + '/') continue;
        
        // Common section keywords
        const sectionKeywords = ['news', 'business', 'sports', 'entertainment', 'tech', 
                                 'world', 'national', 'india', 'politics', 'lifestyle',
                                 'opinion', 'health', 'science', 'education', 'city'];
        
        const isSectionLink = sectionKeywords.some(keyword => 
          text.includes(keyword) || href.toLowerCase().includes('/' + keyword)
        );
        
        if (isSectionLink && !href.includes('#') && !href.includes('/tag/') && !href.includes('/category/')) {
          urls.push(href);
        }
      }
      
      return urls;
    }, website);
    
    sectionUrls.forEach(url => sections.add(url));
    
  } catch (e) {
    console.log(`    ⚠️  Could not discover sections: ${e.message}`);
  }
  
  return Array.from(sections).slice(0, 10); // Limit to top 10 sections
}

// ============================================================
// SCRAPE ARTICLES FROM ANY PAGE
// ============================================================

async function scrapeArticlesFromPage(pageUrl, page, limit) {
  const authors = [];
  
  try {
    await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 15000 });
    
    // Scroll MORE aggressively to load content
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await delay(800);
    }
    
    await delay(2000); // Wait for lazy loading
    
    // Find all article links on the page - MUCH MORE COMPREHENSIVE
    const articleUrls = await page.evaluate(() => {
      const urls = new Set();
      const links = document.querySelectorAll('a[href]');
      
      for (const link of links) {
        const href = link.href;
        
        if (!href || href === '#') continue;
        
        // Skip navigation/footer links
        if (link.closest('nav, header, footer, [role="navigation"]')) continue;
        
        // Skip non-article links - BUT BE MORE PERMISSIVE
        if (href.includes('/tag/') || href.includes('/category/') || 
            href.includes('/author/') || href.includes('/profile/') ||
            href.includes('/page/') || href.includes('facebook') || 
            href.includes('twitter') || href.includes('youtube') ||
            href.includes('instagram') || href.includes('whatsapp')) continue;
        
        try {
          const url = new URL(href);
          const pathname = url.pathname;
          
          // MUCH MORE PERMISSIVE article detection
          const looksLikeArticle = 
            /\/\d{4}\/\d{1,2}\/\d{1,2}\/.+/.test(pathname) ||  // Date-based
            /\/\d{4}-\d{2}-\d{2}\/.+/.test(pathname) ||         // Alternative date
            /-\d{5,}/.test(pathname) ||                         // Has ID (5+ digits)
            /\d{5,}\.html/.test(pathname) ||                    // HTML with ID
            /\/(article|story|news|post|blog)\/.+/.test(pathname) || // Article path
            /\/(national|world|india|business|sports|entertainment|tech|science|health|lifestyle|opinion)\/.+/.test(pathname) || // Section + content
            (pathname.includes('/news') && pathname.length > 20) || // News with substantial path
            (/\d{5,}/.test(pathname) && pathname.length > 15);  // Has ID and substantial
          
          const hasDepth = pathname.split('/').filter(p => p).length >= 2;
          const notTooShort = pathname.length > 15;
          
          if (looksLikeArticle && hasDepth && notTooShort) {
            urls.add(href);
            if (urls.size >= 100) break; // Check more articles
          }
        } catch (e) {}
      }
      
      return Array.from(urls);
    });
    
    console.log(`    → Found ${articleUrls.length} article URLs`);
    
    // Visit each article and extract author - with BETTER error handling
    let checked = 0;
    for (const articleUrl of articleUrls) {
      if (authors.length >= limit) break;
      if (checked >= 100) break; // Check up to 100 articles
      
      checked++;
      
      try {
        await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await delay(500);
        
        const authorInfo = await extractAuthorFromArticle(page, pageUrl);
        if (authorInfo && !authors.find(a => a.name === authorInfo.name)) {
          authors.push(authorInfo);
          console.log(`      ✓ Found author: ${authorInfo.name}`);
        }
      } catch (e) {
        continue;
      }
    }
    
  } catch (e) {
    console.log(`    ⚠️  Page scraping failed: ${e.message}`);
  }
  
  return authors;
}

// ============================================================
// EXTRACT AUTHOR FROM ARTICLE PAGE (UNIVERSAL)
// ============================================================

async function extractAuthorFromArticle(page, baseUrl) {
  return await page.evaluate((base) => {
    let authorName = null;
    let authorUrl = null;
    
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
          
          if (authorName && authorName.length >= 3 && authorName.length < 60 &&
              !authorName.toLowerCase().includes('google llc')) {
            // Only use constructed URL if we don't have a real one
            if (!authorUrl || !authorUrl.startsWith('http')) {
              const slug = authorName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\u0900-\u097F-]/g, '');
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
      '[class*="writer"] a'
    ];
    
    for (const selector of authorLinkSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const name = element.textContent?.trim();
        const href = element.href;
        
        if (name && name.length >= 3 && name.length < 60 && href &&
            /^[A-Za-z\u0900-\u097F]/.test(name) && 
            !/^(by|posted|read|view|more|share|follow|click|see|all|edit|profile|login|subscribe)/i.test(name)) {
          // This is the ACTUAL profile URL from the website
          return { name, profileUrl: href };
        }
      }
    }
    
    // Method 3: Meta Tags (Very reliable)
    const metaAuthor = document.querySelector('meta[name="author"], meta[property="author"]');
    if (metaAuthor && metaAuthor.content) {
      const name = metaAuthor.content.trim();
      if (name.length >= 3 && name.length < 60 && 
          !/^(admin|user|google)/i.test(name)) {
        // No actual profile URL from meta, construct one
        const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\u0900-\u097F-]/g, '');
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
      '.post-author'
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
          .replace(/^(by|written by|posted by|author:?|द्वारा|लेखक:?|লেখক:?)\s+/i, '')
          .replace(/\s+(reporter|correspondent|journalist|लेखक|संवाददाता)$/i, '')
          .trim();
        
        // Validate
        if (name.length >= 3 && name.length < 60 &&
            /^[A-Za-z\u0900-\u097F\u0980-\u09FF]/.test(name) && // Allow Hindi, Bengali
            !/\d{2}:\d{2}/.test(name) &&
            !/\d{4}/.test(name) &&
            !/(updated|published|posted|edited|ago|am|pm|ist|gmt|minutes|hours|days)/i.test(name)) {
          
          const digitCount = (name.match(/\d/g) || []).length;
          if (digitCount < name.length * 0.2) {
            // No actual profile URL found, construct one
            const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\u0900-\u097F-]/g, '');
            const baseUrlObj = new URL(base);
            const profileUrl = `${baseUrlObj.origin}/author/${slug}`;
            return { name, profileUrl };
          }
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
        /(?:By|द्वारा|লিখেছেন)\s+([\u0900-\u097F]+(?:\s+[\u0900-\u097F]+){1,3})/,
        /^([A-Z][a-z]+\s+[A-Z][a-z]+)\s*\|/m
      ];
      
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          const name = match[1].trim();
          if (name.length >= 5 && name.length < 50 &&
              !/(updated|published|posted|news|desk)/i.test(name)) {
            // No actual profile URL found, construct one
            const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\u0900-\u097F-]/g, '');
            const baseUrlObj = new URL(base);
            const profileUrl = `${baseUrlObj.origin}/author/${slug}`;
            return { name, profileUrl };
          }
        }
      }
    }
    
    return null;
  }, baseUrl);
}

// ============================================================
// FAST ARTICLE EXTRACTION
// ============================================================

async function extractAuthorArticlesFast(page, website) {
  try {
    // Scroll to load articles
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
      await delay(400);
    }
    
    await delay(1000); // Wait for content to load
    
    const articles = await page.evaluate((baseUrl) => {
      const articlesData = [];
      const seenUrls = new Set();
      const baseUrlObj = new URL(baseUrl);
      
      // STEP 1: Find article containers first (more accurate)
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
        '.news-card',
        '.story-card',
        '.article-card'
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
            
            // Validate it's actually an article URL
            const isArticle =
              /\/\d{4}\/\d{1,2}\/\d{1,2}\/.+/.test(pathname) ||
              /\/\d{4}-\d{2}-\d{2}\/.+/.test(pathname) ||
              /-\d{5,}/.test(pathname) ||
              /\d{8,}\.html/.test(pathname) ||
              /\/(article|story|news|post|blog)\/.+/.test(pathname);
            
            if (!isArticle || pathname.length < 20) continue;
            
            // Extract title properly
            let title = '';
            
            // Try heading in container first (most accurate)
            const heading = container.querySelector('h1, h2, h3, h4, h5, [class*="title"], [class*="headline"]');
            if (heading) {
              title = heading.textContent?.trim();
            }
            
            // Fallback to link text
            if (!title || title.length < 15) {
              title = link.textContent?.trim();
            }
            
            // Clean title
            if (title) {
              title = title.replace(/\s+/g, ' ').trim();
              // Remove "Read more", "Continue reading" etc
              title = title.replace(/^(read more|continue reading|view|click)[\s:]/i, '');
            }
            
            // Validate title
            if (title && title.length >= 15 && title.length < 300 &&
                !/^(home|menu|search|login|subscribe|share|follow|next|previous|back|close)/i.test(title)) {
              
              articlesData.push({
                title: title.substring(0, 250),
                url: href,
                publishDate: null
              });
              
              seenUrls.add(href);
              foundInContainers = true;
              
              if (articlesData.length >= 25) break;
            }
          } catch (e) {}
        }
        
        if (articlesData.length >= 25) break;
      }
      
      // STEP 2: If containers didn't work, try all links (but more carefully)
      if (!foundInContainers || articlesData.length < 5) {
        const allLinks = document.querySelectorAll('a[href]');
        
        for (const link of allLinks) {
          const href = link.href;
          
          if (!href || href === '#' || seenUrls.has(href)) continue;
          
          // Skip navigation
          if (link.closest('nav, header, footer, aside, [role="navigation"]')) continue;
          
          // Skip non-article links
          if (href.includes('/author/') || href.includes('/profile/') || 
              href.includes('/tag/') || href.includes('/category/') ||
              href.includes('/search') || href.includes('/page/') ||
              href.includes('facebook') || href.includes('twitter') || 
              href.includes('instagram') || href.includes('whatsapp') ||
              href.includes('youtube') || href.includes('mailto:')) continue;
          
          try {
            const url = new URL(href);
            if (url.hostname !== baseUrlObj.hostname) continue;
            
            const pathname = url.pathname;
            
            // Strict article validation
            const isArticle =
              /\/\d{4}\/\d{1,2}\/\d{1,2}\/.{15,}/.test(pathname) ||
              /-\d{6,}/.test(pathname) ||
              /\d{8,}\.html/.test(pathname) ||
              (/\/(article|story|news|post)\/.{20,}/.test(pathname));
            
            if (!isArticle || pathname.length < 25) continue;
            
            // Get title
            let title = link.textContent?.trim() || link.getAttribute('title') || '';
            
            // Try to find title in parent
            if (!title || title.length < 15) {
              const parent = link.closest('article, [class*="article"], [class*="story"], [class*="post"], [class*="content"]');
              if (parent) {
                const heading = parent.querySelector('h1, h2, h3, h4, h5, [class*="title"], [class*="headline"]');
                if (heading) title = heading.textContent?.trim();
              }
            }
            
            // Clean and validate
            if (title) {
              title = title.replace(/\s+/g, ' ').trim();
              title = title.replace(/^(read more|continue|view|click)[\s:]/i, '');
              
              if (title.length >= 15 && title.length < 300 &&
                  !/^(home|menu|search|login|subscribe|share|follow|next|previous|back|close)/i.test(title)) {
                
                articlesData.push({
                  title: title.substring(0, 250),
                  url: href,
                  publishDate: null
                });
                
                seenUrls.add(href);
                
                if (articlesData.length >= 25) break;
              }
            }
          } catch (e) {}
        }
      }
      
      return articlesData;
    }, website);
    
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
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  try {
    // Load profile page - with error handling for invalid URLs
    let profileLoaded = false;
    let actualProfileUrl = author.profileUrl;
    
    try {
      const response = await page.goto(author.profileUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 10000
      });
      
      // Check if page actually exists (not 404)
      if (response && response.status() === 200) {
        profileLoaded = true;
        actualProfileUrl = page.url(); // Get actual URL after any redirects
      }
    } catch (profileError) {
      console.log(`    ⚠️  Profile page failed for ${author.name}: ${profileError.message}`);
      // Try to find author page from main website
      try {
        await page.goto(website, { waitUntil: 'domcontentloaded', timeout: 8000 });
        
        // Search for author link on homepage
        const foundProfileUrl = await page.evaluate((authorName) => {
          const links = document.querySelectorAll('a[href*="/author/"], a[href*="/profile/"], a[href*="/journalist/"]');
          for (const link of links) {
            if (link.textContent?.trim().toLowerCase() === authorName.toLowerCase()) {
              return link.href;
            }
          }
          return null;
        }, author.name);
        
        if (foundProfileUrl) {
          await page.goto(foundProfileUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
          actualProfileUrl = foundProfileUrl;
          profileLoaded = true;
        }
      } catch (e) {}
    }

    // Extract profile info
    const profileData = await page.evaluate(() => {
      const data = { bio: null, role: null, email: null };
      
      // Bio extraction
      const bioEl = document.querySelector('.bio, .author-bio, .description, [itemprop="description"], [class*="bio"]');
      if (bioEl) {
        const text = bioEl.textContent?.trim();
        if (text && text.length > 20 && text.length < 1000) {
          data.bio = text;
        }
      }
      
      // Role extraction
      const roleEl = document.querySelector('.role, .title, .position, .designation, [itemprop="jobTitle"], [class*="role"]');
      if (roleEl) data.role = roleEl.textContent?.trim();
      
      // Email extraction
      const emailMatch = document.body.innerText.match(/([a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/);
      if (emailMatch && !emailMatch[1].includes('@example.') && emailMatch[1].length < 50) {
        data.email = emailMatch[1];
      }
      
      return data;
    });

    // Extract articles
    const articles = await extractAuthorArticlesFast(page, website);

    await page.close();

    // ALWAYS run NLP Analysis if we have articles
    let keywords = [];
    let topicCategories = [];
    let influenceScore = 50;
    let topKeywords = [];
    
    if (articles.length > 0) {
      try {
        // Get all article titles
        const allTitles = articles.map(a => a.title).filter(t => t && t.length > 10);
        
        if (allTitles.length > 0) {
          // Combine all titles for NLP analysis
          const combinedText = allTitles.join(' ');
          
          // Extract topics
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
        }
      } catch (nlpError) {
        console.log(`    ⚠️  NLP analysis failed for ${author.name}: ${nlpError.message}`);
        // Set defaults if NLP fails
        topicCategories = ['General'];
        keywords = [];
        topKeywords = [];
      }
    }

    return {
      name: author.name,
      outlet: outletName,
      profileUrl: actualProfileUrl, // Use actual URL after redirects
      role: profileData.role || inferRole(author.name),
      bio: profileData.bio,
      email: profileData.email,
      socialLinks: {},
      profilePicture: null,
      articles: articles,
      totalArticles: articles.length,
      keywords: keywords,
      topics: topicCategories,
      influenceScore: influenceScore,
      topKeywords: topKeywords
    };

  } catch (err) {
    await page.close();
    
    // Return minimal data if profile fails
    return {
      name: author.name,
      outlet: outletName,
      profileUrl: author.profileUrl, // Keep original URL even if failed
      role: inferRole(author.name),
      bio: null,
      email: null,
      socialLinks: {},
      profilePicture: null,
      articles: [],
      totalArticles: 0,
      keywords: [],
      topics: [],
      influenceScore: 50,
      topKeywords: []
    };
  }
}

// ============================================================
// HELPER: INFER ROLE FROM NAME
// ============================================================

function inferRole(name) {
  const lower = name.toLowerCase();
  if (lower.includes('desk')) return 'News Desk';
  if (lower.includes('bureau')) return 'Bureau';
  if (lower.includes('tech')) return 'Technology Reporter';
  if (lower.includes('sports')) return 'Sports Reporter';
  if (lower.includes('business')) return 'Business Reporter';
  if (lower.includes('entertainment')) return 'Entertainment Reporter';
  if (lower.includes('politics')) return 'Political Reporter';
  return 'Journalist';
}

export default scrapeOutletIntelligent;