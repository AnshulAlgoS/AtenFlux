import puppeteer from "puppeteer";
import dotenv from "dotenv";

dotenv.config();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================
// STEP 1: AUTO-DETECT OUTLET WEBSITE
// ============================================================

/**
 * Automatically detect the official website of a media outlet
 * Uses multiple strategies - NO hardcoded domains!
 */
async function detectOutletWebsite(outletName, browser) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔍 AUTO-DETECTING WEBSITE: ${outletName}`);
  console.log('='.repeat(70));

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  try {
    // Strategy 1: Try DuckDuckGo (no CAPTCHA issues)
    console.log(`  📍 Strategy 1: Searching DuckDuckGo...`);
    
    try {
      await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(outletName + ' news india official website')}`, {
        waitUntil: 'networkidle2',
        timeout: 12000 // Reduced from 15s to 12s
      });
      await delay(1500); // Reduced delay

      const ddgWebsite = await page.evaluate(() => {
        const results = document.querySelectorAll('a[data-testid="result-title-a"], article a');
        
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
        console.log(`  ✅ Found via DuckDuckGo: ${ddgWebsite}\n`);
        await page.close();
        return ddgWebsite;
      }
    } catch (err) {
      console.log(`  ⚠️  DuckDuckGo search failed: ${err.message}`);
    }

    // Strategy 2: Try Google Search
    console.log(`  📍 Strategy 2: Searching Google...`);
    
    try {
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(outletName + ' news newspaper india official website')}`, {
        waitUntil: 'networkidle2',
        timeout: 12000 // Reduced from 15s to 12s
      });
      await delay(1500); // Reduced delay

      const googleWebsite = await page.evaluate(() => {
        const resultSelectors = [
          'div.yuRUbf > div > a',
          'div.yuRUbf > a',
          'a[href^="http"]'
        ];
        
        for (const selector of resultSelectors) {
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
        console.log(`  ✅ Found via Google: ${googleWebsite}\n`);
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
        timeout: 12000 // Reduced from 15s to 12s
      });
      await delay(1000); // Reduced delay

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
        console.log(`  ✅ Found via Bing: ${bingWebsite}\n`);
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
          timeout: 8000 // Reduced from 10s to 8s
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
            console.log(`  ✅ Found via URL construction: ${testUrl}\n`);
            await page.close();
            return testUrl;
          }
        }
      } catch (err) {
        // This URL didn't work, try next
        continue;
      }
    }

    console.log(`  ❌ Could not detect website for "${outletName}"\n`);
    await page.close();
    return null;

  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
    await page.close();
    return null;
  }
}

// ============================================================
// STEP 2: DISCOVER AUTHORS FROM OUTLET
// ============================================================

/**
 * Automatically discover JOURNALISTS from the outlet's website
 * Strategy: Find recent articles, visit them, extract author bylines
 * This ensures we get REAL journalists, not random users
 */
async function discoverAuthors(outletWebsite, outletName, browser, limit = 30) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`👥 DISCOVERING JOURNALISTS: ${outletName}`);
  console.log('='.repeat(70));

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  try {
    console.log(`  📍 Step 1: Finding recent articles on homepage...`);
    await page.goto(outletWebsite, { 
      waitUntil: 'networkidle2', 
      timeout: 20000 
    });
    await delay(1500); // Reduced delay

    // Scroll to load more articles
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(600); // Reduced delay
    }

    // Extract article URLs from homepage
    const articleUrls = await page.evaluate(() => {
      const articles = new Set();
      const allLinks = Array.from(document.querySelectorAll('a[href]'));
      
      for (const link of allLinks) {
        const href = link.href;
        
        // Skip non-article links
        if (!href || href === '#') continue;
        if (href.includes('/tag/') || href.includes('/category/') || href.includes('/section/')) continue;
        if (href.includes('/author/') || href.includes('/user/') || href.includes('/profile/')) continue;
        if (href.includes('facebook') || href.includes('twitter') || href.includes('youtube')) continue;
        
        // NEW: Skip RSS feeds, video pages, galleries, live blogs, and listings
        if (href.includes('/rss.') || href.includes('.rss')) continue;
        if (href.includes('/videos/') || href.includes('/video/')) continue;
        if (href.includes('/photos/') || href.includes('/photo/') || href.includes('/photogallery/')) continue;
        if (href.includes('/liveblog/') || href.includes('/live-')) continue;
        if (href.includes('/trending-') || href.includes('/popular-') || href.includes('/latest-')) continue;
        if (href.includes('/city/') && !href.match(/\/city\/[^/]+\/.*-\d{8}/)) continue; // City pages without article IDs
        
        // NEW: Skip state/region pages and election section pages
        if (href.includes('/elections/') && !href.match(/-\d{8,}/)) continue;
        if (href.match(/\/(india|world|business|sports|entertainment|lifestyle|tech)\/[a-z-]+$/) && !href.match(/-\d{8,}/)) continue;
        
        try {
          const url = new URL(href);
          if (url.hostname !== window.location.hostname) continue;
          
          const pathname = url.pathname;
          
          // STRICTER: Must have a clear article pattern
          const isArticle = 
            /\/\d{4}\/\d{1,2}\/\d{1,2}\/.+/.test(pathname) || // Date-based URL with content after date
            /\/\d{4}-\d{2}-\d{2}\/.+/.test(pathname) || // Alternative date format
            /\/articleshow\/\d+/.test(pathname) || // Times of India article pattern
            /-\d{8,}\.cms$/.test(pathname) || // Times of India CMS pattern with article ID
            /-\d{8,}$/.test(pathname) || // Article ID at end
            /\d{8,}\.html/.test(pathname) || // HTML with article ID
            /\.(html|ece|aspx)\?.*id=\d+/.test(pathname) || // Query param with ID
            (/\/(article|story|news|post|web-stories)\//i.test(pathname) && pathname.split('/').length >= 4); // Article path with depth
          
          // Additional validation: URL should have some content (not just section pages)
          const pathParts = pathname.split('/').filter(p => p);
          const hasEnoughDepth = pathParts.length >= 3;
          const lastPart = pathParts[pathParts.length - 1];
          const hasArticleId = /\d{6,}/.test(lastPart) || lastPart.includes('-') && lastPart.length > 15;
          
          if (isArticle && hasEnoughDepth && hasArticleId) {
            articles.add(href);
            if (articles.size >= 50) break; // Limit to 50 articles to check
          }
        } catch (e) {}
      }
      
      return Array.from(articles);
    });

    console.log(`  ✓ Found ${articleUrls.length} articles to check for authors`);

    // Visit each article and extract author information
    console.log(`  📍 Step 2: Extracting authors from article bylines...`);
    
    const authorsMap = new Map();
    let checkedArticles = 0;
    
    for (const articleUrl of articleUrls) {
      if (authorsMap.size >= limit) {
        console.log(`  ✓ Reached ${limit} unique authors, stopping...`);
        break;
      }
      
      if (checkedArticles >= 50) {
        console.log(`  ✓ Checked 50 articles, stopping...`);
        break;
      }
      
      try {
        checkedArticles++;
        
        await page.goto(articleUrl, { 
          waitUntil: 'domcontentloaded', 
          timeout: 8000 // Reduced from 10s to 8s
        });
        await delay(300); // Reduced delay

        // Extract author name and profile URL from this article
        const authorInfo = await page.evaluate(() => {
          // DEBUG: Log what we're seeing
          const debug = {
            url: window.location.href,
            foundLinks: [],
            foundText: []
          };
          
          // Look for author links in byline
          const authorSelectors = [
            'a[rel="author"]',
            'a[href*="/author/"]',
            'a[href*="/user/"]',
            'a[href*="/profile/"]',
            'a[href*="/journalist/"]',
            'a[href*="/writer/"]',
            'a[href*="/toiagencyfeeds/author-"]', // Times of India specific
            'a[href*="/authordetail/msid-"]', // Times of India specific
            '.author-name a',
            '.byline a',
            '[class*="author"] a',
            '[class*="byline"] a',
            '.story-byline a',
            '.article-author a',
            '.writer a',
            '.reporter a'
          ];
          
          // DEBUG: Check what author-related elements exist
          const allAuthorElements = document.querySelectorAll('[class*="author"], [class*="byline"], [rel="author"]');
          debug.foundText.push(`Found ${allAuthorElements.length} author/byline elements`);
          allAuthorElements.forEach((el, idx) => {
            if (idx < 3) { // Log first 3
              debug.foundText.push(`  Element ${idx}: ${el.tagName} class="${el.className}" text="${el.textContent?.substring(0, 50)}"`);
            }
          });
          
          for (const selector of authorSelectors) {
            const links = document.querySelectorAll(selector);
            
            for (const link of links) {
              const name = link.textContent?.trim();
              const href = link.href;
              
              // DEBUG: Log what we found
              debug.foundLinks.push({ selector, name, href });
              
              // Validate name
              if (!name || name.length < 3 || name.length > 50) continue;
              if (/^\d+$/.test(name)) continue;
              if (name.toLowerCase().includes('admin')) continue;
              
              // Reject common UI elements and invalid names
              const invalidPatterns = [
                /^(edit|view|read|click|share|follow|subscribe|login|sign)/i,
                /profile$/i,
                /(more|less|next|previous|back|close|menu|search)$/i,
                /^(by|posted|written|published)/i
              ];
              
              if (invalidPatterns.some(pattern => pattern.test(name))) continue;
              
              // RELAXED: Accept desk names, agencies, and team bylines
              // Must have at least 2 characters per word on average
              const words = name.split(/\s+/).filter(w => w.length > 0);
              if (words.length < 1) continue;
              
              // For single-word names, they must be at least 5 characters and look like a name
              if (words.length === 1) {
                if (words[0].length < 5) continue;
                // Single word must start with capital or be uppercase (for acronyms like "PTI", "ANI")
                if (!/^[A-Z]/.test(words[0])) continue;
              }
              
              // For multi-word names, at least one word should have some capitalization
              // This allows "TOI Tech Desk", "PTI", "ANI", etc.
              const hasSomeCapitalization = words.some(word => /[A-Z]/.test(word));
              if (!hasSomeCapitalization) continue;
              
              // Validate URL - must be author/user/profile link
              if (!href || href === '#') continue;
              if (!href.includes('/author/') && !href.includes('/user/') && 
                  !href.includes('/profile/') && !href.includes('/journalist/') &&
                  !href.includes('/writer/')) continue;
              
              return { name, profileUrl: href, source: 'link', debug };
            }
          }
          
          // NEW: Fallback - Look for author name without link and try to construct profile URL
          const bylineTextSelectors = [
            '.author-name',
            '.byline',
            '[class*="author"]',
            '[class*="byline"]',
            '.story-byline',
            '.writer',
            '.reporter',
            '.contributor',
            '[class*="writer"]',
            '[class*="reporter"]',
            'meta[name="author"]',
            'meta[property="author"]',
            'meta[name="article:author"]',
            '[itemprop="author"]',
            '[itemprop="author"] [itemprop="name"]'
          ];
          
          for (const selector of bylineTextSelectors) {
            const el = document.querySelector(selector);
            if (!el) continue;
            
            const authorName = (el.textContent || el.getAttribute('content') || '').trim();
            
            // DEBUG
            debug.foundText.push(`Checking selector "${selector}": "${authorName}"`);
            
            // Clean up "By Author Name" format
            const cleanName = authorName.replace(/^(by|written by|author:?)\s+/i, '').trim();
            
            if (!cleanName || cleanName.length < 3 || cleanName.length > 50) continue;
            
            // STRICT validation: Reject dates, times, and non-names
            // Reject if contains date patterns
            if (/\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(cleanName)) continue;
            if (/\d{4}/.test(cleanName)) continue; // Contains year
            if (/\d{1,2}:\d{2}/.test(cleanName)) continue; // Contains time HH:MM
            if (/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(cleanName)) continue; // Date format
            
            // Reject if mostly numbers
            const numCount = (cleanName.match(/\d/g) || []).length;
            if (numCount > cleanName.length * 0.3) continue; // More than 30% digits
            
            // Must have at least 2 words (first + last name)
            const words = cleanName.split(/\s+/).filter(w => w.length > 1);
            if (words.length < 2) continue;
            
            // Each word should start with a capital letter (proper name format)
            const allWordsCapitalized = words.every(word => /^[A-Z]/.test(word));
            if (!allWordsCapitalized) continue;
            
            // Reject if contains common non-name words
            const nonNameWords = ['updated', 'published', 'posted', 'edited', 'am', 'pm', 'ist', 'gmt'];
            if (nonNameWords.some(word => cleanName.toLowerCase().includes(word))) continue;
            
            // Try to construct profile URL
            const slug = cleanName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            const baseUrl = window.location.origin;
            
            // Try common patterns
            const possibleUrls = [
              `${baseUrl}/author/${slug}`,
              `${baseUrl}/authors/${slug}`,
              `${baseUrl}/profile/${slug}`,
              `${baseUrl}/user/${slug}`
            ];
            
            return { name: cleanName, profileUrl: possibleUrls[0], source: 'constructed', debug };
          }
          
          // DEBUG: Return debug info even if no author found
          return { debug };
        });

        // Log debug info for first 3 articles
        if (checkedArticles <= 3 && authorInfo?.debug) {
          console.log(`\n  🔍 DEBUG Article ${checkedArticles}:`);
          console.log(`     URL: ${authorInfo.debug.url}`);
          if (authorInfo.debug.foundText.length > 0) {
            console.log(`     Text elements:`, authorInfo.debug.foundText.slice(0, 5));
          }
          if (authorInfo.debug.foundLinks.length > 0) {
            console.log(`     Link elements:`, authorInfo.debug.foundLinks.slice(0, 3));
          }
        }

        if (authorInfo && authorInfo.name && !authorsMap.has(authorInfo.name)) {
          authorsMap.set(authorInfo.name, authorInfo);
          console.log(`  ✓ [${authorsMap.size}/${limit}] Found: ${authorInfo.name} (${authorInfo.source})`);
        }

      } catch (err) {
        // Skip articles that fail to load
        continue;
      }
    }

    const uniqueAuthors = Array.from(authorsMap.values());
    
    console.log(`  ✅ Total unique journalists discovered: ${uniqueAuthors.length}`);
    console.log(`     (Checked ${checkedArticles} articles)`);
    
    await page.close();
    return uniqueAuthors;

  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
    await page.close();
    return [];
  }
}

// ============================================================
// STEP 3: EXTRACT AUTHOR DATA
// ============================================================

/**
 * Extract comprehensive author data from their profile
 */
async function extractAuthorData(author, outletName, browser) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📝 EXTRACTING DATA: ${author.name}`);
  console.log('='.repeat(70));

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  try {
    console.log(`  🔗 Loading profile: ${author.profileUrl}`);
    await page.goto(author.profileUrl, { 
      waitUntil: 'networkidle2', 
      timeout: 20000 
    });
    await delay(1500); // Reduced delay

    // Extract profile metadata
    const profileData = await page.evaluate((authorName) => {
      const data = {
        bio: null,
        role: null,
        email: null,
        socialLinks: {},
        profilePicture: null
      };
      
      // Extract bio - MORE selectors
      const bioSelectors = [
        '.bio', '.author-bio', '.profile-bio', '.description', '.about',
        '[itemprop="description"]', '.author-description', '.author-info',
        '.profile-description', '[class*="bio"]', '[class*="about"]'
      ];
      
      for (const selector of bioSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.textContent?.trim();
          if (text && text.length > 20 && text.length < 1000) {
            data.bio = text;
            break;
          }
        }
      }
      
      // Extract role/title
      const roleSelectors = [
        '.role', '.title', '.position', '.author-title', '.job-title',
        '[itemprop="jobTitle"]', '.designation', '.author-role'
      ];
      
      for (const selector of roleSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          data.role = el.textContent?.trim();
          if (data.role) break;
        }
      }
      
      // Extract email - better pattern
      const emailRegex = /([a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/gi;
      const pageText = document.body.innerText;
      const emailMatches = pageText.match(emailRegex);
      
      if (emailMatches) {
        // Filter out common false positives
        const validEmail = emailMatches.find(email => 
          !email.includes('@example.') &&
          !email.includes('@test.') &&
          email.length < 50
        );
        if (validEmail) data.email = validEmail;
      }
      
      // Extract social media links - ONLY FROM AUTHOR PROFILE SECTION
      // First, try to find the author's profile container
      let authorProfileSection = document.querySelector('.author-profile, .profile-section, .author-details, .author-info, .profile-container, [class*="author-"], [class*="profile-"]');
      
      // If no specific section found, look for links near the bio/role
      if (!authorProfileSection) {
        const bioEl = document.querySelector('.bio, .author-bio, .profile-bio');
        if (bioEl) {
          authorProfileSection = bioEl.parentElement || document.body;
        } else {
          authorProfileSection = document.body;
        }
      }
      
      // Now extract social links ONLY from author's section
      const socialLinksInSection = authorProfileSection.querySelectorAll('a[href]');
      
      for (const link of socialLinksInSection) {
        const href = link.href.toLowerCase();
        const linkText = link.textContent.toLowerCase();
        const ariaLabel = (link.getAttribute('aria-label') || '').toLowerCase();
        
        // Check if this link is likely the author's personal link
        // (not outlet's official page or generic share buttons)
        const isLikelyPersonal = !href.includes('/share') && 
                                 !href.includes('/sharer') &&
                                 !href.includes('intent/') &&
                                 !linkText.includes('follow us') &&
                                 !linkText.includes('share') &&
                                 !ariaLabel.includes('share');
        
        if (!isLikelyPersonal) continue;
        
        if ((href.includes('twitter.com/') || href.includes('x.com/')) && !data.socialLinks.twitter) {
          const match = href.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/);
          if (match && match[1]) {
            // Exclude generic pages
            if (!['intent', 'share', 'home', 'explore', 'notifications'].includes(match[1])) {
              data.socialLinks.twitter = `https://twitter.com/${match[1]}`;
            }
          }
        } else if (href.includes('linkedin.com/in/') && !data.socialLinks.linkedin) {
          const match = href.match(/linkedin\.com\/in\/([a-zA-Z0-9-]+)/);
          if (match && match[1]) {
            data.socialLinks.linkedin = `https://linkedin.com/in/${match[1]}`;
          }
        } else if (href.includes('facebook.com/') && !data.socialLinks.facebook) {
          const match = href.match(/facebook\.com\/([a-zA-Z0-9.]+)/);
          if (match && match[1] && match[1] !== 'sharer') {
            data.socialLinks.facebook = `https://facebook.com/${match[1]}`;
          }
        } else if (href.includes('instagram.com/') && !data.socialLinks.instagram) {
          const match = href.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
          if (match && match[1] && match[1] !== 'p') {
            data.socialLinks.instagram = `https://instagram.com/${match[1]}`;
          }
        }
      }
      
      // Additional validation: Check if extracted username matches or is related to author name
      // If we found social links, verify they're not the outlet's by checking the username
      const authorWords = authorName.toLowerCase().split(/\s+/);
      
      for (const [platform, url] of Object.entries(data.socialLinks)) {
        const username = url.split('/').pop().toLowerCase();
        
        // Skip if username is likely the outlet (contains 'news', 'media', 'times', etc.)
        const outletKeywords = ['news', 'media', 'times', 'express', 'hindu', 'india', 'daily', 'post', 'tribune'];
        const isOutletLink = outletKeywords.some(keyword => username.includes(keyword));
        
        if (isOutletLink) {
          // This looks like outlet's official link, remove it
          delete data.socialLinks[platform];
        }
      }

      // Extract profile picture
      const imgSelectors = [
        '.profile-image img', '.author-image img', '.avatar img',
        '.profile-photo img', '[itemprop="image"]', '.author-avatar img',
        'img[alt*="' + authorName + '"]'
      ];
      
      for (const selector of imgSelectors) {
        const img = document.querySelector(selector);
        if (img?.src && !img.src.includes('placeholder') && !img.src.includes('default')) {
          data.profilePicture = img.src;
          break;
        }
      }
      
      return data;
    }, author.name);

    console.log(`  ✓ Bio: ${profileData.bio ? `${profileData.bio.substring(0, 50)}...` : 'Not found'}`);
    console.log(`  ✓ Role: ${profileData.role || 'Not found'}`);
    console.log(`  ✓ Email: ${profileData.email || 'Not found'}`);
    console.log(`  ✓ Social: ${Object.keys(profileData.socialLinks).join(', ') || 'None'}`);

    // Scroll to load articles
    console.log(`  ⬇️  Scrolling to load articles...`);
    
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(400); // Reduced delay
    }

    await delay(1000);

    // Extract article URLs from profile page
    const articleUrls = await page.evaluate((profileUrl) => {
      const urls = new Set();
      const allLinks = Array.from(document.querySelectorAll('a[href]'));
      
      for (const link of allLinks) {
        const href = link.href;
        
        // Skip if already seen
        if (urls.has(href)) continue;
        
        // Skip profile page itself
        if (href === profileUrl) continue;
        
        // Skip obvious non-articles
        if (!href || href === '#' || href === 'javascript:void(0)') continue;
        if (href.includes('/author/') || href.includes('/user/') || href.includes('/profile/')) continue;
        if (href.includes('/tag') || href.includes('/category') || href.includes('/section')) continue;
        if (href.includes('facebook') || href.includes('twitter') || href.includes('whatsapp')) continue;
        if (href.includes('youtube') || href.includes('instagram') || href.includes('mailto:')) continue;
        
        // Parse URL
        try {
          const urlObj = new URL(href);
          
          // Must be same domain
          if (urlObj.hostname !== window.location.hostname) continue;
          
          const pathname = urlObj.pathname;
          
          // Check if URL looks like an article
          const looksLikeArticle =
            /\/\d{4}\/\d{1,2}\/\d{1,2}\//.test(pathname) ||
            /\/\d{4}-\d{2}-\d{2}/.test(pathname) ||
            /-\d{6,}/.test(pathname) ||
            /\/\d{6,}/.test(pathname) ||
            /\.(html|ece|cms|aspx|php|jsp|shtml)$/.test(pathname) ||
            /\/(article|story|news|post|blog|web-stories)\//i.test(pathname) ||
            (pathname.length > 20 && pathname.split('/').length >= 3);
          
          if (looksLikeArticle) {
            urls.add(href);
          }
        } catch (e) {}
      }
      
      return Array.from(urls);
    }, author.profileUrl);

    console.log(`  📝 Found ${articleUrls.length} potential article URLs`);
    console.log(`  📋 Extracting article metadata without verification...`);

    // OPTIMIZED: Don't visit each article - trust the profile page listing
    // Extract metadata from URLs and take the first 20 articles
    const verifiedArticles = articleUrls.slice(0, 20).map((url, idx) => {
      // Extract date from URL if possible
      let publishDate = null;
      const dateMatch = url.match(/\/(\d{4})[/-](\d{1,2})[/-](\d{1,2})\//);
      if (dateMatch) {
        publishDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
      }
      
      // Extract section from URL
      let section = null;
      try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        if (pathParts.length > 0) {
          section = pathParts[0];
        }
      } catch (e) {}
      
      // Generate title from URL (we'll get actual titles if needed later)
      const urlParts = url.split('/');
      const lastPart = urlParts[urlParts.length - 1];
      const titleSlug = lastPart.replace(/[-_]/g, ' ').replace(/\.(html|cms|aspx|php).*$/, '');
      const title = titleSlug.charAt(0).toUpperCase() + titleSlug.slice(1);
      
      return {
        title: title.substring(0, 100) || 'Article',
        url: url,
        publishDate: publishDate,
        section: section
      };
    });

    console.log(`  ✅ Collected ${verifiedArticles.length} articles from profile`);

    await page.close();

    return {
      name: author.name,
      outlet: outletName,
      profileUrl: author.profileUrl,
      role: profileData.role,
      bio: profileData.bio,
      email: profileData.email,
      socialLinks: profileData.socialLinks,
      profilePicture: profileData.profilePicture,
      articles: verifiedArticles,
      totalArticles: verifiedArticles.length
    };

  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
    await page.close();
    return null;
  }
}

// ============================================================
// MAIN FUNCTION: INTELLIGENT OUTLET SCRAPER
// ============================================================

/**
 * INTELLIGENT OUTLET SCRAPER
 * 
 * Takes ONLY the outlet name and automatically:
 * 1. Detects the official website
 * 2. Discovers authors
 * 3. Extracts all available data
 * 
 * NO manual URLs or pre-saved mappings needed!
 */
export async function scrapeOutletIntelligent(outletName, maxAuthors = 30) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚀 INTELLIGENT OUTLET SCRAPER`);
  console.log(`📰 Outlet: ${outletName}`);
  console.log(`👥 Max Authors to Extract: ${maxAuthors}`);
  console.log('='.repeat(80));

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
    defaultViewport: null,
    protocolTimeout: 160000, // Reduced from 3 minutes to 2.67 minutes
  });

  try {
    // Step 1: Auto-detect outlet website
    const website = await detectOutletWebsite(outletName, browser);
    
    if (!website) {
      console.log(`\n❌ Could not detect website for "${outletName}"`);
      await browser.close();
      return { error: 'Website detection failed', outlet: outletName };
    }

    // Step 2: Discover authors
    const authors = await discoverAuthors(website, outletName, browser, maxAuthors);
    
    if (authors.length === 0) {
      console.log(`\n❌ No authors discovered on ${website}`);
      await browser.close();
      return { error: 'No authors found', outlet: outletName, website };
    }

    // Step 3: Extract data for each author
    console.log(`\n\n${'='.repeat(80)}`);
    console.log(`📊 EXTRACTING DATA FOR ${authors.length} AUTHORS (PARALLEL MODE)`);
    console.log('='.repeat(80));

    const results = [];

    // Process authors in parallel (2 at a time for speed)
    const PARALLEL_LIMIT = 2;
    
    for (let i = 0; i < authors.length; i += PARALLEL_LIMIT) {
      const batch = authors.slice(i, Math.min(i + PARALLEL_LIMIT, authors.length));
      
      console.log(`\n[${'='.repeat(76)}]`);
      console.log(`  Processing batch ${Math.floor(i / PARALLEL_LIMIT) + 1} (Authors ${i + 1}-${Math.min(i + PARALLEL_LIMIT, authors.length)} of ${authors.length})`);
      console.log(`[${'='.repeat(76)}]`);

      // Process batch in parallel
      const batchPromises = batch.map(async (author, batchIdx) => {
        const authorNum = i + batchIdx + 1;
        console.log(`\n  [${authorNum}/${authors.length}] Starting: ${author.name}`);
        
        const data = await extractAuthorData(author, outletName, browser);
        
        if (data) {
          console.log(`  [${authorNum}/${authors.length}] ✅ Completed: ${author.name} (${data.totalArticles} articles)`);
          return data;
        } else {
          console.log(`  [${authorNum}/${authors.length}] ❌ Failed: ${author.name}`);
          return null;
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(r => r !== null));

      // Small delay between batches to avoid overwhelming the server
      if (i + PARALLEL_LIMIT < authors.length) {
        console.log(`\n⏳ Waiting 1 second before next batch...`);
        await delay(1000);
      }
    }

    await browser.close();

    // Final summary
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

// Export for use in other files
export default scrapeOutletIntelligent;