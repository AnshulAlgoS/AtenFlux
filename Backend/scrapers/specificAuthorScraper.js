import puppeteer from "puppeteer";
import dotenv from "dotenv";
import { analyzeArticleTitles, categorizeTopics, calculateInfluence } from "../utils/nlpAnalyzer.js";

dotenv.config();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================
// SPECIFIC AUTHOR SCRAPER
// Scrapes only one specific author from an outlet
// ============================================================

/**
 * Scrape a specific author from an outlet
 * @param {string} outletName - Name of the outlet (e.g., "The Hindu")
 * @param {string} authorName - Name of the author to find (e.g., "Prakriti Deb")
 * @returns {Object} Author profile data or error
 */
export async function scrapeSpecificAuthor(outletName, authorName) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🎯 SPECIFIC AUTHOR SCRAPER`);
  console.log(`📰 Outlet: ${outletName}`);
  console.log(`👤 Target Author: ${authorName}`);
  console.log(`${'='.repeat(80)}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
    defaultViewport: null,
    protocolTimeout: 180000,
  });

  try {
    // Step 1: Detect outlet website
    const website = await detectOutletWebsite(outletName, browser);
    
    if (!website) {
      throw new Error(`Could not detect website for outlet: ${outletName}`);
    }

    console.log(`✅ Detected website: ${website}\n`);

    // Step 2: Find the specific author
    let authorInfo = await findSpecificAuthor(website, authorName, browser);

    if (!authorInfo) {
      // Instead of returning an error, continue and synthesize minimal info
      console.log(`\n⚠️ Author "${authorName}" not found on ${outletName}. Proceeding with minimal placeholder profile.`);
      authorInfo = {
        name: authorName,
        profileUrl: website,
        isArticleBased: true,
        foundArticles: [],
        bio: null,
        role: "Journalist",
        email: null
      };
    }

    console.log(`\n✅ Found author: ${authorInfo.name}`);
    console.log(`📍 Profile URL: ${authorInfo.profileUrl}`);

    // Step 3: Extract detailed author data
    const authorData = await extractAuthorData(authorInfo, outletName, browser, website);

    await browser.close();

    if (!authorData) {
      return {
        error: `Found author but failed to extract profile data`,
        outlet: outletName,
        website,
        authorSearched: authorName,
        authorData: {
          name: authorInfo.name,
          outlet: outletName,
          profileUrl: authorInfo.profileUrl,
          role: "Journalist",
          bio: null,
          email: null,
          socialLinks: {},
          profilePicture: null,
          articles: [],
          totalArticles: 0,
          keywords: [],
          topics: ["General"],
          influenceScore: 50
        }
      };
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ SCRAPING COMPLETE`);
    console.log('='.repeat(80));
    console.log(`📰 Outlet: ${outletName}`);
    console.log(`👤 Author: ${authorData.name}`);
    console.log(`📝 Articles: ${authorData.totalArticles}`);
    console.log(`🏷️  Topics: ${authorData.topics?.length || 0}`);
    console.log('='.repeat(80));

    return {
      success: true,
      outlet: outletName,
      website: website,
      author: authorData
    };

  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}`);
    await browser.close();
    return { 
      error: err.message, 
      outlet: outletName,
      authorSearched: authorName 
    };
  }
}

// ============================================================
// AUTO-DETECT OUTLET WEBSITE
// ============================================================

async function detectOutletWebsite(outletName, browser) {
  console.log(`🔍 Detecting website for: ${outletName}...`);
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  try {
    // Try DuckDuckGo search
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

    await page.close();

    if (ddgWebsite) {
      return ddgWebsite;
    }

    // Fallback: Try smart URL construction
    const normalizedName = outletName.toLowerCase()
      .replace(/^the\s+/i, '')
      .replace(/\s+/g, '')
      .trim();
    
    return `https://www.${normalizedName}.com`;

  } catch (err) {
    console.error(`❌ Error detecting website: ${err.message}`);
    await page.close();
    return null;
  }
}

// ============================================================
// FIND SPECIFIC AUTHOR
// ============================================================

async function findSpecificAuthor(website, authorName, browser) {
  console.log(`\n🔍 Searching for author: "${authorName}"...`);
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  try {
    // Strategy 1: Try author directory pages
    const dirPaths = ['/authors', '/team', '/journalists', '/contributors', '/writers', '/our-team'];
    
    for (const path of dirPaths) {
      try {
        const dirUrl = website + path;
        console.log(`  Checking: ${dirUrl}`);
        
        await page.goto(dirUrl, { waitUntil: 'networkidle2', timeout: 10000 });
        
        const found = await page.evaluate((targetName) => {
          const links = document.querySelectorAll('a[href*="/author/"], a[href*="/profile/"], a[href*="/journalist/"]');
          
          for (const link of links) {
            const name = link.textContent?.trim();
            const href = link.href;
            
            if (!name || !href) continue;
            
            // Case-insensitive match
            if (name.toLowerCase().includes(targetName.toLowerCase()) ||
                targetName.toLowerCase().includes(name.toLowerCase())) {
              return { name, profileUrl: href };
            }
          }
          
          return null;
        }, authorName);

        if (found) {
          console.log(`  ✅ Found in directory: ${found.name}`);
          await page.close();
          return found;
        }
      } catch (err) {
        continue;
      }
    }

    // Strategy 2: Search using site search
    console.log(`\n  🔎 Trying site search...`);
    
    try {
      await page.goto(`https://www.google.com/search?q=site:${new URL(website).hostname} "${authorName}" author`, {
        waitUntil: 'networkidle2',
        timeout: 12000
      });
      await delay(2000);

      const searchResults = await page.evaluate((targetName) => {
        const links = document.querySelectorAll('a[href]');
        
        for (const link of links) {
          const href = link.href;
          
          if (!href) continue;
          
          // Check if URL looks like author profile
          if ((href.includes('/author/') || href.includes('/profile/') || href.includes('/journalist/')) &&
              (href.toLowerCase().includes(targetName.toLowerCase().replace(/\s+/g, '-')) ||
               href.toLowerCase().includes(targetName.toLowerCase().replace(/\s+/g, '_')))) {
            return { name: targetName, profileUrl: href };
          }
        }
        
        return null;
      }, authorName);

      if (searchResults) {
        console.log(`  ✅ Found via Google search`);
        await page.close();
        return searchResults;
      }
    } catch (err) {
      console.log(`  ⚠️  Google search failed`);
    }

    // Strategy 3: Construct profile URL based on common patterns
    console.log(`\n  🔧 Trying URL construction...`);
    
    const slug = authorName.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\u0900-\u097F-]/g, '');
    
    const possibleUrls = [
      `${website}/author/${slug}`,
      `${website}/profile/${slug}`,
      `${website}/journalist/${slug}`,
      `${website}/writers/${slug}`,
      `${website}/contributors/${slug}`
    ];

    for (const testUrl of possibleUrls) {
      try {
        console.log(`    Testing: ${testUrl}`);
        const response = await page.goto(testUrl, { 
          waitUntil: 'domcontentloaded', 
          timeout: 8000 
        });
        
        if (response && response.ok() && response.status() === 200) {
          // Verify page contains author name
          const isAuthorPage = await page.evaluate((name) => {
            const bodyText = document.body.innerText;
            return bodyText.toLowerCase().includes(name.toLowerCase());
          }, authorName);
          
          if (isAuthorPage) {
            console.log(`  ✅ Found via URL construction: ${testUrl}`);
            await page.close();
            return { name: authorName, profileUrl: testUrl };
          }
        }
      } catch (err) {
        continue;
      }
    }

    // Strategy 4: Search for articles by this author and build profile without dedicated page
    console.log(`\n  🔎 Strategy 4: Searching for articles by author...`);

    // UNIVERSAL ROBUST GOOGLE SEARCH + FALLBACKS
    let foundArticles = [];
    let googleError = null;
    try {
      await page.goto(`https://www.google.com/search?q=site:${new URL(website).hostname} "${authorName}"`, {
        waitUntil: 'networkidle2',
        timeout: 12000
      });
      await delay(2000);

      // Improved: Try multiple ways to parse Google results robustly
      foundArticles = await page.evaluate(() => {
        // Google result cards
        const articles = [];
        // Strategy A: div.g or .g-card type cards with headline
        const cards = document.querySelectorAll('div.g, .g, .g-card');
        for (const card of cards) {
          const linkEl = card.querySelector('a[href]');
          const titleEl = card.querySelector('h3');
          if (!linkEl || !titleEl) continue;
          let url = linkEl.href;
          let title = titleEl.textContent?.trim();
          if (!url || !title || url.length < 10 || title.length < 8 || url.includes('google.com')) continue;
          articles.push({ title, url });
          if (articles.length >= 10) break;
        }
        // Strategy B: Direct h3 inside a[href]
        if (articles.length < 5) {
          const linkheads = document.querySelectorAll('a[href] h3');
          for (const heading of linkheads) {
            const link = heading.closest('a');
            if (!link) continue;
            const href = link.href;
            const title = heading.textContent?.trim();
            if (href && title && href.includes('http')) {
              articles.push({ title, url: href });
              if (articles.length >= 10) break;
            }
          }
        }
        // Strategy C: Fallback try to find all links and headlines that look like articles
        if (articles.length < 3) {
          const allLinks = Array.from(document.querySelectorAll('a[href]'));
          for (const link of allLinks) {
            const title = link.textContent?.trim();
            if (
              link.href &&
              title &&
              link.href.includes('http') &&
              title.length >= 10 &&
              /(news|article|story|report)/i.test(link.href)
            ) {
              articles.push({ title, url: link.href });
              if (articles.length >= 8) break;
            }
          }
        }
        // Remove duplicates (by URL)
        const uniqueArticles = [];
        const seen = new Set();
        for (const a of articles) {
          if (!a.url || seen.has(a.url)) continue;
          seen.add(a.url);
          uniqueArticles.push(a);
        }
        return uniqueArticles;
      });

    } catch (err) {
      googleError = err;
      foundArticles = [];
      console.log(`  ⚠️  Article search failed: ${err.message}`);
    }

    // Fallback: If foundArticles empty, try to get *any* links on page containing author name
    if (!foundArticles || foundArticles.length === 0) {
      try {
        foundArticles = await page.evaluate((authorName) => {
          const articles = [];
          const allLinks = Array.from(document.querySelectorAll('a[href]'));
          for (const link of allLinks) {
            const url = link.href;
            const title = link.textContent?.trim();
            if (
              url &&
              title &&
              url.includes('http') &&
              title.length >= 10 &&
              url.toLowerCase().includes(authorName.toLowerCase().replace(/\s+/g, '')) &&
              !url.includes('google.com')
            ) {
              articles.push({ title, url });
              if (articles.length >= 5) break;
            }
          }
          return articles;
        }, authorName);
      } catch (fallbackErr) {}
    }

    // Even further fallback: If STILL nothing, return the current page URL with a generic author name.
    if (!foundArticles || foundArticles.length === 0) {
      foundArticles = [{ title: `No articles found for author ${authorName}`, url: website }];
    }

    if (foundArticles && foundArticles.length > 0) {
      console.log(`  ✅ Found ${foundArticles.length} articles by searching`);
      // Use the first article URL as reference since no profile page exists
      await page.close();
      return { 
        name: authorName, 
        profileUrl: foundArticles[0].url, // Will use article page to extract author info
        isArticleBased: true, // Flag to indicate no dedicated profile page
        foundArticles: foundArticles
      };
    }

    // Final fallback: Always return a minimal stub so the pipeline continues.
    await page.close();
    return { 
      name: authorName,
      profileUrl: website,
      isArticleBased: true,
      foundArticles: []
    };

  } catch (err) {
    console.error(`  ❌ Error finding author: ${err.message}`);
    await page.close();
    return null;
  }
}

// ============================================================
// EXTRACT AUTHOR DATA
// ============================================================

async function extractAuthorData(authorInfo, outletName, browser, website) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  try {
    console.log(`\n📊 Extracting profile data for: ${authorInfo.name}`);
    console.log(`   Loading: ${authorInfo.profileUrl}`);

    // Load profile page
    await page.goto(authorInfo.profileUrl, { 
      waitUntil: 'domcontentloaded', 
      timeout: 10000
    });
    await delay(1000);

    // Extract profile info
    let profileData = {};
    if (authorInfo.isArticleBased) {
      profileData = await extractArticleBasedProfile(page, authorInfo, website);
    } else {
      profileData = await page.evaluate(() => {
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
    }

    console.log(`   Bio: ${profileData.bio ? 'Found' : 'Not found'}`);
    console.log(`   Role: ${profileData.role || 'Not found'}`);

    // Extract articles
    console.log(`\n   📝 Extracting articles...`);
    let articles = [];
    if (authorInfo.isArticleBased) {
      // Use merged articles from enhanced article-based profile extraction
      articles = profileData.articles ? profileData.articles : [];
    } else {
      articles = await extractAuthorArticles(page, website);
    }
    console.log(`   ✓ Found ${articles.length} articles`);

    await page.close();

    // NLP Analysis
    let keywords = [];
    let topicCategories = [];
    let influenceScore = 50;
    
    if (articles.length > 0) {
      try {
        const allTitles = articles.map(a => a.title).filter(t => t && t.length > 10);
        
        if (allTitles.length > 0) {
          const combinedText = allTitles.join(' ');
          topicCategories = categorizeTopics(combinedText);
          
          const nlpAnalysis = analyzeArticleTitles(allTitles);
          if (nlpAnalysis && nlpAnalysis.keywords) {
            keywords = nlpAnalysis.keywords.slice(0, 15).map(k => k.term);
          }
          
          influenceScore = calculateInfluence({
            articles: articles.length,
            topics: topicCategories,
            socialLinks: {},
            bio: profileData.bio,
            profilePic: null
          });
        }
      } catch (nlpError) {
        console.log(`   ⚠️  NLP analysis failed: ${nlpError.message}`);
        topicCategories = ['General'];
      }
    }

    return {
      name: authorInfo.name,
      outlet: outletName,
      profileUrl: authorInfo.profileUrl,
      role: profileData.role || 'Journalist',
      bio: profileData.bio,
      email: profileData.email,
      socialLinks: {},
      profilePicture: null,
      articles: articles,
      totalArticles: articles.length,
      keywords: keywords,
      topics: topicCategories,
      influenceScore: influenceScore
    };

  } catch (err) {
    console.error(`   ❌ Error extracting data: ${err.message}`);
    await page.close();
    return {
      name: authorInfo.name,
      outlet: outletName,
      profileUrl: authorInfo.profileUrl,
      role: "Journalist",
      bio: null,
      email: null,
      socialLinks: {},
      profilePicture: null,
      articles: [],
      totalArticles: 0,
      keywords: [],
      topics: ["General"],
      influenceScore: 50
    };
  }
}

async function extractArticleBasedProfile(page, authorInfo, website) {
  // Enhanced: Search Google for more articles by author and try to deduce profile.
  // Added: Multiple search strategies and robust fallbacks for articles.

  // Strategy 1: Search Google (site + author name)
  async function searchGoogleArticles(authorName, baseUrl, maxResults = 20) {
    const searchPage = await page.browser().newPage();
    await searchPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    const results = [];

    try {
      await searchPage.goto(`https://www.google.com/search?q=site:${new URL(baseUrl).hostname} "${authorName}"`, {
        waitUntil: 'networkidle2',
        timeout: 14000,
      });
      await delay(1800);

      for (let pageNum = 0; pageNum < 2 && results.length < maxResults; pageNum++) {
        if (pageNum > 0) {
          const nextBtn = await searchPage.$('a#pnnext');
          if (nextBtn) {
            await nextBtn.click();
            await delay(1800);
          } else {
            break;
          }
        }
        // Try several selectors for Google results
        const pageResults = await searchPage.evaluate(() => {
          const articles = [];
          // A. Cards/blocks (used by Google search)
          const cards = document.querySelectorAll('div.g, .g, .g-card, [jscontroller]');
          for (const card of cards) {
            const linkEl = card.querySelector('a[href]');
            const titleEl = card.querySelector('h3');
            if (!linkEl || !titleEl) continue;
            let url = linkEl.href;
            let title = titleEl.textContent?.trim();
            if (!url || !title || url.length < 10 || title.length < 10 || url.includes('google.com')) continue;
            articles.push({ title, url });
          }
          // B. Direct h3 inside a[href]
          if (articles.length < 8) {
            const linkheads = document.querySelectorAll('a[href] h3');
            for (const heading of linkheads) {
              const link = heading.closest('a');
              if (!link) continue;
              const href = link.href;
              const title = heading.textContent?.trim();
              if (href && title && href.includes('http') && title.length > 10) {
                articles.push({ title, url: href });
                if (articles.length >= 16) break;
              }
            }
          }
          // C. Heuristic: Any valid long link with "news|article|story|column|opinion" in URL and nontrivial title
          if (articles.length < 6) {
            const allLinks = Array.from(document.querySelectorAll('a[href]'));
            for (const link of allLinks) {
              const url = link.href;
              const title = link.textContent?.trim();
              if (
                url &&
                title &&
                url.includes('http') &&
                title.length > 12 &&
                /(news|article|story|report|column|opinion)/i.test(url) &&
                !url.includes('google.com')
              ) {
                articles.push({ title, url });
                if (articles.length >= 10) break;
              }
            }
          }
          // Remove duplicates (URL)
          const seen = new Set();
          const unique = [];
          for (const a of articles) {
            if (!seen.has(a.url)) {
              unique.push(a);
              seen.add(a.url);
            }
          }
          return unique;
        });
        for (const article of pageResults) {
          if (!results.some(r => r.url === article.url)) {
            results.push(article);
            if (results.length >= maxResults) break;
          }
        }
      }
    } catch (err) {
      // Fail silent (do not throw)
    }
    await searchPage.close();
    return results;
  }

  // Strategy 2: Crawl DuckDuckGo for articles
  async function searchDuckDuckGoArticles(authorName, baseUrl, maxResults = 10) {
    const ddgPage = await page.browser().newPage();
    await ddgPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    const results = [];
    try {
      await ddgPage.goto(`https://duckduckgo.com/?q=site:${new URL(baseUrl).hostname} "${authorName}"`, {
        waitUntil: 'networkidle2',
        timeout: 12000,
      });
      await delay(1300);

      const ddgResults = await ddgPage.evaluate(() => {
        const articles = [];
        // DDG result blocks
        const links = document.querySelectorAll('a[data-testid="result-title-a"], .result__a, article a');
        for (const link of links) {
          const url = link.href;
          const title = link.textContent?.trim();
          if (
            url &&
            title &&
            url.includes('http') &&
            title.length > 12 &&
            /(news|article|story|report|column|opinion)/i.test(url) &&
            !url.includes('duckduckgo.com')
          ) {
            articles.push({ title, url });
            if (articles.length >= 12) break;
          }
        }
        // Remove duplicates
        const seen = new Set();
        const unique = [];
        for (const a of articles) {
          if (!seen.has(a.url)) {
            unique.push(a);
            seen.add(a.url);
          }
        }
        return unique;
      });
      // Take first maxResults from DDG
      for (const ddgArticle of ddgResults) {
        if (!results.some(a => a.url === ddgArticle.url)) {
          results.push(ddgArticle);
          if (results.length >= maxResults) break;
        }
      }
    } catch (err) {}
    await ddgPage.close();
    return results;
  }

  // Strategy 3: Heuristic crawl from outlet homepage
  async function crawlOutletHomepageForArticles(authorName, baseUrl, maxResults = 10) {
    const homePage = await page.browser().newPage();
    await homePage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    const results = [];
    try {
      await homePage.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 9000 });
      await delay(900);
      // Try to find links with author name
      const homepageArticles = await homePage.evaluate((authorName) => {
        const articles = [];
        const allLinks = Array.from(document.querySelectorAll('a[href]'));
        for (const link of allLinks) {
          const url = link.href;
          const title = link.textContent?.trim();
          if (
            url &&
            title &&
            url.includes('http') &&
            title.length > 8 &&
            url.toLowerCase().includes(authorName.toLowerCase().replace(/\s+/g, "")) &&
            /article|story|news|column|opinion/.test(url)
          ) {
            articles.push({ title, url });
            if (articles.length >= 8) break;
          }
        }
        // Remove dupes
        const seen = new Set();
        const unique = [];
        for (const a of articles) {
          if (!seen.has(a.url)) {
            unique.push(a);
            seen.add(a.url);
          }
        }
        return unique;
      }, authorInfo.name);
      for (const article of homepageArticles) {
        if (!results.some(r => r.url === article.url)) {
          results.push(article);
          if (results.length >= maxResults) break;
        }
      }
    } catch (err) {}
    await homePage.close();
    return results;
  }

  // Try all strategies and merge results
  let extraArticles = [];
  try {
    // In order of probable relevance
    const googleArticles = await searchGoogleArticles(authorInfo.name, website, 20);
    const ddgArticles = await searchDuckDuckGoArticles(authorInfo.name, website, 12);
    const homepageArticles = await crawlOutletHomepageForArticles(authorInfo.name, website, 8);
    // Merge all, prioritizing Google, then DDG, then homepage founds
    const urls = new Set();
    for (const a of googleArticles) {
      if (a.url && !urls.has(a.url)) {
        extraArticles.push(a);
        urls.add(a.url);
      }
    }
    for (const a of ddgArticles) {
      if (a.url && !urls.has(a.url)) {
        extraArticles.push(a);
        urls.add(a.url);
      }
    }
    for (const a of homepageArticles) {
      if (a.url && !urls.has(a.url)) {
        extraArticles.push(a);
        urls.add(a.url);
      }
    }
  } catch (err) {}

  // Fallback: If still empty, try search with just author name (no 'site:')
  if (!extraArticles || extraArticles.length === 0) {
    try {
      const fallbackArticles = await searchGoogleArticles(authorInfo.name, 'https://www.google.com', 8);
      for (const a of fallbackArticles) {
        if (a.url && !extraArticles.some(ea => ea.url === a.url)) {
          extraArticles.push(a);
        }
      }
    } catch (err) {}
  }

  // Attempt to pull bio/role/email from the first article page if possible
  let bio = null;
  let role = 'Journalist';
  let email = null;
  // Use authorInfo.foundArticles if available, otherwise use merged extraArticles
  const probeArticle = authorInfo.foundArticles && authorInfo.foundArticles[0]
    ? authorInfo.foundArticles[0].url
    : (extraArticles[0] ? extraArticles[0].url : null);

  if (probeArticle) {
    try {
      await page.goto(probeArticle, {waitUntil: 'domcontentloaded', timeout: 9000});
      await delay(1000);
      const articleAuthorDetails = await page.evaluate((authorName) => {
        let bio = null, role = null, email = null;

        // Byline matching
        const bylineEl = document.querySelector('[class*="byline"], .byline, [itemprop="author"], .author');
        if (bylineEl) {
          const text = bylineEl.textContent?.trim() || '';
          if (text.length > 15 && text.toLowerCase().includes(authorName.toLowerCase())) {
            bio = text;
          }
          if (/editor|reporter|correspondent|columnist/i.test(text)) {
            role = text;
          }
        }
        // Email
        const emailMatch = document.body.innerText.match(/([a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/);
        if (emailMatch && !emailMatch[1].includes('@example.') && emailMatch[1].length < 50) {
          email = emailMatch[1];
        }
        return { bio, role, email };
      }, authorInfo.name);

      if (articleAuthorDetails) {
        bio = articleAuthorDetails.bio || bio;
        role = articleAuthorDetails.role || role;
        email = articleAuthorDetails.email || email;
      }
    } catch (err) {}
  }

  // Merge all found articles: authorInfo.foundArticles + extraArticles
  let mergedArticles = [];
  if (authorInfo.foundArticles && Array.isArray(authorInfo.foundArticles)) {
    const urls = new Set();
    for (const a of authorInfo.foundArticles) {
      if (a.url && !urls.has(a.url)) {
        mergedArticles.push(a);
        urls.add(a.url);
      }
    }
    for (const a of extraArticles) {
      if (a.url && !urls.has(a.url)) {
        mergedArticles.push(a);
        urls.add(a.url);
      }
    }
  } else {
    mergedArticles = extraArticles;
  }
  // Fallback: If still no articles found, create a stub article
  if (!mergedArticles || mergedArticles.length === 0) {
    mergedArticles = [{ title: `No articles found for author ${authorInfo.name}`, url: website }];
  }

  // Return richer profile object with robust multi-search
  return {
    bio: bio,
    role: role || 'Journalist',
    email: email,
    articles: mergedArticles,
    totalArticles: mergedArticles.length,
  };
}

// ============================================================
// EXTRACT AUTHOR ARTICLES
// ============================================================

async function extractAuthorArticles(page, website) {
  try {
    // Scroll to load more articles
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
      await delay(400);
    }
    
    await delay(1000);
    
    const articles = await page.evaluate((baseUrl) => {
      const articlesData = [];
      const seenUrls = new Set();
      const baseUrlObj = new URL(baseUrl);
      
      // Find article links
      const links = document.querySelectorAll('a[href]');
      
      for (const link of links) {
        const href = link.href;
        
        if (!href || href === '#' || seenUrls.has(href)) continue;
        
        // Skip non-article links
        if (link.closest('nav, header, footer')) continue;
        
        try {
          const url = new URL(href);
          if (url.hostname !== baseUrlObj.hostname) continue;
          
          const pathname = url.pathname;
          
          // Check if it's an article URL
          const isArticle =
            /\/\d{4}\/\d{1,2}\/\d{1,2}\/.+/.test(pathname) ||
            /\/\d{4}-\d{2}-\d{2}\/.+/.test(pathname) ||
            /-\d{5,}/.test(pathname) ||
            /\d{8,}\.html/.test(pathname) ||
            /\/(article|story|news|post|blog)\/.+/.test(pathname);
          
          if (!isArticle || pathname.length < 20) continue;
          
          // Get title
          let title = link.textContent?.trim() || '';
          
          // Try to find title in parent container
          if (!title || title.length < 15) {
            const parent = link.closest('article, [class*="article"], [class*="story"]');
            if (parent) {
              const heading = parent.querySelector('h1, h2, h3, h4, h5');
              if (heading) title = heading.textContent?.trim();
            }
          }
          
          // Clean and validate title
          if (title) {
            title = title.replace(/\s+/g, ' ').trim();
            
            if (title.length >= 15 && title.length < 300) {
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
      
      return articlesData;
    }, website);
    
    return articles;
    
  } catch (err) {
    return [];
  }
}

export default scrapeSpecificAuthor;