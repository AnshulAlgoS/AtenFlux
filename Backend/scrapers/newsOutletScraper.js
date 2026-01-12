import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import { extractKeywords, categorizeTopics } from '../utils/nlpAnalyzer.js';

dotenv.config();

const SERPER_API_KEY = process.env.SERPER_API_KEY;
if (!SERPER_API_KEY) console.warn('⚠️ SERPER_API_KEY missing');

// Utilities
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.3; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0'
];

const getUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const delay = ms => new Promise(r => setTimeout(r, ms));

// ============ SERPER SEARCH ============
async function serperSearch(query, num = 10) {
  try {
    const res = await axios.post('https://google.serper.dev/search',
      { q: query, num, gl: 'in', hl: 'en' },
      { headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    const data = res.data || {};
    const organic = Array.isArray(data.organic) ? data.organic : [];
    return organic;
  } catch (e) {
    return [];
  }
}

// ============ DuckDuckGo HTML SEARCH (fallback) ============
async function ddgHtmlSearch(query, max = 10) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetchRaw(url, { timeout: 12000, type: 'html' });
    if (!res) return [];
    const $ = cheerio.load(res.data);
    const results = [];
    $('.result__a').each((i, el) => {
      if (results.length >= max) return false;
      const link = $(el).attr('href');
      const title = $(el).text().trim();
      if (link && link.startsWith('http')) {
        results.push({ link, title, snippet: '' });
      }
    });
    return results;
  } catch (e) {
    return [];
  }
}

async function fetchWordPressPostsInto(website, target, articles) {
  try {
    const per = 100;
    for (let page = 1; page <= 6 && articles.size < target; page++) {
      try {
        const base = website.replace(/\/+$/, '');
        const url = `${base}/wp-json/wp/v2/posts?per_page=${per}&page=${page}&orderby=date&order=desc&_fields=link,title`;
        const res = await fetchRaw(url, { timeout: 12000, type: 'json' });
        if (res && Array.isArray(res.data)) {
          for (const item of res.data) {
            if (articles.size >= target) break;
            const link = item?.link;
            let title = item?.title?.rendered || item?.title || '';
            title = String(title).replace(/<[^>]+>/g, '').trim();
            if (!link || !title) continue;
            const host = new URL(website).hostname;
            const u = link.startsWith('/') ? `${website}${link}` : link;
            if (!u.includes(host)) continue;
            if (/\/(tag|author|search|archive|topic|video|photo|gallery)\b/i.test(u)) continue;
            if (/\.(jpg|png|gif|pdf|mp4|mp3)$/i.test(u)) continue;
            if (!articles.has(u)) {
              articles.set(u, { title, url: u });
            }
          }
        }
      } catch {}
      // Alt REST route fallback
      try {
        if (articles.size >= target) break;
        const alt = `${website.replace(/\/+$/, '')}/?rest_route=/wp/v2/posts&per_page=${per}&page=${page}&_fields=link,title`;
        const r2 = await fetchRaw(alt, { timeout: 12000, type: 'json' });
        if (r2 && Array.isArray(r2.data)) {
          for (const item of r2.data) {
            if (articles.size >= target) break;
            const link = item?.link;
            let title = item?.title?.rendered || item?.title || '';
            title = String(title).replace(/<[^>]+>/g, '').trim();
            if (!link || !title) continue;
            const host = new URL(website).hostname;
            const u = link.startsWith('/') ? `${website}${link}` : link;
            if (!u.includes(host)) continue;
            if (/\/(tag|author|search|archive|topic|video|photo|gallery)\b/i.test(u)) continue;
            if (/\.(jpg|png|gif|pdf|mp4|mp3)$/i.test(u)) continue;
            if (!articles.has(u)) {
              articles.set(u, { title, url: u });
            }
          }
        }
      } catch {}
    }
  } catch {}
}
async function fetchWordPressSearchInto(website, target, articles) {
  try {
    const base = website.replace(/\/+$/, '');
    const queries = ['news', 'business', 'nigeria', 'bank', 'memo', 'market', 'economy', 'finance', 'stock'];
    for (const q of queries) {
      if (articles.size >= target) break;
      try {
        const url = `${base}/wp-json/wp/v2/search?search=${encodeURIComponent(q)}&per_page=100&_fields=title,url`;
        const res = await fetchRaw(url, { timeout: 12000, type: 'json' });
        if (res && Array.isArray(res.data)) {
          for (const item of res.data) {
            if (articles.size >= target) break;
            const title = String(item?.title || '').replace(/<[^>]+>/g, '').trim();
            const link = String(item?.url || '').trim();
            if (!title || !link) continue;
            const host = new URL(website).hostname;
            const u = link.startsWith('/') ? `${website}${link}` : link;
            if (!u.includes(host)) continue;
            if (/\/(tag|author|search|archive|topic|video|photo|gallery)\b/i.test(u)) continue;
            if (/\.(jpg|png|gif|pdf|mp4|mp3)$/i.test(u)) continue;
            if (!articles.has(u)) {
              articles.set(u, { title, url: u });
            }
          }
        }
      } catch {}
    }
  } catch {}
}
async function fetchWordPressCategories(website, maxPages = 4) {
  const slugs = new Set();
  try {
    for (let page = 1; page <= maxPages; page++) {
      try {
        const url = `${website.replace(/\/+$/, '')}/wp-json/wp/v2/categories?per_page=50&page=${page}&_fields=slug`;
        const res = await axios.get(url, { headers: { 'User-Agent': getUA() }, timeout: 10000, validateStatus: s => s < 500 });
        if (Array.isArray(res.data)) {
          for (const cat of res.data) {
            const slug = String(cat?.slug || '').trim();
            if (slug) slugs.add(slug);
          }
          if (res.data.length < 50) break;
        }
      } catch {}
    }
  } catch {}
  return Array.from(slugs);
}

async function fetchWordPressUsersInto(website, limit = 60) {
  const authors = [];
  try {
    const base = website.replace(/\/+$/, '');
    for (let page = 1; page <= 3 && authors.length < limit; page++) {
      try {
        const url = `${base}/wp-json/wp/v2/users?per_page=50&page=${page}&_fields=name,slug,link`;
        const res = await axios.get(url, {
          headers: { 'User-Agent': getUA(), 'Accept': 'application/json' },
          timeout: 12000,
          validateStatus: s => s < 500
        });
        if (Array.isArray(res.data)) {
          for (const u of res.data) {
            if (authors.length >= limit) break;
            const name = String(u?.name || '').trim();
            const slug = String(u?.slug || '').trim();
            const link = String(u?.link || '').trim();
            const profile = link || (slug ? `${base}/author/${slug}` : null);
            if (!name || !profile) continue;
            if (!isValidName(name)) continue;
            authors.push({ name, profile });
          }
        }
      } catch {}
    }
  } catch {}
  return authors;
}

async function fetchWordPressAuthorSitemaps(website, limit = 80) {
  const authors = [];
  try {
    const base = website.replace(/\/+$/, '');
    for (let i = 1; i <= 4 && authors.length < limit; i++) {
      try {
        const url = `${base}/wp-sitemap-users-${i}.xml`;
        const res = await axios.get(url, {
          headers: { 'User-Agent': getUA(), 'Accept': 'application/xml,text/xml;q=0.9,*/*;q=0.8' },
          timeout: 10000,
          validateStatus: s => s < 500
        });
        const $ = cheerio.load(res.data, { xmlMode: true });
        $('loc').each((_, el) => {
          if (authors.length >= limit) return false;
          const loc = $(el).text().trim();
          if (!loc) return;
          try {
            const u = new URL(loc);
            const parts = u.pathname.split('/').filter(Boolean);
            const idx = parts.indexOf('author');
            const slug = idx >= 0 ? parts[idx + 1] : null;
            if (slug) {
              const name = slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              if (isValidName(name)) authors.push({ name, profile: loc });
            }
          } catch {}
        });
      } catch {}
    }
  } catch {}
  return authors;
}

// ============ FETCH RAW (Base Helper) ============
async function fetchRaw(url, options = {}) {
  const timeout = options.timeout || 15000;
  const maxAttempts = options.retries || 3;
  const type = options.type || 'html'; // 'html' or 'json'

  let attempts = 0;
  while (attempts < maxAttempts) {
    try {
      const ua = getUA();
      const headers = {
        'User-Agent': ua,
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': (() => { try { return new URL(url).origin + '/'; } catch { return ''; } })(),
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        ...options.headers
      };

      if (type === 'json') {
        headers['Accept'] = 'application/json, text/plain, */*';
      } else {
        headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8';
      }

      const res = await axios.get(url, {
        headers,
        timeout,
        maxRedirects: 5,
        validateStatus: s => s < 500 || s === 503
      });

      // Check for soft-blocks
      if (res.status === 403 || res.status === 503 || res.status === 429) throw new Error('Blocked status');

      if (typeof res.data === 'string') {
        if (res.data.includes('Just a moment...') ||
          res.data.includes('Security check') ||
          res.data.includes('Cloudflare') ||
          res.data.includes('Verify you are human') ||
          res.data.includes('Attention Required!') ||
          res.data.includes('cf-error') ||
          res.data.includes('DDoS protection')) {
          throw new Error('Blocked content');
        }
      }

      return res;
    } catch (e) {
      attempts++;
      if (attempts >= maxAttempts) return null;
      await delay(1000 + Math.random() * 2000);
    }
  }
  return null;
}

// ============ FETCH PAGE ============
async function fetchPage(url, timeout = 15000) {
  const res = await fetchRaw(url, { timeout, type: 'html' });
  if (res && res.status >= 200 && res.status < 300) {
    return cheerio.load(res.data);
  }
  // Fallback: use read-only snapshot to bypass JS/Cloudflare blocks
  try {
    const u = new URL(url);
    const snapHttps = `https://r.jina.ai/https://${u.hostname}${u.pathname}${u.search}`;
    const snapRes = await fetchRaw(snapHttps, { timeout: Math.min(20000, timeout + 5000), type: 'html' });
    if (snapRes && snapRes.status >= 200 && snapRes.status < 400 && typeof snapRes.data === 'string') {
      const html = `<html><head><meta charset="utf-8"></head><body><pre>${snapRes.data}</pre></body></html>`;
      return cheerio.load(html);
    }
    const snapHttp = `https://r.jina.ai/http://${u.hostname}${u.pathname}${u.search}`;
    const snapRes2 = await fetchRaw(snapHttp, { timeout: Math.min(20000, timeout + 5000), type: 'html' });
    if (snapRes2 && snapRes2.status >= 200 && snapRes2.status < 400 && typeof snapRes2.data === 'string') {
      const html = `<html><head><meta charset="utf-8"></head><body><pre>${snapRes2.data}</pre></body></html>`;
      return cheerio.load(html);
    }
  } catch {}
  return null;
}

// ============ VERIFY URL EXISTS ============
async function verifyUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const isLinkedInProfile = /(?:[a-zA-Z0-9.-]+\.)?linkedin\.com\/(in|pub)\//.test(url);
    // First try HEAD
    try {
      const res = await axios.head(url, { timeout: 4000, headers: { 'User-Agent': getUA() }, maxRedirects: 2, validateStatus: s => s < 600 });
      if ((res.status >= 200 && res.status < 400)) return true;
      // LinkedIn often returns 999; treat as valid for profile URLs
      if (/linkedin\.com$/.test(host) && (res.status === 999 || res.status === 403)) return true;
    } catch { }
    // Fallback GET (some platforms block HEAD) – skip for LinkedIn profiles to save time
    if (!/linkedin\.com$/.test(host) || !isLinkedInProfile) {
      const getRes = await axios.get(url, { timeout: 5000, headers: { 'User-Agent': getUA() }, maxRedirects: 2, validateStatus: s => s < 600 });
      if ((getRes.status >= 200 && getRes.status < 400)) return true;
      if (/linkedin\.com$/.test(host) && (getRes.status === 999 || getRes.status === 403)) return true;
    }
    // Final fallback: accept LinkedIn personal profile patterns even if blocked
    if (isLinkedInProfile) return true;
    return false;
  } catch (e) {
    // If URL parsing fails, still allow LinkedIn personal profile patterns
    try { if (/(?:[a-zA-Z0-9.-]+\.)?linkedin\.com\/(in|pub)\//.test(url)) return true; } catch { }
    return false;
  }
}

// ============ NAME VALIDATION ============
const INVALID_NAMES = new Set([
  'staff writer', 'correspondent', 'reporter', 'journalist', 'editor', 'bureau chief',
  'social media', 'web desk', 'news desk', 'editorial team', 'news team', 'digital team',
  'et online', 'et bureau', 'et now', 'et markets', 'et prime', 'economic times',
  'et contributors', 'contributors', 'bccl', 'bccl - non copyright', 'istock', 'getty',
  'getty images', 'reuters', 'afp', 'ap', 'pti', 'ani', 'ians', 'shutterstock',
  'agencies', 'file photo', 'representational image', 'photo credit', 'courtesy',
  'admin', 'webmaster', 'guest', 'anonymous', 'unknown', 'author', 'staff', 'team',
  'times of india', 'hindustan times', 'indian express', 'the hindu', 'ndtv',
  'read more', 'view all', 'subscribe', 'sign in', 'login', 'share', 'comment',
  'news agency', 'wire service', 'syndicated', 'special arrangement', 'external contributor',
  // Desk/Bureau bylines
  'toi desk', 'ht desk', 'et desk', 'web desk', 'city desk', 'sports desk', 'entertainment desk',
  'business desk', 'national desk', 'international desk', 'metro desk', 'feature desk',
  'toi entertainment desk', 'toi sports desk', 'toi business desk', 'toi city desk',
  'ht entertainment desk', 'ht sports desk', 'ht business desk', 'ht city desk',
  'news bureau', 'city bureau', 'delhi bureau', 'mumbai bureau', 'chennai bureau',
  'kolkata bureau', 'bangalore bureau', 'hyderabad bureau', 'pune bureau',
  'press trust of india', 'press journal', 'free press', 'special correspondent',
  'our correspondent', 'staff correspondent', 'special reporter', 'our reporter'
]);

// Patterns to reject (partial matches)
const INVALID_PATTERNS = [
  /\bdesk\b/i,
  /\bbureau\b/i,
  /\bagency\b/i,
  /\bagencies\b/i,
  /\bpress\s+journal\b/i,
  /\bwire\s+service\b/i,
  /\bnews\s+service\b/i,
  /\bonline\s+desk\b/i,
  /\bdigital\s+desk\b/i,
  /\beditorial\s+board\b/i,
  /\bnewsroom\b/i,
  /\bcorrespondent$/i,  // ends with correspondent (e.g., "Our Correspondent")
  /^(toi|ht|et|nbt|dna|ie)\s/i,  // starts with outlet abbreviation
  /\s(toi|ht|et|nbt|dna|ie)$/i,  // ends with outlet abbreviation
  /(older|newer)\s+posts/i,
  /^(previous|next)$/i
];

function isEditorialName(name) {
  try {
    const n = String(name).toLowerCase().trim();
    if (!n || n.length < 3) return false;
    if (/\beditorial\b|\bopinion\b|\bcolumn\b|\bboard\b/.test(n)) return true;
    if (/\bteam\b|\bstaff\b|\bdesk\b|\bbureau\b|\bnewsroom\b/.test(n)) return true;
    const brands = [
      'nairametrics',
      'icir',
      'international centre for investigative reporting',
      'republic',
      'stears',
      'zikoko',
      'techdailypost',
      'politics nigeria',
      'daily nigerian'
    ];
    for (const b of brands) { if (n.includes(b)) return true; }
    return false;
  } catch { return false; }
}

function isValidName(name) {
  if (!name || typeof name !== 'string') return false;
  const clean = name.trim();
  if (clean.length < 4 || clean.length > 60) return false;
  if (/(older|newer)\s+posts/i.test(clean)) return false;
  if (INVALID_NAMES.has(clean.toLowerCase())) return false;

  // Check against invalid patterns
  for (const pattern of INVALID_PATTERNS) {
    if (pattern.test(clean)) return false;
  }

  // Block common French article phrases unless explicitly editorial
  if (/^(la|le|les|des|du|de|d’|d')\s+/i.test(clean) && !isEditorialName(clean)) return false;
  // Require at least one uppercase initial for Latin-script names 
  const hasUpperLatin = /[A-ZÀ-ÖØ-Ý]/.test(clean);
  if (!hasUpperLatin && !isEditorialName(clean)) return false;

  if (/^\d|[@#$%^&*()+=\[\]{}|\\<>\/]/.test(clean)) return false;
  if (!(new RegExp("^[\\p{L}\\s.\\-']+$", "u")).test(clean)) return false;
  const words = clean.split(/\s+/).filter(w => w.length > 1);
  if (words.length < 1 || words.length > 5) return false;
  const capWords = words.filter(w => /^[A-ZÀ-ÖØ-Ý][\p{L}'\-]+$/u.test(w) || /^[A-ZÀ-ÖØ-Ý]{2,}$/.test(w));
  if (capWords.length === 0 && !isEditorialName(clean)) return false;
  return true;
}

// ============ ROLE PATTERNS ============
const ROLE_PATTERNS = [
  { p: /editor[\s-]?in[\s-]?chief/i, r: 'Editor-in-Chief' },
  { p: /managing\s*editor/i, r: 'Managing Editor' },
  { p: /executive\s*editor/i, r: 'Executive Editor' },
  { p: /deputy\s*editor/i, r: 'Deputy Editor' },
  { p: /associate\s*editor/i, r: 'Associate Editor' },
  { p: /senior\s*editor/i, r: 'Senior Editor' },
  { p: /bureau\s*chief/i, r: 'Bureau Chief' },
  { p: /principal\s*(digital\s*)?content\s*producer/i, r: 'Principal Content Producer' },
  { p: /senior\s*(digital\s*)?content\s*producer/i, r: 'Senior Content Producer' },
  { p: /content\s*producer/i, r: 'Content Producer' },
  { p: /principal\s*correspondent/i, r: 'Principal Correspondent' },
  { p: /senior\s*correspondent/i, r: 'Senior Correspondent' },
  { p: /special\s*correspondent/i, r: 'Special Correspondent' },
  { p: /chief\s*correspondent/i, r: 'Chief Correspondent' },
  { p: /political\s*correspondent/i, r: 'Political Correspondent' },
  { p: /senior\s*reporter/i, r: 'Senior Reporter' },
  { p: /senior\s*writer/i, r: 'Senior Writer' },
  { p: /columnist/i, r: 'Columnist' },
  { p: /correspondent/i, r: 'Correspondent' },
  { p: /reporter/i, r: 'Reporter' },
  { p: /editor/i, r: 'Editor' },
  { p: /writer/i, r: 'Writer' },
  { p: /business\s*writer/i, r: 'Business Writer' },
  { p: /technology\s*writer/i, r: 'Technology Writer' },
  { p: /entertainment\s*writer/i, r: 'Entertainment Writer' },
  { p: /sports\s*writer/i, r: 'Sports Writer' },
  { p: /health\s*writer/i, r: 'Health Writer' },
  { p: /environment\s*writer/i, r: 'Environment Writer' },
  { p: /international\s*(affairs)?\s*writer/i, r: 'International Affairs Writer' },
  { p: /education\s*writer/i, r: 'Education Writer' },
  { p: /business\s*reporter/i, r: 'Business Reporter' },
  { p: /technology\s*reporter/i, r: 'Technology Reporter' },
  { p: /entertainment\s*reporter/i, r: 'Entertainment Reporter' },
  { p: /sports\s*reporter/i, r: 'Sports Reporter' },
  { p: /health\s*reporter/i, r: 'Health Reporter' },
  { p: /environment\s*reporter/i, r: 'Environment Reporter' },
  { p: /international\s*(affairs)?\s*reporter/i, r: 'International Affairs Reporter' },
  { p: /education\s*reporter/i, r: 'Education Reporter' }
];

function matchRole(text) {
  if (!text || text.length < 3 || text.length > 200) return null;
  for (const { p, r } of ROLE_PATTERNS) {
    if (p.test(text)) return r;
  }
  return null;
}

function isGenericRole(text) {
  if (!text) return false;
  return /^(Reporter|Editor|Journalist|Writer|Correspondent)$/i.test(text.trim());
}

function mapTopicToRole(topic) {
  if (!topic) return 'Journalist';
  const t = String(topic).toLowerCase();
  const m = {
    politics: 'Political Writer',
    business: 'Business Writer',
    technology: 'Technology Writer',
    sports: 'Sports Writer',
    entertainment: 'Entertainment Writer',
    health: 'Health Writer',
    environment: 'Environment Writer',
    crime: 'Crime Reporter',
    international: 'International Affairs Writer',
    education: 'Education Writer'
  };
  return m[t] || 'Journalist';
}

// ============ EXTRACT ROLE FROM BIO ============
function extractRoleFromBio(bio, authorName) {
  if (!bio || bio.length < 20) return null;

  const text = bio.replace(/\s+/g, " ").trim();
  const bioLower = text.toLowerCase();
  const firstName = authorName?.split(/\s+/)[0] || "";
  const lastName = authorName?.split(/\s+/).pop() || "";

  // ✅ LAYER 1 — STRONG EXPLICIT ROLE DICTIONARY 
  const STRONG_ROLES = [
    "Editor-in-Chief", "Managing Editor", "Executive Editor",
    "Senior Editor", "Associate Editor", "Deputy Editor",

    // Bureau & correspondents
    "Bureau Chief", "Principal Correspondent", "Senior Correspondent",
    "Special Correspondent", "Political Correspondent", "Defence Correspondent",
    "Technology Correspondent", "Crime Correspondent", "Business Correspondent",

    // Reporters
    "Chief Reporter", "Senior Reporter", "Staff Reporter", "Investigative Reporter",

    // Domain Editors
    "Political Editor", "Business Editor", "Sports Editor",

    // Broadcast
    "Anchor", "News Anchor", "TV Anchor", "Presenter",

    // Opinion & production
    "Columnist", "Contributing Columnist",
    "News Producer", "Content Producer",
    "Business Writer", "Technology Writer", "Entertainment Writer", "Sports Writer",
    "Health Writer", "Environment Writer", "International Affairs Writer", "Education Writer",
    "Business Reporter", "Technology Reporter", "Entertainment Reporter", "Sports Reporter",
    "Health Reporter", "Environment Reporter", "International Affairs Reporter", "Education Reporter",

    // Corporate leadership
    "Founder", "Co-Founder", "CEO", "Director"
  ];

  const STRONG_REGEX = STRONG_ROLES
    .sort((a, b) => b.length - a.length)
    .map(r => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  // ---- Pattern A: "X is/was/serves as ROLE at Y"
  let match = text.match(
    new RegExp(
      `(?:${firstName}|${lastName}|Mr\\.?|Ms\\.?|Mrs\\.?|Dr\\.?)\\s+[\\w\\.\\s]*?(?:is|was|serves?\\s+as|works?\\s+as)\\s+(?:a\\s+|an\\s+|the\\s+)?(${STRONG_REGEX})(?:\\s+at|\\s+for|\\s+of|\\.|,)`,
      "i"
    )
  );
  if (match?.[1]) return normalizeRole(match[1]);

  // ---- Pattern B: "X, ROLE at Y"
  match = text.match(
    new RegExp(
      `(?:${firstName}|${lastName})\\s*,\\s*(${STRONG_REGEX})(?:\\s+at|\\s+for|\\s+of|\\.|,)`,
      "i"
    )
  );
  if (match?.[1]) return normalizeRole(match[1]);

  // ---- Pattern C: Bio starts with role
  match = text.match(
    new RegExp(`^(${STRONG_REGEX})(?:\\s+at|\\s+for|\\s+of|\\.|,)`, "i")
  );
  if (match?.[1]) return normalizeRole(match[1]);

  // ---- Pattern D: Parenthesis role "Name (Senior Correspondent)"
  match = text.match(
    new RegExp(`\\(\\s*(${STRONG_REGEX})\\s*\\)`, "i")
  );
  if (match?.[1]) return normalizeRole(match[1]);


  //  LAYER 2 — STRUCTURED ROLE PHRASES 

  const STRUCTURED_PHRASES = [
    { p: /editor[\s-]?in[\s-]?chief/i, r: "Editor-in-Chief" },
    { p: /managing\s*editor/i, r: "Managing Editor" },
    { p: /executive\s*editor/i, r: "Executive Editor" },
    { p: /senior\s*correspondent/i, r: "Senior Correspondent" },
    { p: /principal\s*correspondent/i, r: "Principal Correspondent" },
    { p: /special\s*correspondent/i, r: "Special Correspondent" },
    { p: /bureau\s*chief/i, r: "Bureau Chief" },
    { p: /political\s*editor/i, r: "Political Editor" },
    { p: /business\s*editor/i, r: "Business Editor" },
    { p: /sports\s*editor/i, r: "Sports Editor" },
    { p: /investigative\s*reporter/i, r: "Investigative Reporter" },
    { p: /senior\s*reporter/i, r: "Senior Reporter" },
    { p: /chief\s*reporter/i, r: "Chief Reporter" },
    { p: /news\s*anchor/i, r: "News Anchor" },
    { p: /columnist/i, r: "Columnist" }
  ];

  const scanZone = bioLower.slice(0, 250);
  for (const { p, r } of STRUCTURED_PHRASES) {
    if (p.test(scanZone)) return r;
  }


  // LAYER 3 — FALLBACKS


  const hasWritingIndicators =
    /\b(writ|stories?|articles?|author|journalist|journalism|reports?)\b/i.test(bioLower);

  if (hasWritingIndicators && /\bsports?\b/i.test(bioLower)) {
    return "Sports Writer";
  }

  if (hasWritingIndicators && /\bpolitic|government|election\b/i.test(bioLower)) {
    return "Political Writer";
  }

  if (hasWritingIndicators && /\btech|technology|startup|ai\b/i.test(bioLower)) {
    return "Technology Writer";
  }

  if (hasWritingIndicators && /\bbusiness|economy|market\b/i.test(bioLower)) {
    return "Business Writer";
  }

  // ---- Absolute final generic fallback
  const generic = bioLower.match(/\b(correspondent|reporter|journalist|editor|writer)\b/i);
  if (generic) {
    return generic[1].charAt(0).toUpperCase() + generic[1].slice(1);
  }

  return null;
}

//  CLEAN NORMALIZER
function normalizeRole(role) {
  return role
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ============ KNOWN WEBSITES DATABASE ============
const KNOWN_WEBSITES = {
  // English News
  'times of india': 'https://timesofindia.indiatimes.com',
  'the times of india': 'https://timesofindia.indiatimes.com',
  'toi': 'https://timesofindia.indiatimes.com',
  'economic times': 'https://m.economictimes.com',
  'the economic times': 'https://m.economictimes.com',
  'et': 'https://m.economictimes.com',
  'hindustan times': 'https://www.hindustantimes.com',
  'ht': 'https://www.hindustantimes.com',
  'indian express': 'https://indianexpress.com',
  'the indian express': 'https://indianexpress.com',
  'the hindu': 'https://www.thehindu.com',
  'ndtv': 'https://www.ndtv.com',
  'india today': 'https://www.indiatoday.in',
  'mint': 'https://www.livemint.com',
  'livemint': 'https://www.livemint.com',
  'live mint': 'https://www.livemint.com',
  'business standard': 'https://www.business-standard.com',
  'financial express': 'https://www.financialexpress.com',
  'moneycontrol': 'https://www.moneycontrol.com',
  'firstpost': 'https://www.firstpost.com',
  'news18': 'https://www.news18.com',
  'zee news': 'https://zeenews.india.com',
  'republic': 'https://www.republicworld.com',
  'the wire': 'https://thewire.in',
  'scroll': 'https://scroll.in',
  'the quint': 'https://www.thequint.com',
  'quint': 'https://www.thequint.com',
  'the print': 'https://theprint.in',
  'print': 'https://theprint.in',
  'outlook': 'https://www.outlookindia.com',
  'outlook india': 'https://www.outlookindia.com',
  'deccan herald': 'https://www.deccanherald.com',
  'deccan chronicle': 'https://www.deccanchronicle.com',
  'tribune': 'https://www.tribuneindia.com',
  'the tribune': 'https://www.tribuneindia.com',
  'telegraph': 'https://www.telegraphindia.com',
  'the telegraph': 'https://www.telegraphindia.com',
  'asian age': 'https://www.asianage.com',
  'dna': 'https://www.dnaindia.com',
  'mid-day': 'https://www.mid-day.com',
  'midday': 'https://www.mid-day.com',
  'free press journal': 'https://www.freepressjournal.in',
  'business today': 'https://www.businesstoday.in',
  'forbes india': 'https://www.forbesindia.com',
  'cnbc': 'https://www.cnbctv18.com',
  'cnbc tv18': 'https://www.cnbctv18.com',
  'bloomberg': 'https://www.bloombergquint.com',
  'inc42': 'https://inc42.com',
  'yourstory': 'https://yourstory.com',
  'entrackr': 'https://entrackr.com',

  // Hindi News
  'dainik bhaskar': 'https://www.bhaskar.com',
  'amar ujala': 'https://www.amarujala.com',
  'dainik jagran': 'https://www.jagran.com',
  'jagran': 'https://www.jagran.com',
  'navbharat times': 'https://navbharattimes.indiatimes.com',
  'nbt': 'https://navbharattimes.indiatimes.com',
  'patrika': 'https://www.patrika.com',
  'rajasthan patrika': 'https://www.patrika.com',
  'punjab kesari': 'https://www.punjabkesari.in',
  'nai dunia': 'https://www.naidunia.com',
  'prabhat khabar': 'https://www.prabhatkhabar.com',
  'aaj tak': 'https://www.aajtak.in',
  'abp news': 'https://www.abplive.com',
  'zee hindi': 'https://zeenews.india.com/hindi',

  // Regional
  'the new indian express': 'https://www.newindianexpress.com',
  'new indian express': 'https://www.newindianexpress.com',
  'mathrubhumi': 'https://www.mathrubhumi.com',
  'malayala manorama': 'https://www.manoramaonline.com',
  'manorama': 'https://www.manoramaonline.com',
  'anandabazar': 'https://www.anandabazar.com',
  'anandabazar patrika': 'https://www.anandabazar.com',
  'eenadu': 'https://www.eenadu.net',
  'sakshi': 'https://www.sakshi.com',
  'dinamalar': 'https://www.dinamalar.com',
  'dinamani': 'https://www.dinamani.com',
  'daily thanthi': 'https://www.dailythanthi.com',
  'vikatan': 'https://www.vikatan.com',
  'prajavani': 'https://www.prajavani.net',
  'vijay karnataka': 'https://vijaykarnataka.com',
  'samaja': 'https://www.thesamaja.com',
  'divya bhaskar': 'https://www.divyabhaskar.co.in',
  'gujarat samachar': 'https://www.gujaratsamachar.com',
  'sandesh': 'https://www.sandesh.com',
  'lokmat': 'https://www.lokmat.com',
  'sakal': 'https://www.sakaaltimes.com',
  'maharashtra times': 'https://maharashtratimes.com',

  // International
  'bbc': 'https://www.bbc.com/news',
  'bbc news': 'https://www.bbc.com/news',
  'cnn': 'https://www.cnn.com',
  'reuters': 'https://www.reuters.com',
  'guardian': 'https://www.theguardian.com',
  'the guardian': 'https://www.theguardian.com',
  'new york times': 'https://www.nytimes.com',
  'nyt': 'https://www.nytimes.com',
  'washington post': 'https://www.washingtonpost.com',
  'al jazeera': 'https://www.aljazeera.com',
  'nairametrics': 'https://nairametrics.com',
  'stears business': 'http://stearsng.com',
  'stears': 'http://stearsng.com',
  'sports live media': 'https://sportslivemedia.co.za',
  'overton pod':'https://podcastparty.co.za/overton-pod/overton-pod/',
  'enugu metro': 'https://enugumetro.ng',
  'ekiti news': 'https://ekitinews.com.ng',
  'ekitinews': 'https://ekitinews.com.ng',
  'document women': 'https://documentwomen.com',
  'global patriot news': 'https://globalpatriotnews.com',
  'global patriot': 'https://globalpatriotnews.com',
  'katsina times': 'https://katsinatimes.com',
  'katsinatimes': 'https://katsinatimes.com',
  'kemi filani': 'https://www.kemifilani.ng',
  'kemifilani': 'https://www.kemifilani.ng',
  'kemi filani news': 'https://www.kemifilani.ng',

  // Senegal & South Africa
  'actusen': 'https://actusen.sn',
  'l\'actu acho': 'https://www.lactuacho.com',
  'lactu acho': 'https://www.lactuacho.com',
  'dakar midi': 'https://www.dakarmidi.net',
  'buzz senegal': 'https://www.buzzsenegal.com',
  'wrestling world': 'https://www.wrestling-world.com/',
  'the bulletin': 'https://thebulletin.co.za/category/news/',
  'sa people': 'https://www.sapeople.com/',
  'okmzansi': 'https://okmzansi.co.za',
  'IT Web ': 'https://www.itweb.co.za/',
  'gsport for girls':'https://gsport.co.za/category/newsroom/'
};

// ============ STEP 1: DETECT WEBSITE ============
async function detectOutletWebsite(outletName) {
  console.log(`\n[STEP 1] Detecting website for: ${outletName}`);

  const cleanName = outletName.replace(/[^a-zA-Z0-9\s]/g, "").trim();
  const normalizedName = cleanName.toLowerCase();
  const squeezed = normalizedName.replace(/\s+/g, "");


  //  STEP 1: HARD KNOWN MAP 

  if (KNOWN_WEBSITES[normalizedName]) {
    console.log(`  ✓ Found in known websites: ${KNOWN_WEBSITES[normalizedName]}`);
    return KNOWN_WEBSITES[normalizedName];
  }

  for (const [key, url] of Object.entries(KNOWN_WEBSITES)) {
    const keySqueezed = key.replace(/\s+/g, "");
    if (squeezed === keySqueezed) {
      console.log(`  ✓ Partial known match "${key}": ${url}`);
      return url;
    }
  }

  try {
    const guesses = [
      `https://${squeezed}.com`,
      `https://www.${squeezed}.com`,
      `https://${squeezed}.com.ng`,
      `https://www.${squeezed}.com.ng`
    ];
    for (const g of guesses) {
      try {
        const res = await axios.head(g, { timeout: 4000, maxRedirects: 3, validateStatus: s => s < 400 });
        if (res.status >= 200 && res.status < 400) {
          console.log(`  ✓ Direct domain match: ${g}`);
          return g;
        }
      } catch {}
    }
  } catch {}


  // STEP 2: SERPER GLOBAL

  console.log(`  Global search...`);

  const globalQueries = [
    `${cleanName} official website`,
    `${cleanName} news`,
    `${cleanName} media`,
    `${cleanName} newspaper`,
    `"${cleanName}" official`
  ];

  const globalResult = await runSerperTier(globalQueries, cleanName);
  if (globalResult) {
    // --- IMPROVEMENT: Platform rejection and brute force preference ---
    const hostRejected = isPlatformRejected(new URL(globalResult).hostname);
    if (hostRejected) {
      // Try brute force TLD for better domain
      try {
        const tld = await detectCountryTLDFromSearch(cleanName);
        const brute = await bruteForceByTLD(cleanName, tld);
        if (brute) {
          console.log(`  Selected website (prefer brute-force over rejected SERP/Wordpress): ${brute}`);
          return brute;
        } else {
          console.log(`  SERPER result rejected (${hostRejected}), but bruteForce found nothing. Returning rejected SERPER: ${globalResult}`);
        }
      } catch {
        console.log(`  SERPER result rejected (${hostRejected}), bruteForce errored. Returning rejected SERPER: ${globalResult}`);
      }
    } else {
      console.log(`  Selected website: ${globalResult}`);
      return globalResult;
    }
  }
  try {
    const tld = await detectCountryTLDFromSearch(cleanName);
    const brute = await bruteForceByTLD(cleanName, tld);
    if (brute) {
      console.log(`  Selected website (tld brute-force): ${brute}`);
      return brute;
    }
  } catch { }

  //  STEP 4: SMART GLOBAL DOMAIN GUESSING

  console.log(`   Trying domain guessing...`);

  const domainBase = squeezed
    .replace(/the/g, "")
    .replace(/news|media|daily|times|post|tribune|journal/g, "");

  const TLDs = [
    // Global
    "com", "org", "net", "info", "biz", "io", "media", "news",

    // Core Countries 
    "in", "co", "us", "uk", "co.uk",
    "ng", "ke", "za",
    "jp", "kr",
    "ae", "sa",
    "au", "pk",

    // Additional High-Value Countries
    "ca", "nz", "eu",
    "de", "fr", "es", "it", "nl", "se", "no", "fi", "pl",
    "cn", "tw",
    "bd", "lk", "np",
    "br", "mx", "ar", "co",
    "gh", "tz", "ug", "rw", "zw",
    "eg", "ma", "dz", "tn",
    "qa", "kw", "om",
    "tr", "gr", "ro", "hu", "cz", "sk",

    // Professional Media Combos
    "co.in", "co.za", "co.nz", "com.au",
    "com.ng", "com.gh", "co.ke", "co.tz",
    "com.eg", "com.pk", "com.bd", "com.mx",
    "com.br", "com.ar", "com.co"
  ];


  for (const tld of TLDs) {
    const guesses = [
      `https://${domainBase}.${tld}`,
      `https://www.${domainBase}.${tld}`
    ];

    for (const url of guesses) {
      try {
        const res = await axios.head(url, { timeout: 4000, maxRedirects: 3 });
        if (res.status >= 200 && res.status < 400) {
          console.log(`   Domain guess works: ${url}`);
          return url;
        }
      } catch { }
    }
  }

  console.log(`   Could not detect website`);

  // STEP 5: DuckDuckGo fallback
  try {
    console.log(`  🔎 DuckDuckGo fallback search...`);
    const ddgResults = await ddgHtmlSearch(`${cleanName} official website`);
    for (const r of ddgResults.slice(0, 5)) {
      try {
        const u = new URL(r.link);
        if (/facebook|twitter|linkedin|wikipedia|youtube/i.test(u.hostname)) continue;
        const head = await axios.head(r.link, { timeout: 5000 });
        if (head.status >= 200 && head.status < 400) {
          console.log(`   DuckDuckGo selected: ${r.link}`);
          return r.link;
        }
      } catch { }
    }
  } catch { }
  return null;
}

function isPlatformRejected(hostname) {
  const h = hostname.toLowerCase();
  if (h.includes('wordpress.com')) return 'Personal / Owner Blog – Rejected';
  if (h.includes('blogspot.') || h.includes('blogger.com')) return 'Personal / Owner Blog – Rejected';
  if (h.includes('medium.com')) return 'Personal / Owner Blog – Rejected';
  return null;
}

async function validateNewsroomStructure(website) {
  try {
    const $ = await fetchPage(website);
    if (!$) return { ok: false, reason: 'Invalid/Dead link' };
    const text = [
      $('nav').text(),
      $('header').text(),
      $('.menu, .nav, .navigation').text(),
      $('header a, nav a, footer a').text(),
      $('body').text().substring(0, 2000)
    ].join(' ').toLowerCase();
    const sections = [
      'news', 'opinion', 'technology', 'business', 'sports', 'international', 'entertainment', 'books', 'advertorials',
      'music', 'art', 'culture', 'style', 'politics', 'features', 'lifestyle', 'video', 'videos', 'podcast', 'africa'
    ];
    let count = 0;
    const found = new Set();
    for (const s of sections) { if (text.includes(s)) { found.add(s); } }
    count = found.size;
    if (count >= 2) return { ok: true, count };
    return { ok: false, reason: 'Insufficient newsroom categories' };
  } catch { return { ok: false, reason: 'Invalid/Dead link' }; }
}


async function assessActivity(website) {
  try {
    const $ = await fetchPage(website);
    if (!$) return 'Unknown';
    const t = $('body').text().toLowerCase();
    if (/2025|2024/.test(t)) return 'Active';
    if (/2023/.test(t)) return 'Low Activity';
    return 'Unknown';
  } catch { return 'Unknown'; }
}


async function detectOfficialWebsiteWithReport(outletName) {
  const rejected = [];
  let selected = null;
  let source = null;
  const socialPages = await findOutletSocialPages(outletName);
  for (const sp of socialPages) {
    const site = await extractWebsiteFromSocialBio(sp.url);
    if (!site) continue;
    try {
      const u = new URL(site);
      const rej = isPlatformRejected(u.hostname);
      if (rej) { rejected.push({ url: site, reason: rej }); continue; }
      const val = await validateNewsroomStructure(site);
      if (!val.ok) { rejected.push({ url: site, reason: val.reason }); continue; }
      selected = site;
      source = sp.platform;
      break;
    } catch { rejected.push({ url: site, reason: 'Invalid URL' }); }
  }
  if (!selected) {
    const queries = [
      `${outletName} official website`,
      `${outletName} news`,
      `${outletName} media`,
      `${outletName} newspaper`,
      `"${outletName}" official`
    ];
    const google = await runSerperTier(queries, outletName);
    if (google) {
      try {
        const u = new URL(google);
        const rej = isPlatformRejected(u.hostname);
        if (rej) { rejected.push({ url: google, reason: rej }); }
        else {
          const val = await validateNewsroomStructure(google);
          if (!val.ok) { rejected.push({ url: google, reason: val.reason }); }
          else { selected = google; source = 'Google'; }
        }
      } catch { rejected.push({ url: google, reason: 'Invalid URL' }); }
    }
  }
  const official = selected || 'Unverified';
  const activity = official !== 'Unverified' ? await assessActivity(official) : 'Unknown';
  console.log(`Official Website: ${official}`);
  console.log(`Source of Detection: ${source || 'None'}`);
  console.log(`Reason for Selection: ${official !== 'Unverified' ? (source === 'Google' ? 'Search result passed newsroom validation' : 'Found in official social bio and passed validation') : 'No candidate met criteria'}`);
  if (rejected.length) {
    for (const r of rejected.slice(0, 6)) { console.log(`Rejected: ${r.url} – ${r.reason}`); }
  } else {
    console.log(`Rejected: None`);
  }
  console.log(`Activity Status: ${activity}`);
  return { official, source, rejected, activity };
}

async function runSerperTier(queries, outletName) {
  let allResults = [];

  for (const query of queries) {
    const results = await serperSearch(query, 10);
    console.log(`  Query "${query}": ${results.length} results`);
    allResults.push(...results);
  }

  if (!allResults.length) return null;

  const outletKey = outletName.toLowerCase().replace(/\s+/g, "");
  const scored = allResults.map(r => {
    try {
      const url = new URL(r.link);
      let host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
      const hostKey = host.split(".")[0];

      let score = 0;

      // Brand similarity
      if (hostKey === outletKey) score += 1000000;
      if (host.includes(outletKey)) score += 500000;
      if (outletKey.includes(hostKey)) score += 350000;

      //  Title relevance
      if (r.title?.toLowerCase().includes(outletName.toLowerCase())) {
        score += 150000;
      }

      // Homepage priority
      if (url.pathname === "/" || url.pathname === "") score += 100000;
      // Penalize deeper non-root pages
      if (url.pathname.split('/').filter(Boolean).length > 1) score -= 50000;


      //  Massive penalties
      if (/facebook|twitter|linkedin|youtube|wikipedia|reddit|archive|news\.google|apple\.news|flipboard/i.test(host)) {
        score -= 1000000;
      }

      return { hostname: host, score, hostKey };
    } catch {
      return null;
    }
  }).filter(Boolean).sort((a, b) => b.score - a.score);

  if (!scored.length) return null;

  let hostname = scored[0].hostname;
  const topMatches = scored.filter(s => s.hostKey === outletKey || s.hostname.includes(outletKey) || outletKey.includes(s.hostKey));
  const inCandidate = topMatches.find(s => s.hostname.endsWith('.in'));
  const nonInCandidate = topMatches.find(s => !s.hostname.endsWith('.in'));
  if (inCandidate && nonInCandidate) hostname = inCandidate.hostname;

  const KEEP_MOBILE = [
    "m.economictimes.com", "m.timesofindia.com", "m.hindustantimes.com",
    "m.indiatoday.in", "m.thehindu.com", "m.livemint.com", "m.ndtv.com"
  ];

  if (!KEEP_MOBILE.includes(hostname) && hostname.startsWith("m.")) {
    hostname = hostname.substring(2);
  }

  return `https://${hostname}`;
}

async function detectCountryTLDFromSearch(outletName) {
  const tlds = ['za', 'in', 'uk', 'us', 'ng', 'ke', 'au', 'pk'];
  const counts = Object.fromEntries(tlds.map(t => [t, 0]));
  const queries = [outletName, `${outletName} official`, `${outletName} media`];
  for (const q of queries) {
    const rs = await ddgHtmlSearch(q, 12);
    for (const r of rs) {
      try {
        const u = new URL(r.link);
        const host = u.hostname.toLowerCase();
        const ext = host.split('.').pop();
        if (counts.hasOwnProperty(ext)) counts[ext]++;
      } catch { }
    }
  }
  let best = 'com'; let max = -1;
  for (const [t, c] of Object.entries(counts)) { if (c > max) { max = c; best = t; } }
  return best;
}

async function bruteForceByTLD(outletName, tld) {
  const norm = outletName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const base = norm.replace(/\s+/g, '');
  const tokens = new Set([base]);
  if (!/media/.test(base)) tokens.add(`${base}media`);
  if (!/news/.test(base)) tokens.add(`${base}news`);
  const tldVariants = tld && tld.length <= 3 ? [`${tld}`, `co.${tld}`] : [tld || 'com'];
  const prefixes = ['https://', 'http://'];
  const hosts = [];
  for (const b of tokens) {
    for (const tv of tldVariants) {
      hosts.push(`${b}.${tv}`);
      hosts.push(`www.${b}.${tv}`);
    }
  }
  for (const h of hosts) {
    for (const p of prefixes) {
      const url = `${p}${h}`;
      const ok = await verifyUrl(url);
      if (!ok) continue;
      const rej = isPlatformRejected(new URL(url).hostname);
      if (rej) continue;
      const val = await validateNewsroomStructure(url);
      if (val.ok) return url;
    }
  }
  return null;
}

async function inferOutletCountry(website) {
  try {
    const host = new URL(website).hostname.toLowerCase();
    const tld = host.split('.').pop();
    const map = { in: 'India', uk: 'United Kingdom', us: 'United States', ng: 'Nigeria', ke: 'Kenya', za: 'South Africa', jp: 'Japan', kr: 'South Korea', ae: 'United Arab Emirates', sa: 'Saudi Arabia', au: 'Australia', pk: 'Pakistan' };
    let country = map[tld] || null;
    const paths = ['/about', '/about-us', '/contact', '/contact-us'];
    for (const p of paths) {
      const $ = await fetchPage(`${website}${p}`);
      if (!$) continue;
      const text = $('body').text().toLowerCase();
      const orgItems = [];
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const data = JSON.parse($(el).html());
          if (Array.isArray(data)) orgItems.push(...data); else orgItems.push(data);
        } catch { }
      });
      for (const it of orgItems) {
        if (it && it['@type'] === 'Organization') {
          const addr = it.address?.addressCountry || it.foundingLocation || it.location?.address?.addressCountry || it.areaServed;
          if (typeof addr === 'string' && addr.trim()) country = addr.trim();
        }
      }
      if (!country) {
        const countries = ['india', 'united states', 'united kingdom', 'nigeria', 'kenya', 'south africa', 'japan', 'south korea', 'united arab emirates', 'saudi arabia', 'australia', 'pakistan'];
        for (const c of countries) { if (text.includes(c)) { country = c.replace(/\b\w/g, m => m.toUpperCase()); break; } }
      }
      if (country) break;
    }
    return country;
  } catch { return null; }
}

function buildAuthorQueries(website, outletName, country) {
  const host = new URL(website).hostname.replace(/^www\./, '');
  const q = [];
  q.push(`site:${host} authors`);
  q.push(`site:${host} journalists`);
  q.push(`site:${host} editorial team`);
  q.push(`site:${host} contributors`);
  q.push(`site:${host} newsroom`);
  q.push(`"${outletName}" "author profile"`);
  q.push(`"staff writer" "${outletName}"`);
  if (country && typeof country === 'string' && country.length > 1) q.push(`"${outletName}" authors ${country}`);
  return q;
}

async function findAuthorsPagesViaSerper(website, outletName, country) {
  const queries = buildAuthorQueries(website, outletName, country);
  const urls = new Set();
  for (const query of queries) {
    const rs = await serperSearch(query, 10);
    for (const r of rs) {
      try {
        const u = new URL(r.link);
        const base = new URL(website).hostname.split('.').slice(-2).join('.');
        if (u.hostname.endsWith(base)) urls.add(r.link);
      } catch { }
    }
  }
  return Array.from(urls);
}

async function scrapeAuthorsFromDirectoryPage(pageUrl, limit = 50) {
  const $ = await fetchPage(pageUrl);
  if (!$) return [];
  const authors = [];
  const seen = new Set();
  const sels = ['a[href*="/author"]', 'a[href*="/authors"]', 'a[href*="/profile"]', 'a[href*="/team"]', 'a[href*="/contributors"]', '[itemprop="author"] a', '[rel="author"]'];
  for (const sel of sels) {
    $(sel).each((_, el) => {
      if (authors.length >= limit) return false;
      const name = ($(el).attr('title') || $(el).text() || '').trim();
      const href = $(el).attr('href') || '';
      if (!name) return;
      const lower = name.toLowerCase();
      if (seen.has(lower)) return;
      // Validate human name and reject navigation/common strings
      const origin = (() => { try { return new URL(pageUrl).origin; } catch { return ''; } })();
      if (!isValidName(name)) return;
      if (isBlockedAuthorName(name, origin)) return;
      seen.add(lower);
      seen.add(name.toLowerCase());
      if (name.split(' ').length < 2) return;
      const full = href.startsWith('http') ? href : href ? new URL(pageUrl).origin + href : null;
      authors.push({ name, profile: full });
    });
    if (authors.length >= limit) break;
  }
  return authors;
}

// ============ STEP 2: COLLECT 300-400 ARTICLES ============
async function collectArticles(website, target = 350) {
  console.log(`\n[STEP 2] Collecting ${target} articles from: ${website}`);

  const articles = new Map();
  const host = new URL(website).hostname;

  // STEP 1: RSS BOOST
  const rssUrls = [
    '/feed', '/rss', '/rss.xml', '/feed.xml', '/atom.xml',
    '/news/rss', '/latest/rss', '/feeds/rss'
  ];

  for (const path of rssUrls) {
    if (articles.size >= target) break;
    try {
      const res = await axios.get(`${website}${path}`, {
        timeout: 8000,
        headers: { 'User-Agent': getUA() }
      });

      const $ = cheerio.load(res.data, { xmlMode: true });

      $('item, entry').each((_, el) => {
        const title = $(el).find('title').text().trim();
        const link = $(el).find('link').text().trim() || $(el).find('link').attr('href');

        if (!title || !link) return;

        const url = link.startsWith('/') ? `${website}${link}` : link;
        if (url.includes(host)) {
          articles.set(url, { title, url });
        }
      });

    } catch { }
  }

  console.log(`  RSS collected: ${articles.size}`);

  if (articles.size < Math.min(80, target)) {
    try {
      const $root = await fetchPage(website);
      if ($root) {
        const html = $root.html().toLowerCase();
        const isWp = html.includes('wp-content') || (($root('meta[name="generator"]').attr('content') || '').toLowerCase().includes('wordpress'));
        if (isWp) {
          await fetchWordPressPostsInto(website, target, articles);
          if (articles.size < Math.min(60, target)) {
            await fetchWordPressSearchInto(website, target, articles);
          }
        }
      }
    } catch {}
    // Try WordPress REST regardless of detection (some sites block root page)
    try {
      if (articles.size < Math.min(80, target)) {
        await fetchWordPressPostsInto(website, target, articles);
        if (articles.size < Math.min(60, target)) {
          await fetchWordPressSearchInto(website, target, articles);
        }
      }
    } catch {}
  }

  // STEP 2: AUTO-DETECT SECTIONS FROM NAVBAR/FOOTER/INTERNAL LINKS
  const sectionUrls = new Set([
    website,
    `${website}/news`, `${website}/world`,
    `${website}/business`, `${website}/opinion`, `${website}/sports`,
    `${website}/entertainment`, `${website}/tech`, `${website}/politics`
  ]);
  try {
    const base = website.replace(/\/+$/, '');
    const cats = await fetchWordPressCategories(website);
    for (const slug of cats) {
      sectionUrls.add(`${base}/category/${slug}`);
    }
  } catch {}

  try {
    const $ = await fetchPage(website);
    if ($) {
      $('header a[href], nav a[href], footer a[href], a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        if (/\/(news|world|business|sports|opinion|tech|politics|entertainment|lifestyle|cities|education|health|science)\b/i.test(href)) {
          let sec = href.startsWith('/') ? `${website}${href}` : href;
          if (sec.includes(host)) sectionUrls.add(sec.split('?')[0]);
        }
        if (/\/category\//i.test(href)) {
          let sec = href.startsWith('/') ? `${website}${href}` : href;
          if (sec.includes(host)) sectionUrls.add(sec.split('?')[0]);
        }
      });
    }
  } catch { }

  console.log(`  Sections detected: ${sectionUrls.size}`);

  // STEP 3: DEEP SECTION SCRAPING WITH PAGINATION
  for (const section of sectionUrls) {
    if (articles.size >= target) break;

    console.log(`  → Scraping section: ${section}`);

    if (/\/category\//i.test(section)) {
      const feedUrl = `${section.replace(/\/+$/, '')}/feed`;
      try {
        const rf = await fetchRaw(feedUrl, { timeout: 8000, type: 'html' });
        if (!rf) continue;
        const $f = cheerio.load(rf.data, { xmlMode: true });
        $f('item').each((_, el) => {
          if (articles.size >= target) return false;
          const title = $f(el).find('title').text().trim();
          const link = $f(el).find('link').text().trim();
          if (!title || !link) return;
          const url = link.startsWith('/') ? `${website}${link}` : link;
          if (!url.includes(host)) return;
          if (/\/(tag|author|search|archive|topic|video|photo|gallery)\b/i.test(url)) return;
          if (/\.(jpg|png|gif|pdf|mp4|mp3)$/i.test(url)) return;
          if (!articles.has(url)) articles.set(url, { title, url });
        });
      } catch {}
    }
      for (let page = 1; page <= 20; page++) {
        if (articles.size >= target) break;

        const candidates = [];
        if (page === 1) {
          candidates.push(section);
        } else {
          candidates.push(`${section}?page=${page}`);
          candidates.push(`${section}/page/${page}`);
          candidates.push(`${section}?paged=${page}`);
          candidates.push(`${section}?pageno=${page}`);
          candidates.push(`${section}?pagenum=${page}`);
          candidates.push(`${section}?pg=${page}`);
        }

        let $ = null;
        for (const u of candidates) {
          $ = await fetchPage(u);
          if ($) break;
        }
        if (!$) break;

        const before = articles.size;

        $('a[href]').each((_, el) => {
          if (articles.size >= target) return;

          const href = $(el).attr('href');
          const title = $(el).text().trim() || $(el).attr('title');

          if (!href || !title) return;
          if (title.length < 8 || title.length > 300) return;

          let url = href.startsWith('/')
            ? `${website}${href}`
            : href;

        if (!url.includes(host)) return;

        if (/\/(tag|author|search|login|signup|about|policy|terms|archive|topic|video|photo|gallery)\b/i.test(url)) return;
        if (/\.(jpg|png|gif|pdf|mp4|mp3)$/i.test(url)) return;

        const rel = $(el).attr('rel') || '';
        const cls = [$(el).attr('class') || '', $(el).parent().attr('class') || ''].join(' ');
        const isWpRel = /bookmark/i.test(rel) || /(entry-title|post-title|post-link)/i.test(cls);
        const isArticle =
          isWpRel ||
          /\?p=\d+/.test(url) ||
          /\/\d{4}\//.test(url) ||
          /\/\d{4}\/\d{2}\/\d{2}\//.test(url) ||
          /\.(html|cms)$/.test(url) ||
          /article|story|news/.test(url) ||
          /\d{6,}/.test(url) ||
          /articleshow|newsshow/.test(url);

        if (isArticle && !articles.has(url)) {
          articles.set(url, { title, url });
        }
      });

      if (articles.size === before) break;
    }
  }

  if (articles.size < Math.min(50, target)) {
    const sitemapCandidates = [];
    try {
      const robots = await axios.get(`${website.replace(/\/+$/, '')}/robots.txt`, { headers: { 'User-Agent': getUA() }, timeout: 8000, validateStatus: s => s < 500 });
      const lines = String(robots.data || '').split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/sitemap:\s*(https?:\/\/\S+)/i);
        if (m && m[1]) sitemapCandidates.push(m[1].trim());
      }
    } catch {}
    sitemapCandidates.push(`${website}/sitemap_index.xml`);
    sitemapCandidates.push(`${website}/sitemap.xml`);
    sitemapCandidates.push(`${website}/wp-sitemap.xml`);
    sitemapCandidates.push(`${website}/post-sitemap.xml`);
    sitemapCandidates.push(`${website}/sitemap-posts.xml`);
    sitemapCandidates.push(`${website}/sitemap-1.xml`);
    sitemapCandidates.push(`${website}/sitemap-2.xml`);
    sitemapCandidates.push(`${website}/sitemap-news.xml`);
    sitemapCandidates.push(`${website}/sitemap_index.xml?nocache=1`);
    try {
      for (let i = 1; i <= 12 && articles.size < target; i++) {
        try {
          const sm = `${website.replace(/\/+$/, '')}/wp-sitemap-posts-post-${i}.xml`;
          const r = await axios.get(sm, { headers: { 'User-Agent': getUA(), 'Accept': 'application/xml,text/xml;q=0.9,*/*;q=0.8' }, timeout: 10000, validateStatus: s => s < 500 });
          const $p = cheerio.load(r.data, { xmlMode: true });
          $p('loc').each((_, el) => {
            if (articles.size >= target) return false;
            const u = $p(el).text().trim();
            if (!u || !u.includes(host)) return;
            if (/\/(tag|author|search|archive|topic|video|photo|gallery)\b/i.test(u)) return;
            if (/\.(jpg|png|gif|pdf|mp4|mp3)$/i.test(u)) return;
            const isArticle =
              /\?p=\d+/.test(u) ||
              /\/\d{4}\//.test(u) ||
              /\/\d{4}\/\d{2}\/\d{2}\//.test(u) ||
              /\.(html|cms)$/.test(u) ||
              /article|story|news/.test(u) ||
              /\d{6,}/.test(u) ||
              /articleshow|newsshow/.test(u);
            if (isArticle && !articles.has(u)) {
              articles.set(u, { title: '', url: u });
            }
          });
        } catch {}
      }
    } catch {}
    for (const sm of sitemapCandidates) {
      if (articles.size >= target) break;
      try {
        const res = await axios.get(sm, { headers: { 'User-Agent': getUA(), 'Accept': 'application/xml,text/xml;q=0.9,*/*;q=0.8' }, timeout: 12000, validateStatus: s => s < 500 });
        const $ = cheerio.load(res.data, { xmlMode: true });
        const locs = [];
        $('loc').each((_, el) => {
          if (articles.size >= target) return false;
          const loc = $(el).text().trim();
          if (!loc) return;
          locs.push(loc);
        });
        let childFetched = 0;
        for (const loc of locs) {
          if (articles.size >= target) break;
          if (/\.(xml)(\?.*)?$/.test(loc) && loc.includes(host) && childFetched < 6) {
              try {
              const r2 = await axios.get(loc, { headers: { 'User-Agent': getUA(), 'Accept': 'application/xml,text/xml;q=0.9,*/*;q=0.8' }, timeout: 12000, validateStatus: s => s < 500 });
              const $2 = cheerio.load(r2.data, { xmlMode: true });
              $2('loc').each((_, el2) => {
                if (articles.size >= target) return false;
                const u = $2(el2).text().trim();
                if (!u || !u.includes(host)) return;
                if (/\/(tag|author|search|archive|topic|video|photo|gallery)\b/i.test(u)) return;
                if (/\.(jpg|png|gif|pdf|mp4|mp3)$/i.test(u)) return;
                const isArticle =
                  /\?p=\d+/.test(u) ||
                  /\/\d{4}\//.test(u) ||
                  /\/\d{4}\/\d{2}\/\d{2}\//.test(u) ||
                  /\.(html|cms)$/.test(u) ||
                  /article|story|news/.test(u) ||
                  /\d{6,}/.test(u) ||
                  /articleshow|newsshow/.test(u);
                if (isArticle && !articles.has(u)) {
                  articles.set(u, { title: '', url: u });
                }
              });
              childFetched++;
            } catch {}
          } else {
            if (!loc.includes(host)) continue;
            if (/\/(tag|author|search|archive|topic|video|photo|gallery)\b/i.test(loc)) continue;
            if (/\.(jpg|png|gif|pdf|mp4|mp3)$/i.test(loc)) continue;
            const isArticle =
              /\?p=\d+/.test(loc) ||
              /\/\d{4}\//.test(loc) ||
              /\/\d{4}\/\d{2}\/\d{2}\//.test(loc) ||
              /\.(html|cms)$/.test(loc) ||
              /article|story|news/.test(loc) ||
              /\d{6,}/.test(loc) ||
              /articleshow|newsshow/.test(loc);
            if (isArticle && !articles.has(loc)) {
              articles.set(loc, { title: '', url: loc });
            }
          }
        }
      } catch {}
    }
  }

  if (articles.size < Math.min(30, target)) {
    try {
      const $ = await fetchPage(website);
      if ($) {
        const selectors = ['article a[href]', '.post a[href]', '.entry-title a[href]', 'a[rel="bookmark"]', 'h2 a[href]', 'h3 a[href]'];
        for (const sel of selectors) {
          $(sel).each((_, el) => {
            if (articles.size >= target) return false;
            const href = $(el).attr('href');
            const title = $(el).text().trim() || $(el).attr('title') || '';
            if (!href) return;
            let url = href.startsWith('/') ? `${website}${href}` : href;
            if (!url.includes(host)) return;
            if (/\/(tag|category|author|search|archive|topic|section|video|photo|gallery)\b/i.test(url)) return;
            if (/\.(jpg|png|gif|pdf|mp4|mp3)$/i.test(url)) return;
            const isArticle =
              /\/\d{4}\//.test(url) ||
              /\/\d{4}\/\d{2}\/\d{2}\//.test(url) ||
              /\.(html|cms)$/.test(url) ||
              /article|story|news/.test(url) ||
              /\d{6,}/.test(url) ||
              /articleshow|newsshow/.test(url);
            if (isArticle && !articles.has(url)) {
              articles.set(url, { title, url });
            }
          });
        }
      }
    } catch {}
  }

  if (articles.size < Math.min(20, target)) {
    try {
      const hostBase = new URL(website).hostname.replace(/^www\./, '');
      const queries = [
        `site:${hostBase} 2025`,
        `site:${hostBase} 2024`,
        `site:${hostBase} news`,
        `"${hostBase}" site:${hostBase}`
      ];
      for (const q of queries) {
        if (articles.size >= target) break;
        const rs = await ddgHtmlSearch(q, 12);
        for (const r of rs) {
          if (articles.size >= target) break;
          const url = r.link;
          if (!url || !url.includes(hostBase)) continue;
          if (/\/(tag|category|author|profile|search|login|signup|archive|topic|section)\b/i.test(url)) continue;
          if (/\.(jpg|png|gif|pdf|mp4|mp3)$/i.test(url)) continue;
          const isArticle =
            /\/\d{4}\//.test(url) ||
            /\.(html|cms)$/.test(url) ||
            /article|story|news/.test(url) ||
            /\d{6,}/.test(url);
          if (isArticle && !articles.has(url)) {
            const title = r.title || '';
            articles.set(url, { title, url });
          }
        }
      }
    } catch {}
  }

  if (articles.size < Math.min(120, target)) {
    try {
      const hostBase = new URL(website).hostname.replace(/^www\./, '');
      const queries = [
        `site:${hostBase}`,
        `site:${hostBase} 2025`,
        `site:${hostBase} 2024`,
        `site:${hostBase} news`,
        `site:${hostBase} "By"`
      ];
      for (const q of queries) {
        if (articles.size >= target) break;
        const rs = await serperSearch(q, 20);
        for (const r of rs) {
          if (articles.size >= target) break;
          const url = r.link;
          if (!url || !url.includes(hostBase)) continue;
          if (/\/(tag|category|author|profile|search|login|signup|archive|topic|section)\b/i.test(url)) continue;
          if (/\.(jpg|png|gif|pdf|mp4|mp3)$/i.test(url)) continue;
          const isArticle =
            /\/\d{4}\//.test(url) ||
            /\.(html|cms)$/.test(url) ||
            /article|story|news|articleshow|newsshow/.test(url) ||
            /\d{6,}/.test(url);
          if (isArticle && !articles.has(url)) {
            const title = r.title || '';
            articles.set(url, { title, url });
          }
        }
      }
    } catch {}
  }

  console.log(`  Total collected: ${articles.size}`);
  return Array.from(articles.values()).slice(0, target);
}

// ============ STEP 3: EXTRACT AUTHORS FROM ARTICLE BYLINES ============
function isBlockedAuthorName(name, website = "") {
  if (!name) return true;

  const clean = name.trim().toLowerCase();
  const outlet = website.toLowerCase();
  function normalize(str = "") {
    return str
      .toLowerCase()
      .replace(/[^a-z\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  const blockedPatterns = [
    /\bdesk\b/,
    /\bbureau\b/,
    /\bteam\b/,
    /\bstaff\b/,
    /\bpress\b/,
    /\bjournal\b/,
    /\beditorial\b/,
    /\bnetwork\b/,
    /\bcorrespondents?\b/,
    /\breporting\b/,
    /\bnewsroom\b/,
    /\bagency\b/,
    /\bpti\b/,
    /\bani\b/,
    /\breuters\b/,
    /\bap\b/,
    /\bafp\b/,
    /\bpress trust\b/,
    /\bassociated press\b/
  ];

  // Block if it contains outlet name
  if (outlet) {
    const domain = outlet.replace(/^https?:\/\//, "").replace("www.", "");
    const siteName = domain.split('.')[0]; 
    const authorSimplified = clean.replace(/\s+/g, "");
    
    if (authorSimplified.includes(siteName)) {
      return true;
    }

    if (siteName === authorSimplified) {
      return true;
    }
    
    if (clean.includes(domain)) return true;
  }

  // Block if pattern matched
  if (blockedPatterns.some(rx => rx.test(clean))) return true;

  // Block too short junk
  if (clean.length < 5) return true;

  // Block if only one word (eg: Desk, Bureau, Team)
  if (!clean.includes(" ")) return true;

  // Block numeric garbage
  if (/^\d+$/.test(clean)) return true;

  return false;
}
// EXTRACTING AUTHORS AFTER BLOCKING 
async function extractAuthorsFromBylines(articles, website, max = 30) {
  console.log(`\n[STEP 3] Checking bylines in ${articles.length} articles (target: ${max} authors)`);
  const authors = new Map();

  const limit = Math.min(articles.length, 350);

  for (let i = 0; i < limit && authors.size < max; i += 5) {
    const batch = articles.slice(i, i + 5);

    await Promise.all(batch.map(async (article) => {
      if (authors.size >= max) return;

      const $ = await fetchPage(article.url);
      if (!$) return;

      let authorName = null;
      let authorRole = 'Journalist';

      // Method 1: JSON-LD structured data
      $('script[type="application/ld+json"]').each((idx, el) => {
        if (authorName) return false;

        try {
          const data = JSON.parse($(el).html());
          const items = Array.isArray(data) ? data : [data];

          for (const item of items) {
            if (item['@type'] === 'NewsArticle' || item['@type'] === 'Article') {
              const auth = item.author;

              if (typeof auth === 'string' && isValidName(auth) && !isBlockedAuthorName(auth, website)) {
                authorName = auth;
              }
              else if (auth?.name && isValidName(auth.name) && !isBlockedAuthorName(auth.name, website)) {
                authorName = auth.name;
                if (auth.jobTitle) authorRole = auth.jobTitle;
              }
              else if (Array.isArray(auth) && auth[0]?.name && isValidName(auth[0].name) && !isBlockedAuthorName(auth[0].name, website)) {
                authorName = auth[0].name;
                if (auth[0].jobTitle) authorRole = auth[0].jobTitle;
              }
            }
          }
        } catch (e) { }
      });

      // Method 2: Meta tags
      if (!authorName) {
        const meta =
          $('meta[name="author"]').attr('content') ||
          $('meta[property="article:author"]').attr('content');

        if (meta && isValidName(meta) && !isBlockedAuthorName(meta, website)) {
          authorName = meta;
        }
      }

      // Method 3: Byline selectors
      if (!authorName) {
        const bylineSelectors = [
          '.author-name', '.byline-author', '[rel="author"]', '.author', '.byline',
          '.writer-name', '[itemprop="author"] [itemprop="name"]', '[itemprop="author"]',
          '.story-author', '.article-author', '.post-author',
          '.byline a', '.entry-meta .byline a', '.post-meta .byline a',
          '.meta-author a', '.td-post-author-name a', '.jeg_meta_author a', '.author-link a',
          '.single-post-meta .author a', '.post-meta .author a'
        ];

        for (const sel of bylineSelectors) {
          const $el = $(sel).first();

          let name = $el
            .text()
            .trim()
            .replace(/^by\s+/i, '')
            .replace(/\|.*$/, '')
            .trim();

          if ((!name || /^by$/i.test(name)) && $el.length) {
            const $child = $el.find('a,[itemprop="name"],.author-name,strong').first();
            const childText = ($child.text() || '').trim();
            if (childText) {
              name = childText.replace(/^by\s+/i, '').replace(/\|.*$/, '').trim();
            }
          }

          if (name.includes(',')) {
            const parts = name.split(',');
            name = parts[0].trim();
            const potentialRole = parts.slice(1).join(',').trim();
            const role = matchRole(potentialRole);
            if (role) authorRole = role;
          }

          if (name && isValidName(name) && !isBlockedAuthorName(name, website)) {
            authorName = name;

            const parent = $el.closest('.author-info, .byline-wrapper, .author-box, .author-details');
            const roleText = parent
              .find('.title, .role, .designation, .author-designation, .author-title')
              .first()
              .text()
              .trim();

            const role = matchRole(roleText);
            if (role) authorRole = role;
            break;
          }
        }

        if (!authorName) {
          const bodyText = $('body').text();
          const m = bodyText.match(/\bBy\s+([A-Z][\p{L}'\-]+(?:\s+[A-Z][\p{L}'\-]+){1,4})\b/u);
          if (m && m[1] && isValidName(m[1]) && !isBlockedAuthorName(m[1], website)) {
            authorName = m[1];
          }
        }
      }

      // Final add to authors map (with blocker protection)
      if (authorName && !isBlockedAuthorName(authorName, website)) {
        if (!authors.has(authorName)) {
          authors.set(authorName, { name: authorName, role: authorRole, articles: [article] });
        } else {
          authors.get(authorName).articles.push(article);
        }
      }
    }));

    if (i % 30 === 0) {
      console.log(`  Progress: ${i}/${limit} articles → ${authors.size}/${max} authors`);
    }

    await delay(200);
  }

  console.log(`  ✓ Found ${authors.size} unique authors from bylines`);
  return Array.from(authors.values()).slice(0, max);
}
function validateAuthorPage($, authorName, pageUrl = null) {
  const pageText = $("body").text().toLowerCase();
  const name = authorName.toLowerCase();
  const titleText = ($('title').text() || '').toLowerCase();
  const path = (() => { try { return pageUrl ? new URL(pageUrl).pathname.toLowerCase() : ''; } catch { return ''; } })();

  let score = 0;

  // Strong signals
  if (pageText.includes(name)) score += 5;
  if ($("meta[property='og:type']").attr("content")?.includes("profile")) score += 3;
  if ($("meta[name='author']").attr("content")?.toLowerCase().includes(name)) score += 5;
  if (titleText.includes(name)) score += 3;
  if (/author|writer|columnist|profile|people|contributors|staff|byline/.test(path)) score += 3;

  // Bio / profile indicators
  if (/about|bio|profile|journalist|writer|columnist/i.test(pageText)) score += 2;

  // Social links are strong indicators
  if ($("a[href*='twitter']").length) score += 1;
  if ($("a[href*='linkedin']").length) score += 1;

  // Heavy penalties
  if (/breaking news|latest news|live updates|category|archive/i.test(pageText)) {
    score -= 10;
  }

  return score >= 5;
}

// ============ STEP 4: FIND AUTHOR PROFILE PAGE VIA SERPER ============
async function findAuthorProfile(authorName, website) {
  const hostname = new URL(website).hostname.replace(/^www\./, "");
  const hostParts = hostname.split('.');
  const baseDomain = hostParts.slice(-2).join('.');
  const base = authorName.toLowerCase().trim();
  const nameSlug = base.replace(/\s+/g, "-");
  const nameUnderscore = base.replace(/\s+/g, "_");
  const firstName = base.split(" ")[0];

  // STEP 1: HIGH-PRECISION SERPER SEARCH FIRST
  const primaryQueries = [
    `"${authorName}" site:${hostname} author`,
    `"${authorName}" site:${hostname} profile`,
    `"${authorName}" site:${hostname} columnist`,
    `"${authorName}" site:${hostname} writer`,
    `"${authorName}" site:${hostname} byline`,
    `"${authorName}" site:${hostname} "author profile"`,
    `"${authorName}" site:${hostname} about`,
    `"${authorName}" "${hostname}" profile`
  ];

  let serperResults = [];

  for (const q of primaryQueries) {
    const results = await serperSearch(q, 10);
    serperResults.push(...results);
  }

  if (serperResults.length) {
    const scored = serperResults.map(r => {
      try {
        const url = new URL(r.link);
        const host = url.hostname.replace(/^www\./, "").toLowerCase();
        const path = url.pathname.toLowerCase();

        let score = 0;

        // Strong author indicators
        if (/author|writer|columnist|profile|people|contributors|staff|byline/.test(path)) score += 600000;

        // Name match
        if (path.includes(nameSlug)) score += 300000;
        if (path.includes(nameUnderscore)) score += 200000;
        if (path.includes(firstName)) score += 50000;
        if (r.title?.toLowerCase().includes(base)) score += 150000;

        // Correct domain
        if (host === hostname) score += 500000;
        if (host.endsWith(baseDomain)) score += 400000;

        // Heavy penalties
        if (/tag|search|category|archive|topic|section|news/.test(path)) score -= 400000;
        if (/facebook|twitter|linkedin|youtube|wikipedia/.test(host)) score -= 900000;

        return { url: r.link, score };
      } catch {
        return null;
      }
    })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    for (const item of scored.slice(0, 5)) {
      const $ = await fetchPage(item.url);
      if ($ && validateAuthorPage($, authorName, item.url)) {
        return { url: item.url, $ };
      }
    }
  }

  // STEP 2: DIRECT PATTERN FALLBACK ONLY IF SERPER FAILS
  const patterns = [
    `${website}/author/${nameSlug}`,
    `${website}/authors/${nameSlug}`,
    `${website}/columnist/${nameSlug}`,
    `${website}/writer/${nameSlug}`,
    `${website}/profile/${nameSlug}`,
    `${website}/people/${nameSlug}`,
    `${website}/contributors/${nameSlug}`,
    `${website}/byline/${nameSlug}`,
    `${website}/${nameSlug}`,

    `${website}/author/${nameUnderscore}`,
    `${website}/writer/${nameUnderscore}`,
    `${website}/profile/${nameUnderscore}`,
    `${website}/?author_name=${nameSlug}`,
    `${website}/?author_name=${nameUnderscore}`,

    `${website}/etreporter/author-${nameSlug}`,
    `${website}/etreporter/author-${nameUnderscore}`
  ];

  for (const url of patterns) {
    const $ = await fetchPage(url);
    if ($ && validateAuthorPage($, authorName, url)) {
      return { url, $ };
    }
    // Accept verified author URLs even if blocked
    try {
      const u = new URL(url);
      const path = u.pathname.toLowerCase();
      const qs = u.search.toLowerCase();
      const isAuthorPath = /author|writer|columnist|profile|people|contributors|staff|byline/.test(path) || /author_name=/.test(qs);
      if (isAuthorPath) {
        return { url, $: null };
      }
    } catch {}
  }

  return { url: null, $: null };
}

// ============ STEP 4B: FIND AUTHOR ARTICLES VIA SERPER (FALLBACK) ============
async function findAuthorArticlesViaSerper(authorName, website, max = 20) {
  const hostname = new URL(website).hostname.replace(/^www\./, "");
  const queries = [
    `"${authorName}" site:${hostname}`,
    `"${authorName}" site:${hostname} article`,
    `"${authorName}" site:${hostname} by`
  ];
  let results = [];
  for (const q of queries) {
    const r = await serperSearch(q, 10);
    results.push(...r);
  }

  const articles = [];
  const seen = new Set();
  for (const r of results) {
    try {
      const u = new URL(r.link);
      const host = u.hostname.replace(/^www\./, "");
      const path = u.pathname.toLowerCase();
      if (host !== hostname) continue;
      if (/tag|category|author|profile|search|login|signup|archive|topic|section/i.test(path)) continue;
      if (/\.(jpg|png|gif|pdf|mp4|mp3)$/i.test(path)) continue;
      const isArticle = /\/\d{4}\//.test(path) || /article|story|news|articleshow|newsshow|\.html|\.cms/.test(path) || /\d{6,}/.test(path);
      const url = r.link.split('#')[0];
      if (isArticle && !seen.has(url)) {
        seen.add(url);
        const title = r.title || '';
        if (title && title.length >= 10) articles.push({ title, url });
        if (articles.length >= max) break;
      }
    } catch { }
  }
  return articles;
}

// ============ STEP 5: SCRAPE ARTICLES FROM PROFILE PAGE ============
async function scrapeArticlesFromProfile($, profileUrl, authorName, website) {
  if (!profileUrl) return [];

  const articles = new Map();
  const host = new URL(website).hostname;

  const basePages = [
    profileUrl,
    `${profileUrl}?page=2`,
    `${profileUrl}/page/2`
  ];

  // If page HTML is available, parse links
  if ($) {
    for (const pageUrl of basePages) {
      if (articles.size >= 10) break;
      const $$ = pageUrl === profileUrl ? $ : await fetchPage(pageUrl);
      if (!$$) continue;
      $$('a[href]').each((i, el) => {
        if (articles.size >= 10) return false;
        const href = $$(el).attr('href');
        const title = $$(el).text().trim() || $$(el).attr('title');
        if (!href || !title || title.length < 15 || title.length > 300) return;
        let url = href.startsWith('/') ? `${website}${href}` : href;
        if (!url.includes(host)) return;
        if (/\/(tag|category|author|profile|page|search|archive|topic|section)\//i.test(url)) return;
        if (/\.(jpg|png|gif|pdf|mp4|mp3)$/i.test(url)) return;
        const isArticle =
          /\/\d{4}\//.test(url) ||
          /\.(html|cms)$/.test(url) ||
          /article|story|news/.test(url) ||
          /\d{6,}/.test(url);
        if (isArticle && !articles.has(url)) {
          articles.set(url, { title, url });
        }
      });
    }
  }

  // If blocked, use author RSS feeds
  if (articles.size < 10) {
    const feeds = [];
    const base = profileUrl.replace(/\/+$/, '');
    if (/\?author_name=/.test(profileUrl)) {
      feeds.push(`${profileUrl}&feed=rss2`);
      feeds.push(`${profileUrl}&feed=atom`);
    } else {
      feeds.push(`${base}/feed`);
    }
    for (const f of feeds) {
      try {
        const res = await axios.get(f, { headers: { 'User-Agent': getUA() }, timeout: 10000 });
        const $rss = cheerio.load(res.data, { xmlMode: true });
        $rss('item, entry').each((_, el) => {
          if (articles.size >= 10) return false;
          const title = $rss(el).find('title').text().trim();
          const link = $rss(el).find('link').text().trim() || $rss(el).find('link').attr('href');
          if (!title || !link) return;
          const url = link.startsWith('/') ? `${website}${link}` : link;
          if (!url.includes(host)) return;
          if (/\/(tag|author|search|archive|topic|video|photo|gallery)\b/i.test(url)) return;
          if (/\.(jpg|png|gif|pdf|mp4|mp3)$/i.test(url)) return;
          if (!articles.has(url)) {
            articles.set(url, { title, url });
          }
        });
        if (articles.size >= 10) break;
      } catch {}
    }
  }

  return Array.from(articles.values());
}

// ============ STEP 6: VERIFY ARTICLES BELONG TO AUTHOR ============
async function verifyArticles(articles, authorName) {
  if (!articles.length) return [];

  const verified = [];
  const firstName = authorName.split(/\s+/)[0].toLowerCase();
  const lastName = authorName.split(/\s+/).pop()?.toLowerCase() || '';

  for (const article of articles) {
    if (verified.length >= 5) break;

    const $ = await fetchPage(article.url);
    if (!$) continue;

    let isAuthorMatch = false;

    // Method 1: JSON-LD author check
    $('script[type="application/ld+json"]').each((_, el) => {
      if (isAuthorMatch) return false;

      try {
        const data = JSON.parse($(el).html());
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          if (item.author) {
            const auth = item.author;

            if (
              typeof auth === 'string' &&
              auth.toLowerCase().includes(firstName) &&
              (!lastName || auth.toLowerCase().includes(lastName))
            ) {
              isAuthorMatch = true;
            }

            if (
              auth?.name &&
              auth.name.toLowerCase().includes(firstName) &&
              (!lastName || auth.name.toLowerCase().includes(lastName))
            ) {
              isAuthorMatch = true;
            }

            if (
              Array.isArray(auth) &&
              auth[0]?.name &&
              auth[0].name.toLowerCase().includes(firstName) &&
              (!lastName || auth[0].name.toLowerCase().includes(lastName))
            ) {
              isAuthorMatch = true;
            }
          }
        }
      } catch { }
    });

    // Method 2: Byline check
    if (!isAuthorMatch) {
      const bylineText = $(
        '.author, .byline, .author-name, .byline-author, [rel="author"], [itemprop="author"]'
      )
        .first()
        .text()
        .toLowerCase();

      if (
        bylineText.includes(firstName) &&
        (!lastName || bylineText.includes(lastName))
      ) {
        isAuthorMatch = true;
      }
      // Explicit "By Name" pattern
      if (!isAuthorMatch) {
        const bodyText = $('body').text().toLowerCase();
        if (bodyText.includes(`by ${firstName}`) && (!lastName || bodyText.includes(lastName))) {
          isAuthorMatch = true;
        }
      }
    }

    if (isAuthorMatch) {
      verified.push(article);
    }
  }

  return verified;
}
// ============ ARTICLE DATE EXTRACTION ==========
function extractPublicationDate($, url) {
  try {
    let iso = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      if (iso) return false;
      try {
        const data = JSON.parse($(el).html());
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item.datePublished) { iso = String(item.datePublished); break; }
          if (item.dateModified) { iso = String(item.dateModified); }
        }
      } catch {}
    });
    if (!iso) {
      iso =
        $('meta[property="article:published_time"]').attr('content') ||
        $('meta[property="og:published_time"]').attr('content') ||
        $('meta[property="og:updated_time"]').attr('content') ||
        $('meta[itemprop="datePublished"]').attr('content') ||
        $('meta[itemprop="dateModified"]').attr('content') ||
        $('meta[name="pubdate"]').attr('content') ||
        $('meta[name="lastmod"]').attr('content') ||
        $('meta[name="date"]').attr('content') ||
        null;
    }
    if (!iso) {
      const t = $('time[datetime]').attr('datetime') || $('time').attr('datetime') || null;
      if (t) iso = t;
    }
    if (!iso) {
      const body = $('body').text();
      const m = body.match(/(\d{4}-\d{2}-\d{2}|\d{2}\s+[A-Za-z]{3,9}\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/);
      if (m) iso = m[1];
    }
    if (iso) {
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  } catch {}
  return null;
}

async function inferLastActiveDate(articles) {
  const limits = articles.slice(0, 10);
  let best = null;
  for (const a of limits) {
    const $ = await fetchPage(a.url);
    if (!$) continue;
    const iso = extractPublicationDate($, a.url);
    if (iso) {
      const d = new Date(iso);
      if (!isNaN(d.getTime())) {
        if (!best || d > best) best = d;
      }
    }
  }
  return best ? best.toISOString() : null;
}

// ============ STEP 8B: SCRAPE SOCIAL FROM ARTICLE PAGES (FALLBACK) ============
async function scrapeSocialFromArticlePages(articles, authorName, website, outletName) {
  const socials = { twitter: null, linkedin: null };
  const firstName = authorName.split(/\s+/)[0].toLowerCase();
  const lastName = authorName.split(/\s+/).pop()?.toLowerCase() || '';
  for (const art of articles.slice(0, 5)) {
    const $ = await fetchPage(art.url);
    if (!$) continue;
    if (!socials.twitter) {
      const a = $('a[href*="twitter.com/"], a[href*="x.com/"]').first();
      const href = a.attr('href');
      if (href && !/status|intent|hashtag|search/.test(href)) {
        const m = href.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/);
        if (m) {
          const username = m[1].toLowerCase();
          if (username.includes(firstName) || (lastName && username.includes(lastName))) {
            const url = `https://twitter.com/${m[1]}`;
            if (await verifyUrl(url)) {
              const ok = await socialPageMatchesOutlet(url, website, outletName);
              if (ok) socials.twitter = url;
            }
          }
        }
      }
    }
    if (!socials.linkedin) {
      const a2 = $('a[href*="linkedin.com/in/"]').first();
      const href2 = a2.attr('href');
      if (href2) {
        const m2 = href2.match(/(https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+)/);
        if (m2) {
          const slug = (m2[1].split('/in/')[1] || '').toLowerCase();
          if (slug.includes(firstName) || (lastName && slug.includes(lastName))) {
            const url = m2[1];
            if (await verifyUrl(url)) {
              const ok = await socialPageMatchesOutlet(url, website, outletName);
              if (ok) socials.linkedin = url;
            }
          }
        }
      }
    }
    if (socials.twitter && socials.linkedin) break;
  }
  return socials;
}

// ============ OUTLET NAME SYNONYMS FOR SOCIAL SEARCH ============
function getOutletSynonyms(website) {
  try {
    const host = new URL(website).hostname.toLowerCase();
    const parts = host.split('.');
    const base = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    const synonyms = new Set();
    if (/timesofindia|indiatimes/.test(host) || base === 'timesofindia' || base === 'indiatimes') {
      synonyms.add('times of india');
      synonyms.add('toi');
      synonyms.add('indiatimes');
    }
    if (/economictimes/.test(host) || base === 'economictimes') { synonyms.add('economic times'); synonyms.add('et'); synonyms.add('times group'); }
    if (/hindustantimes/.test(host) || base === 'hindustantimes') { synonyms.add('hindustan times'); synonyms.add('ht'); }
    if (/indianexpress/.test(host) || base === 'indianexpress') { synonyms.add('indian express'); }
    if (/thehindu/.test(host) || base === 'thehindu') { synonyms.add('the hindu'); }
    if (/livemint/.test(host) || base === 'livemint' || base === 'mint') { synonyms.add('livemint'); synonyms.add('mint'); }
    if (/icirnigeria/.test(host) || base === 'icirnigeria') {
      synonyms.add('icir');
      synonyms.add('icir nigeria');
      synonyms.add('international centre for investigative reporting');
    }
    if (/stears/.test(host) || base === 'stears' || base === 'stearsng') {
      synonyms.add('stears');
      synonyms.add('stears business');
      synonyms.add('stearsng');
    }
    if (/zikoko/.test(host) || base === 'zikoko') {
      synonyms.add('zikoko');
    }
    if (/politicsnigeria/.test(host) || base === 'politicsnigeria') {
      synonyms.add('politics nigeria');
    }
    if (/dailynigerian/.test(host) || base === 'dailynigerian') {
      synonyms.add('daily nigerian');
    }
    if (/rpublc/.test(host) || base === 'rpublc' || /republic/.test(host)) {
      synonyms.add('the republic');
      synonyms.add('republic');
      synonyms.add('rpublc');
    }
    return Array.from(synonyms).filter(s => s && s.length > 2);
  } catch { return []; }
}
function buildOutletMatchTokens(website, outletName) {
  const tokens = new Set();
  const syns = getOutletSynonyms(website);
  const nameLower = (outletName || '').toLowerCase();
  if (nameLower) tokens.add(nameLower);
  syns.forEach(s => { if (s) tokens.add(String(s).toLowerCase()); });
  const host = (() => { try { return new URL(website).hostname.toLowerCase(); } catch { return ''; } })();
  if (/economictimes/.test(host) || /economic\s+times/.test(nameLower)) {
    tokens.add('economic times');
    tokens.add('et');
    tokens.add('times group');
    tokens.add('et reporter');
  }
  tokens.add('business journalist');
  return Array.from(tokens);
}
async function socialPageMatchesOutlet(url, website, outletName, snippet = '') {
  const tokens = buildOutletMatchTokens(website, outletName);
  
  // 1. Fast Check: Use search snippet if available
  if (snippet) {
    const text = snippet.toLowerCase();
    if (tokens.some(t => t && text.includes(t.toLowerCase()))) return true;
  }

  try {
    const $ = await fetchPage(url);
    if ($) {
      const text = [
        $('meta[property="og:title"]').attr('content') || '',
        $('meta[property="og:description"]').attr('content') || '',
        $('meta[name="description"]').attr('content') || '',
        $('h1').first().text() || '',
        $('body').text().substring(0, 1500) || ''
      ].join(' ').toLowerCase();
      if (tokens.some(t => t && text.includes(t.toLowerCase()))) return true;
    }
  } catch { }
  
  // Fallback: Check if URL structure implies a personal profile, then confirm via Search
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();
    let qs = [];
    if (h.includes('linkedin.com') && /\/in\//.test(path)) {
      const slug = path.split('/in/')[1]?.split('/')[0] || '';
      const syns = getOutletSynonyms(website);
      qs = [
        `"${slug}" site:linkedin.com/in`,
        `"${slug}" ${outletName} site:linkedin.com/in`,
        ...(syns.slice(0, 3).map(s => `"${slug}" "${s}" site:linkedin.com/in`))
      ];
    } else if ((h.includes('twitter.com') || h.includes('x.com')) && path.split('/').filter(Boolean).length >= 1) {
      const user = path.split('/').filter(Boolean)[0];
      const syns = getOutletSynonyms(website);
      qs = [
        `"${user}" ${outletName} twitter`,
        ...(syns.slice(0, 3).map(s => `"${user}" "${s}" twitter`))
      ];
    }
    for (const q of qs) {
      const rs = await serperSearch(q, 6);
      for (const r of rs) {
        const txt = `${r.title || ''} ${r.snippet || ''}`.toLowerCase();
        if (tokens.some(t => t && txt.includes(t.toLowerCase()))) return true;
      }
    }
    if (qs.length) {
      for (const q of qs) {
        const drs = await ddgHtmlSearch(q, 6);
        for (const r of drs) {
          const txt = `${r.title || ''} ${r.snippet || ''}`.toLowerCase();
          if (tokens.some(t => t && txt.includes(t.toLowerCase()))) return true;
        }
      }
    }
  } catch { }
  return false;
}
// ============ STEP 7: EXTRACT ROLE & EMAIL FROM BYLINE ============
function extractRoleAndEmail($, authorName) {
  let role = null;
  let email = null;
  const firstName = authorName.split(/\s+/)[0].toLowerCase();

  // Role from dedicated selectors
  const roleSelectors = ['.author-designation', '.author-title', '.role', '.designation',
    '[itemprop="jobTitle"]', '[class*="designation"]', '.author-role'];
  for (const sel of roleSelectors) {
    const text = $(sel).first().text().trim();
    const r = matchRole(text);
    if (r && r !== 'Journalist') { role = r; break; }
  }

  // Role from JSON-LD Person
  if (!role) {
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'Person' && item.jobTitle) {
            const r = matchRole(item.jobTitle);
            if (r && r !== 'Journalist') { role = r; return false; }
          }
        }
      } catch { }
    });
  }

  // Role from text after author name (byline format: "Name, Role")
  if (!role) {
    const pageText = $('body').text();
    const idx = pageText.indexOf(authorName);
    if (idx !== -1) {
      const after = pageText.substring(idx + authorName.length, idx + authorName.length + 100);
      // Check for "Name, Role" or "Name | Role" pattern
      const match = after.match(/^[\s,|•\-–—]+([^,|\n]{3,50})/);
      if (match) {
        const r = matchRole(match[1]);
        if (r) role = r;
      }
    }
  }

  if (!email) {
    const els = ['.author-email', '.contact-email', '[itemprop="email"]', '.email'];
    for (const sel of els) {
      const t = $(sel).first().text().trim();
      if (!t) continue;
      let e = t;
      e = e.replace(/\s*\[?\s*at\s*\]?\s*/gi, '@');
      e = e.replace(/\s*\[?\s*dot\s*\]?\s*/gi, '.');
      e = e.replace(/\(at\)/gi, '@').replace(/\(dot\)/gi, '.');
      const m = e.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (m && !/^info@|^editor@|^newsdesk@|^contact@|^support@/i.test(m[0])) { email = m[0]; break; }
    }
  }

  if (!email) {
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'Person' && typeof item.email === 'string') {
            const e = String(item.email).trim();
            if (e && /@/.test(e) && !/^info@|^editor@|^newsdesk@|^contact@|^support@/i.test(e)) { email = e; return false; }
          }
        }
      } catch { }
    });
  }

  // Email from mailto links
  $('a[href^="mailto:"]').each((i, el) => {
    if (email) return false;
    const href = $(el).attr('href');
    const e = href.replace('mailto:', '').split('?')[0].trim();
    if (e && e.includes('@') && !e.includes('example.com') &&
      !/^info@/i.test(e) && !/^editor@/i.test(e) && !/^newsdesk@/i.test(e) && !/^contact@/i.test(e) && !/^support@/i.test(e)) {
      email = e;
    }
  });

  // Email from text pattern
  if (!email) {
    const emailMatch = $('body').text().match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch && !emailMatch[0].includes('example.com')) {
      const e = emailMatch[0];
      if (!/^info@/i.test(e) && !/^editor@/i.test(e) && !/^newsdesk@/i.test(e) && !/^contact@/i.test(e) && !/^support@/i.test(e)) {
        email = e;
      }
    }
  }

  return { role, email };
}

// ============ STEP 8: SERPER SEARCH FOR TWITTER & LINKEDIN ============
async function findSocialLinksViaSerper(authorName, outletName, website) {
  const links = { twitter: null, linkedin: null };

  const firstName = authorName.split(/\s+/)[0].toLowerCase();
  const lastName = authorName.split(/\s+/).pop()?.toLowerCase() || "";
  const outletLower = outletName.toLowerCase();

  // Dynamic Reject Patterns: Block outlet brand accounts
  const host = new URL(website).hostname.replace(/^www\./, '');
  const domainBase = host.split('.')[0];
  const outletSlug = outletLower.replace(/[^a-z0-9]/g, '');
  
  // Create a regex that blocks: generic words, the outlet name itself, and the domain base
  const rejectParts = [
    'news', 'official', 'team', 'support', 'contact', 'media', 'daily', 'weekly',
    'editors', 'desk', 'bureau', 'staff', 'digital', 'online',
    outletSlug, 
    domainBase
  ].filter(s => s && s.length > 3); 
  
  const rejectRe = new RegExp(rejectParts.join('|'), 'i');

  const syns = getOutletSynonyms(website);
  const primarySyn = syns[0] || outletName;

  // --- PREPARE QUERIES ---
  const twitterQueries = [
    `"${authorName}" "${primarySyn}" twitter`,
    `"${authorName}" twitter journalist`
  ];
  
  const linkedinQueries = [
    `"${authorName}" "${primarySyn}" site:linkedin.com/in`,
    `"${authorName}" site:linkedin.com/in`
  ];

  // --- HELPER: SEARCH & PARSE ---
  const runSearches = async (queries, platform) => {
    const allResults = [];
    // Run all queries for this platform in parallel
    const promises = queries.map(q => serperSearch(q, 8)); 
    const results = await Promise.all(promises);
    
    results.flat().forEach(r => {
      if (!r.link) return;
      const link = r.link;
      
      // Basic URL Validation
      if (platform === 'twitter') {
        if (!link.includes("twitter.com") && !link.includes("x.com")) return;
        if (/\/status\/|\/intent\/|\/hashtag\/|\/search/.test(link)) return;
      } else if (platform === 'linkedin') {
        if (!/linkedin\.com\/(in|pub)\//.test(link)) return;
        if (/\/company\/|\/jobs\/|\/pulse\//.test(link)) return;
      }
      
      // Extract Username/Slug for Rejection Check
      let identifier = '';
      if (platform === 'twitter') {
        const m = link.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/);
        if (m) identifier = m[1].toLowerCase();
      } else {
        const m = link.match(/\/in\/([a-zA-Z0-9_-]+)/);
        if (m) identifier = m[1].toLowerCase();
      }
      
      if (!identifier || rejectRe.test(identifier)) return;
      
      // Scoring
      let score = 0;
      const text = `${r.title || ""} ${r.snippet || ""}`.toLowerCase();
      
      if (text.includes(authorName.toLowerCase())) score += 5;
      else {
        if (text.includes(firstName)) score += 2;
        if (lastName && text.includes(lastName)) score += 2;
      }
      
      if (text.includes(outletLower)) score += 3;
      if (syns.some(s => text.includes(s.toLowerCase()))) score += 2;
      if (text.includes('journalist') || text.includes('writer') || text.includes('reporter')) score += 1;
      
      // Username matching
      if (identifier.includes(firstName)) score += 2;
      if (lastName && identifier.includes(lastName)) score += 2;

      allResults.push({ url: link, score, snippet: text });
    });
    
    // Dedup by URL
    const unique = [];
    const seen = new Set();
    allResults.sort((a, b) => b.score - a.score);
    for (const item of allResults) {
      if (!seen.has(item.url)) {
        seen.add(item.url);
        unique.push(item);
      }
    }
    return unique;
  };

  // --- EXECUTE SEARCHES ---
  console.log(`      Running parallel searches for Twitter & LinkedIn...`);
  const [twitterCandidates, linkedinCandidates] = await Promise.all([
    runSearches(twitterQueries, 'twitter'),
    runSearches(linkedinQueries, 'linkedin')
  ]);

  // --- VERIFY TWITTER (Top 3) ---
  if (twitterCandidates.length) {
    const checks = await Promise.all(twitterCandidates.slice(0, 3).map(async cand => {
       if (await socialPageMatchesOutlet(cand.url, website, outletName, cand.snippet)) {
         return cand.url;
       }
       return null;
    }));
    const valid = checks.find(Boolean);
    if (valid) {
      links.twitter = valid;
      console.log(`      ✓ Twitter found: ${links.twitter}`);
    } else {
      console.log(`      ✗ No Twitter matched outlet`);
    }
  } else {
    console.log(`      ✗ No Twitter found`);
  }

  // --- VERIFY LINKEDIN (Top 3) ---
  if (linkedinCandidates.length) {
    const checks = await Promise.all(linkedinCandidates.slice(0, 3).map(async cand => {
       if (await socialPageMatchesOutlet(cand.url, website, outletName, cand.snippet)) {
         return cand.url;
       }
       return null;
    }));
    const valid = checks.find(Boolean);
    if (valid) {
      links.linkedin = valid;
      console.log(`      ✓ LinkedIn found: ${links.linkedin}`);
    } else {
      console.log(`      ✗ No LinkedIn matched outlet`);
    }
  } else {
    console.log(`      ✗ No LinkedIn found`);
  }

  return links;
}

// ============ STEP 9: VERIFY SOCIAL LINKS ============
async function verifySocialLinks(links, website, outletName) {
  const verified = { twitter: null, linkedin: null };

  // TWITTER
  if (links.twitter && typeof links.twitter === "string") {
    const cleanTwitter = links.twitter.split("?")[0];

    if (cleanTwitter.includes("twitter.com") || cleanTwitter.includes("x.com")) {
      const valid = await verifyUrl(cleanTwitter);

      if (valid) {
        const ok = await socialPageMatchesOutlet(cleanTwitter, website, outletName);
        if (ok) {
          verified.twitter = cleanTwitter;
          console.log(`      ✓ Twitter verified: ${cleanTwitter}`);
        } else {
          console.log(`      ✗ Twitter rejected (outlet mismatch): ${cleanTwitter}`);
        }
      } else {
        console.log(`      ✗ Twitter invalid: ${cleanTwitter}`);
      }
    } else {
      console.log(`      ✗ Twitter invalid: ${cleanTwitter}`);
    }
  }

  // LINKEDIN
  if (links.linkedin && typeof links.linkedin === "string") {
    const cleanLinkedIn = links.linkedin.split("?")[0];
    const isProfile = /https?:\/\/(?:[a-zA-Z0-9.-]+\.)?linkedin\.com\/(in|pub)\//.test(cleanLinkedIn);
    if (isProfile) {
      const valid = await verifyUrl(cleanLinkedIn);
      if (valid) {
        const ok = await socialPageMatchesOutlet(cleanLinkedIn, website, outletName);
        if (ok) {
          verified.linkedin = cleanLinkedIn;
          console.log(`      ✓ LinkedIn verified: ${cleanLinkedIn}`);
        } else {
          console.log(`      ✗ LinkedIn rejected (outlet mismatch): ${cleanLinkedIn}`);
        }
      } else {
        // Accept personal profile pattern despite verification failures
        const ok = await socialPageMatchesOutlet(cleanLinkedIn, website, outletName);
        if (ok) {
          verified.linkedin = cleanLinkedIn;
          console.log(`      ✓ LinkedIn accepted (pattern): ${cleanLinkedIn}`);
        } else {
          console.log(`      ✗ LinkedIn rejected (outlet mismatch): ${cleanLinkedIn}`);
        }
      }
    } else {
      console.log(`      ✗ LinkedIn invalid: ${cleanLinkedIn}`);
    }
  }

  return verified;
}
async function extractRoleFromSocialProfiles(links, authorName, outletName, website) {
  let r = null;
  const tryText = async (url) => {
    const $ = await fetchPage(url);
    if (!$) return null;
    const t1 = $('meta[property="og:title"]').attr('content') || '';
    const t2 = $('meta[property="og:description"]').attr('content') || '';
    const t3 = $('meta[name="description"]').attr('content') || '';
    const t4 = $('h1').first().text().trim();
    const t5 = $('body').text().trim().substring(0, 600);
    const joined = [t1, t2, t3, t4, t5].filter(Boolean).join(' ');
    if (joined) {
      const tokens = buildOutletMatchTokens(website, outletName);
      for (const tok of tokens) {
        const rx = new RegExp(`([A-Za-z][A-Za-z\s&\-]{3,60})\s+at\s+${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, 'i');
        const m = joined.match(rx);
        if (m && m[1]) {
          const cand = m[1].trim();
          const mr2 = matchRole(cand);
          if (mr2 && !isGenericRole(mr2)) return mr2;
          const low = cand.toLowerCase();
          if (low.includes('business') && (low.includes('writer') || low.includes('reporter'))) return low.includes('reporter') ? 'Business Reporter' : 'Business Writer';
          if (low.includes('technology') && (low.includes('writer') || low.includes('reporter'))) return low.includes('reporter') ? 'Technology Reporter' : 'Technology Writer';
          if (low.includes('entertainment') && (low.includes('writer') || low.includes('reporter'))) return low.includes('reporter') ? 'Entertainment Reporter' : 'Entertainment Writer';
          if (low.includes('sports') && (low.includes('writer') || low.includes('reporter'))) return low.includes('reporter') ? 'Sports Reporter' : 'Sports Writer';
          if (low.includes('health') && (low.includes('writer') || low.includes('reporter'))) return low.includes('reporter') ? 'Health Reporter' : 'Health Writer';
          if (low.includes('environment') && (low.includes('writer') || low.includes('reporter'))) return low.includes('reporter') ? 'Environment Reporter' : 'Environment Writer';
          if (low.includes('international') && (low.includes('writer') || low.includes('reporter'))) return low.includes('reporter') ? 'International Affairs Reporter' : 'International Affairs Writer';
          if (low.includes('education') && (low.includes('writer') || low.includes('reporter'))) return low.includes('reporter') ? 'Education Reporter' : 'Education Writer';
        }
      }
    }
    const mr = matchRole(joined);
    if (mr && !isGenericRole(mr)) return mr;
    return null;
  };
  if (links.linkedin) {
    r = await tryText(links.linkedin);
  }
  if (!r && links.twitter) {
    r = await tryText(links.twitter);
  }
  if (!r) {
    const qs = [
      `"${authorName}" site:linkedin.com/in`,
      `"${authorName}" ${outletName} site:linkedin.com/in`,
      `"${authorName}" site:twitter.com`,
      `"${authorName}" ${outletName} twitter`
    ];
    for (const q of qs) {
      const rs = await serperSearch(q, 5);
      for (const r1 of rs) {
        const text = `${r1.title || ''} ${r1.snippet || ''}`;
        if (text) {
          const tokens = buildOutletMatchTokens(website, outletName);
          for (const tok of tokens) {
            const rx = new RegExp(`([A-Za-z][A-Za-z\s&\-]{3,60})\s+at\s+${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, 'i');
            const m2 = text.match(rx);
            if (m2 && m2[1]) {
              const cand2 = m2[1].trim();
              const mr3 = matchRole(cand2);
              if (mr3 && !isGenericRole(mr3)) return mr3;
              const low2 = cand2.toLowerCase();
              if (low2.includes('business') && (low2.includes('writer') || low2.includes('reporter'))) return low2.includes('reporter') ? 'Business Reporter' : 'Business Writer';
              if (low2.includes('technology') && (low2.includes('writer') || low2.includes('reporter'))) return low2.includes('reporter') ? 'Technology Reporter' : 'Technology Writer';
              if (low2.includes('entertainment') && (low2.includes('writer') || low2.includes('reporter'))) return low2.includes('reporter') ? 'Entertainment Reporter' : 'Entertainment Writer';
              if (low2.includes('sports') && (low2.includes('writer') || low2.includes('reporter'))) return low2.includes('reporter') ? 'Sports Reporter' : 'Sports Writer';
              if (low2.includes('health') && (low2.includes('writer') || low2.includes('reporter'))) return low2.includes('reporter') ? 'Health Reporter' : 'Health Writer';
              if (low2.includes('environment') && (low2.includes('writer') || low2.includes('reporter'))) return low2.includes('reporter') ? 'Environment Reporter' : 'Environment Writer';
              if (low2.includes('international') && (low2.includes('writer') || low2.includes('reporter'))) return low2.includes('reporter') ? 'International Affairs Reporter' : 'International Affairs Writer';
              if (low2.includes('education') && (low2.includes('writer') || low2.includes('reporter'))) return low2.includes('reporter') ? 'Education Reporter' : 'Education Writer';
            }
          }
        }
        const m = matchRole(text);
        if (m && !isGenericRole(m)) return m;
      }
    }
  }
  return r;
}
// ============ EXTRACT FULL AUTHOR PROFILE ============
async function extractAuthorProfile(author, outletName, website) {
  console.log(`\n  [${author.name}]`);

  let role = author.role || null;
  let bio = null, email = null;
  let socialLinks = { twitter: null, linkedin: null };
  let profileUrl = null;
  let articles = author.articles || [];
  let verifiedArticles = [];

  // STEP 4: Find profile page
  console.log(`    Finding profile page...`);
  const { url: foundProfileUrl, $: $ } = await findAuthorProfile(author.name, website);

  if (foundProfileUrl) {
    profileUrl = foundProfileUrl;
    console.log(`    ✓ Profile: ${profileUrl}`);

    // STEP 5: Scrape articles from profile
    const $page = $ || await fetchPage(profileUrl);
    const profileArticles = await scrapeArticlesFromProfile($page, profileUrl, author.name, website);
    console.log(`    Found ${profileArticles.length} articles on profile`);

    // STEP 6: Verify articles
    if (profileArticles.length > 0) {
      const verified = await verifyArticles(profileArticles, author.name);
      console.log(`    Verified: ${verified.length}/${profileArticles.length}`);
      if (verified.length > 0) {
        verifiedArticles = verified;
        articles = [...articles, ...verified.filter(a => !articles.some(ea => ea.url === a.url))];
      }
    }

    // Bio
    const bioSelectors = [
      '.bio', '.author-bio', '[itemprop="description"]', '.description', '.author-description',
      '.profile-bio', '.about', '.author-about', '.author__bio', '.author-bio__text', '.profile__bio',
      'p.taxonomy-description', '.taxonomy-description', '.archive-description',
      '.author .taxonomy-description', '.author-area .taxonomy-description',
      '.entry-content .taxonomy-description', '.author-info .bio', '.author .bio', '.author-details .bio'
    ];
    if ($page) {
      for (const sel of bioSelectors) {
        const text = $page(sel).first().text().trim();
        if (text && text.length > 20 && text.length < 1000) { bio = text; break; }
      }
      if (!bio) {
        // JSON-LD Person.description
        $page('script[type="application/ld+json"]').each((_, el) => {
          if (bio) return false;
          try {
            const data = JSON.parse($page(el).html());
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              if (item['@type'] === 'Person' && typeof item.description === 'string') {
                const text = item.description.trim();
                if (text && text.length > 20 && text.length < 2000) { bio = text; break; }
              }
            }
          } catch { }
        });
      }
      if (!bio) {
        // Meta description as weak bio fallback
        const metaDesc = $page('meta[name="description"]').attr('content') || $page('meta[property="og:description"]').attr('content');
        if (metaDesc && metaDesc.length > 20 && metaDesc.length < 300) bio = metaDesc.trim();
      }
    }

    if (bio) {
      const bioRole = extractRoleFromBio(bio, author.name);
      if (bioRole && !isGenericRole(bioRole)) {
        role = bioRole;
        console.log(`    ✓ Role from bio: ${role}`);
      }
    }

    // Structured profile role and email
    const { role: pageRole, email: pageEmail } = $page ? extractRoleAndEmail($page, author.name) : { role: null, email: null };
    if (pageEmail) email = pageEmail;
    if (pageRole && !isGenericRole(pageRole) && (!role || isGenericRole(role))) {
      role = pageRole;
    }

    const fn = author.name.split(/\s+/)[0].toLowerCase();
    const ln = author.name.split(/\s+/).pop()?.toLowerCase() || '';
    const rejectBrand = /economictimes|timesofindia|hindustantimes|thehindu|ndtv|indiatoday|indianexpress|livemint|news|official|team/i;
    if ($page) {
      $page('a[href*="twitter.com/"], a[href*="x.com/"]').each((i, el) => {
        if (socialLinks.twitter) return false;
        const href = $page(el).attr('href');
        if (!href || href.includes('/status/')) return;
        const m = href.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/);
        if (!m) return;
        const user = m[1].toLowerCase();
        if (rejectBrand.test(user)) return;
        if (user.includes(fn) || (ln && user.includes(ln))) {
          const url = `https://twitter.com/${m[1]}`;
          socialLinks.twitter = url;
        }
      });
      $page('a[href*="linkedin.com/in/"]').each((i, el) => {
        if (socialLinks.linkedin) return false;
        const href = $page(el).attr('href');
        if (!href) return;
        const m = href.match(/(https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+)/);
        if (!m) return;
        const slug = m[1].split('/in/')[1]?.toLowerCase() || '';
        if (rejectBrand.test(slug)) return;
        if (slug.includes(fn) || (ln && slug.includes(ln))) {
          socialLinks.linkedin = m[1];
        }
      });
    }
  } else {
    console.log(`    ✗ No profile page found`);
    // Fallback: find articles via Serper when profile missing
    const serperAuthorArticles = await findAuthorArticlesViaSerper(author.name, website, 20);
    if (serperAuthorArticles.length) {
      const verified = await verifyArticles(serperAuthorArticles, author.name);
      console.log(`    Verified via Serper: ${verified.length}/${serperAuthorArticles.length}`);
      if (verified.length) {
        articles = [...articles, ...verified.filter(a => !articles.some(ea => ea.url === a.url))];
      }
    }
  }
  
  if (articles.length < 10) {
    const fallbackArts = await findAuthorArticlesViaSerper(author.name, website, 20);
    if (fallbackArts.length > 0) {
      const verified = await verifyArticles(fallbackArts, author.name);
      if (verified.length > 0) {
        articles = [...articles, ...verified.filter(a => !articles.some(ea => ea.url === a.url))];
      }
    }
  }



  // STEP 8 & 9: Serper search for social links if missing or likely brand/mismatch
  if (!socialLinks.twitter || !socialLinks.linkedin) {
    console.log(`    Searching & verifying social links...`);
    const serperLinks = await findSocialLinksViaSerper(author.name, outletName, website);
    const fn2 = author.name.split(/\s+/)[0].toLowerCase();
    const ln2 = author.name.split(/\s+/).pop()?.toLowerCase() || '';
    const rej = /economictimes|timesofindia|hindustantimes|thehindu|ndtv|indiatoday|indianexpress|livemint|news|official|team/i;
    const curT = socialLinks.twitter || '';
    const curU = curT.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/)?.[1]?.toLowerCase() || '';
    const badT = !curT || rej.test(curU) || !(curU.includes(fn2) || (ln2 && curU.includes(ln2)));
    if (badT && serperLinks.twitter) socialLinks.twitter = serperLinks.twitter;
    const curL = socialLinks.linkedin || '';
    const curS = curL.split('/in/')[1]?.toLowerCase() || '';
    const badL = !curL || rej.test(curS) || !(curS.includes(fn2) || (ln2 && curS.includes(ln2)));
    if (badL && serperLinks.linkedin) socialLinks.linkedin = serperLinks.linkedin;
    if (!socialLinks.twitter || !socialLinks.linkedin) {
      const socialFromArticles = await scrapeSocialFromArticlePages(articles, author.name, website, outletName);
      if (!socialLinks.twitter && socialFromArticles.twitter) socialLinks.twitter = socialFromArticles.twitter;
      if (!socialLinks.linkedin && socialFromArticles.linkedin) socialLinks.linkedin = socialFromArticles.linkedin;
    }
  }
  if (!role || isGenericRole(role)) {
    const rSocial = await extractRoleFromSocialProfiles(socialLinks, author.name, outletName, website);
    if (rSocial && !isGenericRole(rSocial)) role = rSocial;
  }

  // Role/email fallback via article pages if still generic/missing
  if ((role === 'Journalist' || !email) && articles.length > 0) {
    for (const art of articles.slice(0, 3)) {
      const $art = await fetchPage(art.url);
      if ($art) {
        const { role: r2, email: e2 } = extractRoleAndEmail($art, author.name);
        if (r2 && r2 !== 'Journalist') role = r2;
        if (!email && e2) email = e2;
        if (role !== 'Journalist' && email) break;
      }
    }
  }



  if (!socialLinks.twitter) console.log(`    ✗ No Twitter found`);
  if (!socialLinks.linkedin) console.log(`    ✗ No LinkedIn found`);

  // Deduplicate articles
  const uniqueArticles = [];
  const seen = new Set();
  for (const a of articles) {
    if (!seen.has(a.url)) {
      seen.add(a.url);
      uniqueArticles.push(a);
    }
  }
  const uniqueVerifiedArticles = [];
  const seenV = new Set();
  for (const a of verifiedArticles) {
    if (!seenV.has(a.url)) {
      seenV.add(a.url);
      uniqueVerifiedArticles.push(a);
    }
  }

  // NLP Analysis (verified articles only)
  let topics = [], keywords = [];
  const nlpSource = uniqueVerifiedArticles.length > 0 ? uniqueVerifiedArticles : uniqueArticles;
  if (nlpSource.length > 0) {
    const texts = [];
    for (const art of nlpSource.slice(0, 3)) {
      const $art = await fetchPage(art.url);
      if ($art) {
        const text = $art('article, .article-body, .story-body, [itemprop="articleBody"]').text().trim();
        if (text) texts.push(text);
      }
    }
    if (texts.length > 0) {
      try {
        keywords = extractKeywords(texts.join(' ').substring(0, 10000));
        topics = categorizeTopics(texts.join(' ').substring(0, 10000));
      } catch (e) { }
    }
  }
  const keywordStrings = (Array.isArray(keywords) ? keywords : []).map(k => typeof k === 'string' ? k : (k?.word || '')).filter(Boolean);
  if ((!role || isGenericRole(role)) && topics.length > 0) {
    role = mapTopicToRole(topics[0]);
  }
  if (!role) role = 'Journalist';

  const influence = Math.min(100, 50 + uniqueArticles.length * 3 +
    (socialLinks.twitter ? 10 : 0) + (socialLinks.linkedin ? 10 : 0) + (bio ? 5 : 0));

  // Determine last active date
  const lastActiveAt = await inferLastActiveDate(uniqueVerifiedArticles.length > 0 ? uniqueVerifiedArticles : uniqueArticles);

  console.log(`    ══════════════════════════════════════`);
  console.log(`    Role: ${role} | Articles: ${uniqueArticles.length} | Twitter: ${socialLinks.twitter ? '✓' : '✗'} | LinkedIn: ${socialLinks.linkedin ? '✓' : '✗'} | Last Active: ${lastActiveAt || 'Unknown'}`);

  return {
    name: author.name,
    role,
    bio,
    email,
    profileUrl,
    profileUrlVerified: !!profileUrl,
    socialLinks,
    verifiedArticles: uniqueVerifiedArticles.slice(0, 20).map(a => ({ title: a.title, url: a.url })),
    articles: uniqueArticles.slice(0, 20).map(a => ({ title: a.title, url: a.url })),
    totalArticles: uniqueArticles.length,
    topics: topics.slice(0, 5),
    keywords: keywordStrings.slice(0, 10),
    influenceScore: influence,
    lastActiveAt
  };
}


// ============ MAIN SCRAPER FUNCTION ============
export async function scrapeLightweight(outletName, maxAuthors = 30, progressCallback = null) {
  console.log(`\n${'═'.repeat(60)}`);
  const targetAuthors = Math.max(30, maxAuthors);
  console.log(`SCRAPER: ${outletName} | Target: ${targetAuthors} journalists`);
  console.log(`${'═'.repeat(60)}`);

  try {
    // STEP 1: Detect website via Serper
    const website = await detectOutletWebsite(outletName);
    if (!website) {
      return { error: `Could not find website for "${outletName}"`, authorsCount: 0, authors: [] };
    }

    const country = await inferOutletCountry(website);
    // STEP 2: Collect 300-400 articles
    const articles = await collectArticles(website, 350);
    if (articles.length === 0) {
      console.log(`    ✗ No articles found on ${website}.`);
    }

    // STEP 3: Extract authors from bylines
    let authors = [];
    if (articles.length > 0) {
      authors = await extractAuthorsFromBylines(articles, website, targetAuthors);
    }

    if (authors.length < 10) {
      const pages = await findAuthorsPagesViaSerper(website, outletName, country);
      for (const p of pages.slice(0, 5)) {
        const extra = await scrapeAuthorsFromDirectoryPage(p, 50);
        for (const a of extra) {
          if (!authors.some(x => x.name.toLowerCase() === a.name.toLowerCase())) authors.push({ name: a.name, articles: [], role: 'Journalist' });
          if (authors.length >= targetAuthors) break;
        }
        if (authors.length >= targetAuthors) break;
      }
    }
    if (authors.length < 15) {
      const wpUsers = await fetchWordPressUsersInto(website, 80);
      for (const u of wpUsers) {
        if (!authors.some(x => x.name.toLowerCase() === u.name.toLowerCase())) {
          authors.push({ name: u.name, articles: [], role: 'Journalist' });
          if (authors.length >= targetAuthors) break;
        }
      }
    }
    if (authors.length < 15) {
      const wpSitemapAuthors = await fetchWordPressAuthorSitemaps(website, 100);
      for (const u of wpSitemapAuthors) {
        if (!authors.some(x => x.name.toLowerCase() === u.name.toLowerCase())) {
          authors.push({ name: u.name, articles: [], role: 'Journalist' });
          if (authors.length >= targetAuthors) break;
        }
      }
    }
    if (authors.length === 0) {
      return { error: `No authors found`, authorsCount: 0, authors: [] };
    }

    // STEPS 4-9: Extract full profile for each author
    console.log(`\n[STEP 4-9] Extracting ${authors.length} profiles...`);
    const profiles = [];

    for (let i = 0; i < authors.length; i++) {
      console.log(`\n[${i + 1}/${authors.length}] Processing: ${authors[i].name}`);

      const profile = await extractAuthorProfile(authors[i], outletName, website);

      // VERIFY SOCIAL LINKS HERE 
      if (profile.socialLinks && (profile.socialLinks.twitter || profile.socialLinks.linkedin)) {
        const verifiedSocials = await verifySocialLinks(profile.socialLinks, website, outletName);
        profile.socialLinks = verifiedSocials;
        profile.twitter = verifiedSocials.twitter;
        profile.linkedin = verifiedSocials.linkedin;
      }

      profile.outlet = outletName.toLowerCase();
      profiles.push(profile);

      if (progressCallback) {
        progressCallback(i + 1, authors.length);
      }

      await delay(500);
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`✓ COMPLETE: ${profiles.length} journalists scraped`);
    console.log(`${'═'.repeat(60)}\n`);

    return {
      outlet: outletName,
      website,
      authorsCount: profiles.length,
      authors: profiles
    };

  } catch (error) {
    console.log(`\n✗ ERROR: ${error.message}`);
    return { error: error.message, authorsCount: 0, authors: [] };
  }
}


export default scrapeLightweight;
