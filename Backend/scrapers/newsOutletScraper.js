import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import { extractKeywords, categorizeTopics } from '../utils/nlpAnalyzer.js';

// Load environment variables
dotenv.config();

const SERPER_API_KEY = process.env.SERPER_API_KEY;

if (!SERPER_API_KEY) {
  console.warn('⚠️ SERPER_API_KEY not found in environment variables');
}

// ============ UTILITIES ============
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
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
    return res.data.organic || [];
  } catch (e) {
    return [];
  }
}

// ============ DuckDuckGo HTML SEARCH (fallback) ============
async function ddgHtmlSearch(query, max = 10) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await axios.get(url, {
      headers: { 'User-Agent': getUA(), 'Accept': 'text/html' },
      timeout: 12000
    });
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

// ============ FETCH PAGE ============
async function fetchPage(url, timeout = 12000) {
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': getUA(), 'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8' },
      timeout, maxRedirects: 5, validateStatus: s => s < 500
    });
    return res.status === 200 ? cheerio.load(res.data) : null;
  } catch (e) {
    return null;
  }
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
  'our correspondent', 'staff correspondent', 'special reporter', 'our reporter',
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
  if (!(new RegExp("^[\\p{L}\\s.\\-']+$","u")).test(clean)) return false;
  const words = clean.split(/\s+/).filter(w => w.length > 1);
  if (words.length < 1 || words.length > 5) return false;
  const capWords = words.filter(w => /^[A-ZÀ-ÖØ-Ý][\p{L}'\-]+$/u.test(w) || /^[A-ZÀ-ÖØ-Ý]{2,}$/.test(w));
  if (capWords.length === 0 && !isEditorialName(clean)) return false;
  return true;
}
function toSlug(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function isEditorialName(str) {
  const n = (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  return n === 'la redaction' || n === 'redaction' || n.includes('redaktion');
}

function capitalize(word) {
  if (!word) return '';
  const w = word.toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function formatSlugName(slug) {
  return String(slug || '')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .pop()
    .split(/[-_]+/)
    .map(capitalize)
    .join(' ')
    .trim();
}

function extractTagSlugs($) {
  const seen = new Set();
  const tags = [];
  $('a[href*="/tag/"]').each((i, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/\/tag\/([^\/?#]+)/i);
    if (m && m[1]) {
      const slug = decodeURIComponent(m[1]).trim();
      if (slug && !seen.has(slug)) {
        seen.add(slug);
        tags.push(slug);
      }
    }
  });
  return tags;
}

export async function extractArticleAuthorSimple(articleUrl) {
  const $ = await fetchPage(articleUrl);
  if (!$) {
    return { url: articleUrl, author: 'Unknown', confidence: 'low', people_candidates: [] };
  }
  const path = (() => { try { return new URL(articleUrl).pathname.toLowerCase(); } catch { return ''; } })();
  const peopleCandidates = extractTagSlugs($);
  if (/\/author\/[^\/]+\/?$/i.test(path)) {
    const slug = path.split('/').filter(Boolean).pop();
    const name = formatSlugName(slug);
    return { url: articleUrl, author: name || 'Unknown', confidence: name ? 'high' : 'low', people_candidates: peopleCandidates };
  }

  // Scan the last N non-empty paragraphs in the main body for explicit bylines/author credits
  let candidate = null;
  let candidateHref = null;
  let candidateConfidence = 'low';
  let blocksToCheck = [];
  const rawBlocks = [
    $('article .entry-content p'),
    $('.entry-content p'),
    $('article p'),
    $('.post-content p'),
    $('.single-post p'),
    $('.article-content p'),
    $('.post p'),
    $('.entry p'),
    $('body p')
  ];
  // Flatten all candidate blocks/paragraphs from the above
  rawBlocks.forEach($set => {
    $set.each((_, el) => {
      blocksToCheck.push($(el));
    });
  });
  // Deduplicate, take the last 8 meaningful blocks
  blocksToCheck = blocksToCheck.filter($p => $p.text().trim().length > 4);
  blocksToCheck = blocksToCheck.slice(-8);

  // Patterns: Par Prénom Nom, Publié par Prénom Nom, etc — also bold/strong in last lines
  const explicitAuthorRegex = /^(Par|Publié par|Rédigé par|With|By|Ecrit par|Écrit par|Rédaction par)\s+([A-ZÀ-ÖØ-Ý][\p{L}'\-]+(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'\-]+){0,3})\b/i;
  const nameRegex = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/u;
  for (let i = blocksToCheck.length - 1; i >= 0; i--) {
    const $p = blocksToCheck[i];
    // Direct text in this paragraph
    let t = $p.text().trim();
    // Bold/strong within paragraph
    let strong = $p.find('strong, b').text().trim();
    // Prefer strong (if exists and not too short), else fallback to paragraph text
    let txt = (strong && strong.length > 3 && strong.length < 80) ? strong : t;
    let matched = txt.match(explicitAuthorRegex);
    if (matched && matched[2] && isValidName(matched[2]) && !isEditorialName(matched[2])) {
      candidate = matched[2].trim();
      candidateConfidence = 'high';
    } else if (!candidate && txt.length < 80 && txt.length > 4) {
      // Fallback: Just name in bold at end
      let nm = txt.match(nameRegex);
      if (nm && nm[1] && isValidName(nm[1]) && !isEditorialName(nm[1])) {
        candidate = nm[1].trim();
        candidateConfidence = 'medium';
      }
    }
    // If a candidate is found, check for <a href> to tag, author or contributor page in this block
    if (candidate && !candidateHref) {
      $p.find('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (/\/tag\/(?!category)/i.test(href) || /\/author\//i.test(href) || /\/profile\//i.test(href) || /\/contributors?\//i.test(href)) {
          // Promote to absolute
          try {
            let authorUrl = href.startsWith('http') ? href : new URL(href, articleUrl).href;
            candidateHref = authorUrl;
          } catch {}
        }
      });
      // Stop after the first solid find
      break;
    }
  }
  // If candidate found this way, return with canonical URL
  if (candidate) {
    return {
      url: articleUrl,
      author: candidate,
      authorProfileUrl: candidateHref || null,
      confidence: candidateConfidence,
      people_candidates: peopleCandidates
    };
  }

  // Standard extraction region (original logic below)
  const bodySel = [
    'article [itemprop="articleBody"]',
    'article .entry-content',
    '.entry-content',
    '.post-content',
    '.article-content',
    'article',
    '.single-post',
    '.post',
    '.entry'
  ];
  let text = '';
  for (const sel of bodySel) {
    const t = $(sel).first().text().trim();
    if (t && t.length >= 10) { text = t; break; }
  }
  if (!text) {
    text = $('body').text().trim();
  }
  const first500 = text.substring(0, 500);
  const last500 = text.slice(-500);
  const normFirst = first500
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/\bla redaction\b/.test(normFirst)) {
    return { url: articleUrl, author: 'La rédaction', confidence: 'medium', people_candidates: peopleCandidates };
  }
  const rx = new RegExp('(Dossier\\s+réalisé\\s+par|Par|Rédigé\\s+par|Publié\\s+par)\\s+([\\p{L}][\\p{L}\'\\-]+(?:\\s+[\\p{L}][\\p{L}\'\\-]+){0,3})','iu');
  const m = first500.match(rx);
  if (m && m[2]) {
    const name = m[2].trim();
    if (isEditorialName(name)) {
      return { url: articleUrl, author: 'La rédaction', confidence: 'medium', people_candidates: peopleCandidates };
    }
    for (const slug of peopleCandidates.slice(0, 5)) {
      const url = `${new URL(articleUrl).origin}/tag/${slug}/`;
      await fetchPage(url);
    }
    return { url: articleUrl, author: name, confidence: 'high', people_candidates: peopleCandidates };
  }
  const normLast = last500
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/\bla redaction\b/.test(normLast)) {
    return { url: articleUrl, author: 'La rédaction', confidence: 'medium', people_candidates: peopleCandidates };
  }
  const m2 = last500.match(rx);
  if (m2 && m2[2]) {
    const name2 = m2[2].trim();
    if (isEditorialName(name2)) {
      return { url: articleUrl, author: 'La rédaction', confidence: 'medium', people_candidates: peopleCandidates };
    }
    for (const slug of peopleCandidates.slice(0, 5)) {
      const url = `${new URL(articleUrl).origin}/tag/${slug}/`;
      await fetchPage(url);
    }
    return { url: articleUrl, author: name2, confidence: 'high', people_candidates: peopleCandidates };
  }
  // End-of-article bold names inside paragraphs
  const paraSets = [
    $('article .entry-content p'),
    $('.entry-content p'),
    $('article p'),
    $('.post-content p')
  ];
  const banned = new Set(['la rédaction','commune','maire','président','ailleurs','ministère','gouvernement','déclarations publiques','les déclarations publiques du','déclaration publique','république','visiteur']);
  const nameCandidateRx = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}|[A-Z]{2,}(?:\s+[A-Z]{2,}){1,3})\b/u;
  for (const set of paraSets) {
    const count = set.length;
    for (let i = Math.max(0, count - 6); i < count; i++) {
      const p = set.eq(i);
      const bold = p.find('strong, b').text().trim() || p.text().trim();
      if (!bold || bold.length < 3 || bold.length > 100) continue;
      const bylineMatch = bold.match(rx);
      if (bylineMatch && bylineMatch[2]) {
        const nm = bylineMatch[2].trim();
        if (isEditorialName(nm)) {
          return { url: articleUrl, author: 'La rédaction', confidence: 'medium', people_candidates: peopleCandidates };
        }
        for (const slug of peopleCandidates.slice(0, 5)) {
          const url = `${new URL(articleUrl).origin}/tag/${slug}/`;
          await fetchPage(url);
        }
        return { url: articleUrl, author: nm, confidence: 'high', people_candidates: peopleCandidates };
      }
      const nameOnly = bold.match(nameCandidateRx);
      if (nameOnly) {
        const nm = nameOnly[1].trim();
        if (isEditorialName(nm)) {
          return { url: articleUrl, author: 'La rédaction', confidence: 'medium', people_candidates: peopleCandidates };
        }
        const lower = nm.toLowerCase();
        if (!banned.has(lower) && isValidName(nm)) {
          const inFirst = first500.includes(nm);
          const inLast = last500.includes(nm);
          const conf = inFirst && inLast ? 'high' : 'medium';
          for (const slug of peopleCandidates.slice(0, 5)) {
            const url = `${new URL(articleUrl).origin}/tag/${slug}/`;
            await fetchPage(url);
          }
          return { url: articleUrl, author: nm, confidence: conf, people_candidates: peopleCandidates };
        }
      }
    }
  }
  return { url: articleUrl, author: 'Unknown', confidence: 'low', people_candidates: peopleCandidates };
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
  { p: /education\s*reporter/i, r: 'Education Reporter' },
  { p: /rédacteur\s*en\s*chef/i, r: 'Editor-in-Chief' },
  { p: /rédactrice\s*en\s*chef/i, r: 'Editor-in-Chief' },
  { p: /chefredakteur/i, r: 'Editor-in-Chief' },
  { p: /chef\s*de\s*bureau/i, r: 'Bureau Chief' },
  { p: /rédacteur/i, r: 'Editor' },
  { p: /rédactrice/i, r: 'Editor' },
  { p: /redakteur/i, r: 'Editor' },
  { p: /journaliste/i, r: 'Journalist' },
  { p: /journalistin/i, r: 'Journalist' },
  { p: /korrespondent/i, r: 'Correspondent' },
  { p: /kolumnist/i, r: 'Columnist' },
  { p: /chroniqueur/i, r: 'Columnist' },
  { p: /chroniqueuse/i, r: 'Columnist' },
  { p: /éditorialiste/i, r: 'Columnist' },
  { p: /auteur/i, r: 'Writer' },
  { p: /autrice/i, r: 'Writer' },
  { p: /autor(in)?/i, r: 'Writer' },
  { p: /moderator(in)?/i, r: 'Presenter' },
  { p: /animateur|animatrice/i, r: 'Presenter' },
  { p: /ressortleiter/i, r: 'Senior Editor' }
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
  'laquestion.info': 'https://www.laquestion.info',
  'laquestion': 'https://www.laquestion.info',
  'la question': 'https://www.laquestion.info',
  'laquestion info': 'https://www.laquestion.info',
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
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      console.log(`  ✓ Partial known match "${key}": ${url}`);
      return url;
    }
  }

  // STEP 2: GOOGLE DETECTION (PRIMARY)
  console.log(`  Google search...`);
  const globalQueries = [
    `${cleanName} official website`,
    `${cleanName} news`,
    `${cleanName} media`,
    `${cleanName} newspaper`,
    `"${cleanName}" official`
  ];
  const googleCandidate = await runSerperTier(globalQueries, cleanName);
  let googleValid = false;
  if (googleCandidate) {
    console.log(`  Google candidate: ${googleCandidate}`);
    try {
      const u = new URL(googleCandidate);
      const rej = isPlatformRejected(u.hostname);
      const val = await validateNewsroomStructure(googleCandidate);
      googleValid = !rej && !!val.ok;
      if (!googleValid) {
        console.log(`  Google candidate rejected: ${rej || val.reason}`);
      }
    } catch { googleValid = false; }
  }
  // STEP 3: SUPPLEMENTARY PAGES FROM GOOGLE RESULTS
  /*let supplementalCandidate = null;
  try {
    const suppPages = await collectSupplementaryPages(cleanName, globalQueries, googleCandidate);
    console.log(`  Supplementary pages discovered: ${suppPages.length}`);
    for (const sp of suppPages) {
      const site = await getExternalWebsiteFromPage(sp, cleanName);
      if (!site) { console.log(`  No site from: ${sp}`); continue; }
      try {
        const host = new URL(site).hostname;
        const rej = isPlatformRejected(host);
        if (rej) { console.log(`  Rejected ${site}: ${rej}`); continue; }
        const val = await validateNewsroomStructure(site);
        if (val.ok) { console.log(`  Accepted supplemental: ${site}`); supplementalCandidate = site; break; }
        else { console.log(`  Invalid newsroom: ${site} – ${val.reason}`); }
      } catch { console.log(`  Invalid URL from supplemental: ${site}`); }
    }
  } catch {}

  if (supplementalCandidate) {
    console.log(`  Selected website (supplementary page): ${supplementalCandidate}`);
    return supplementalCandidate;
  } */

  // STEP 3: COUNTRY-GUIDED BRUTE-FORCE DOMAIN GUESSING
  try {
    const tld = await detectCountryTLDFromSearch(cleanName);
    const brute = await bruteForceByTLD(cleanName, tld);
    if (brute) {
      console.log(`  Selected website (tld brute-force): ${brute}`);
      return brute;
    }
  } catch { }

  /*
   Disabled – Supplementary pages from Google results (kept for reference)
   const suppPages = await collectSupplementaryPages(cleanName, globalQueries, googleCandidate);
   console.log(`  Supplementary pages discovered: ${suppPages.length}`);
   for (const sp of suppPages) {
     const site = await getExternalWebsiteFromPage(sp, cleanName);
     if (!site) { console.log(`  No site from: ${sp}`); continue; }
     try {
       const host = new URL(site).hostname;
       const rej = isPlatformRejected(host);
       if (rej) { console.log(`  Rejected ${site}: ${rej}`); continue; }
       const val = await validateNewsroomStructure(site);
       if (val.ok) { console.log(`  Accepted supplemental: ${site}`); return site; }
       else { console.log(`  Invalid newsroom: ${site} – ${val.reason}`); }
     } catch { console.log(`  Invalid URL from supplemental: ${site}`); }
   }
  */

  if (googleValid && googleCandidate) {
    console.log(`  Selected website (google): ${googleCandidate}`);
    return googleCandidate;
  }


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

async function extractWebsiteFromSocialBio(url) {
  const debug = !!process.env.DEBUG_FB_SITE_DETECT;
  try {
    const $ = await fetchPage(url);
    if (!$) return null;
    const anchors = [];
    $('a[href]').each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      if (!href) return;
      if (/^\//.test(href)) return;
      try {
        let u = new URL(/^https?:\/\//.test(href) ? href : `https://${href}`);
        anchors.push(u.toString());
      } catch { }
    });
    const bioAboutBlocks = [];
    const bioSelectors = [
      '.about', '.bio', '[role=bio]', '[itemprop="description"]', '.profile-bio', '.author-about', '.author-description', '.profile-bio__text',
      '.description', '.profile__bio'
    ];
    for (const sel of bioSelectors) {
      $(sel).each((_, el) => {
        const txt = $(el).text().trim();
        if (txt && txt.length > 3) bioAboutBlocks.push(txt);
      });
    }
    $("div,h1,h2,h3,h4,h5").each((_, el) => {
      const c = $(el).attr("class") || '';
      if (/about|bio/i.test(c)) {
        const t = $(el).text().trim();
        if (t && t.length > 3) bioAboutBlocks.push(t);
      }
    });
    const allFound = new Set(anchors);
    for (const txt of bioAboutBlocks) {
      for (const u of extractAllPotentialUrlsFromText(txt)) allFound.add(u);
    }
    const rawText = [
      $('meta[property="og:description"]').attr('content') || '',
      $('meta[name="description"]').attr('content') || '',
      $('body').text() || ''
    ].join(' ');
    for (const u of extractAllPotentialUrlsFromText(rawText)) allFound.add(u);
    const candidates = Array.from(allFound);
    const slug = (() => {
      try { return new URL(url).pathname.split('/').filter(Boolean).slice(-1)[0]?.toLowerCase() || ''; } catch { return ''; }
    })();
    for (let a of candidates) {
      if (/^(https?:\/\/)?(t\.co|bit\.ly|linktr\.ee)\//i.test(a)) {
        try {
          const res = await axios.get(a, { timeout: 8000, maxRedirects: 5, headers: { 'User-Agent': getUA() }, validateStatus: s => s < 600 });
          const finalUrl = (res.request && (res.request.responseURL || res.request.res?.responseUrl)) || a;
          a = finalUrl;
        } catch { }
      }
      try {
        const u = new URL(a);
        const lcHost = u.hostname.toLowerCase();
        if (isBlockedInfraHost(lcHost)) { if (debug) console.log(`[REJECT] ${a} blocked by infra host list`); continue; }
        if (/facebook|instagram|twitter|x\.com|linkedin|blogspot|wordpress|medium|about\.me|muckrack|shutterstock/.test(lcHost)) continue;
        if ((slug && (lcHost.replace(/^www\./, '').replace(/-/g, '').includes(slug) || a.toLowerCase().includes(slug))) ||
          /\.co\.za$|\.co\.in$|\.com$|\.net$|\.org$|\.ng$|\.ke$|\.pk$|\.za$|\.africa$/.test(lcHost)) {
          if (await verifyUrl(a)) { if (debug) console.log(`[DETECT_SOCIAL_SITE] Accepted (slug/ccTLD): ${a}`); return a; }
        }
      } catch { }
      try {
        const u = new URL(a);
        const lcHost = u.hostname.toLowerCase();
        if (isBlockedInfraHost(lcHost)) { if (debug) console.log(`[REJECT] ${a} blocked by infra host list`); continue; }
        if (/facebook|instagram|twitter|x\.com|linkedin|blogspot|wordpress|medium|about\.me|muckrack|shutterstock/.test(lcHost)) continue;
        if (await verifyUrl(a)) { if (debug) console.log(`[DETECT_SOCIAL_SITE] Accepted (fallback live): ${a}`); return a; }
      } catch { }
    }
    return null;
  } catch (e) { if (debug) console.log('extractWebsiteFromSocialBio error:', e); return null; }
}

async function getFacebookPageWebsiteViaGraph(fbUrl) {
  const debug = !!process.env.DEBUG_FB_SITE_DETECT;
  try {
    const token = process.env.FACEBOOK_GRAPH_ACCESS_TOKEN || process.env.FACEBOOK_GRAPH_API_KEY;
    if (!token) return null;
    // First try resolving by URL (robust for various slug formats)
    try {
      const resolveRes = await axios.get(
        `https://graph.facebook.com/v18.0/?id=${encodeURIComponent(fbUrl)}&fields=id,link,website,about,description,og_object&access_token=${encodeURIComponent(token)}`,
        { timeout: 8000 }
      );
      const rd = resolveRes.data || {};
      if (debug) console.log('FB Graph API resolve respones:', JSON.stringify(rd, null, 2));
      const resolvedSite = (rd.website || rd.og_object?.url || '').trim();
      if (resolvedSite) {
        const url = /^https?:\/\//.test(resolvedSite) ? resolvedSite : `https://${resolvedSite}`;
        const ok = await verifyUrl(url);
        if (debug) console.log('FB Graph API found website field:', resolvedSite, 'verifyUrl:', ok);
        if (ok) return url;
      }
      const textR = [rd.about || '', rd.description || ''].join(' ');
      const mR = textR.match(/https?:\/\/[\S]+|\b[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/);
      if (mR) {
        let url = mR[0];
        if (!/^https?:\/\//.test(url)) url = `https://${url}`;
        const ok = await verifyUrl(url);
        if (debug) console.log('FB Graph API about/desc url:', url, 'verifyUrl:', ok);
        if (ok) return url;
      }
      // If we got an id, query the page directly
      if (rd.id) {
        const direct = await axios.get(
          `https://graph.facebook.com/v18.0/${encodeURIComponent(rd.id)}?fields=website,link,about,description&access_token=${encodeURIComponent(token)}`,
          { timeout: 8000 }
        );
        const dd = direct.data || {};
        if (debug) console.log('FB Graph API id page:', JSON.stringify(dd, null, 2));
        const site2 = (dd.website || '').trim();
        if (site2) {
          const url = /^https?:\/\//.test(site2) ? site2 : `https://${site2}`;
          const ok = await verifyUrl(url);
          if (debug) console.log('FB Graph API id page website:', site2, 'verifyUrl:', ok);
          if (ok) return url;
        }
      }
    } catch (e) { if (debug) console.log('FB Graph API error:', e); }
    // Fallback: attempt by slug segment
    const u = new URL(fbUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    if (!parts.length) return null;
    const pageId = parts.find(p => !/pages|posts|events|photos|groups/i.test(p)) || parts[0];
    const endpoint = `https://graph.facebook.com/v18.0/${pageId}`;
    const params = `fields=website,link,about,description&access_token=${encodeURIComponent(token)}`;
    const res = await axios.get(`${endpoint}?${params}`, { timeout: 8000 });
    const data = res.data || {};
    if (debug) console.log('FB Graph API slug fallback:', JSON.stringify(data, null, 2));
    const site = (data.website || '').trim();
    if (site) {
      try {
        const url = /^https?:\/\//.test(site) ? site : `https://${site}`;
        const ok = await verifyUrl(url);
        if (debug) console.log('FB Graph API slug page:', site, 'verifyUrl:', ok);
        if (ok) return url;
      } catch { }
    }
    const text = [data.about || '', data.description || ''].join(' ');
    const m = text.match(/https?:\/\/[\S]+|\b[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/);
    if (m) {
      let url = m[0];
      if (!/^https?:\/\//.test(url)) url = `https://${url}`;
      const ok = await verifyUrl(url);
      if (debug) console.log('FB Graph API slug page about/desc:', url, 'verifyUrl:', ok);
      if (ok) return url;
    }
    return null;
  } catch (e) { if (debug) console.log('FB Graph API OUTER error:', e); return null; }
}

async function getFacebookAboutWebsite(fbUrl) {
  try {
    const u = new URL(fbUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    const slug = parts.find(p => !/pages|posts|events|photos|groups/i.test(p)) || parts[0] || '';
    if (!slug) return null;
    const aboutUrl = `https://m.facebook.com/${slug}/about`;
    const $ = await fetchPage(aboutUrl);
    if (!$) return null;
    let candidates = [];
    $('a[href]').each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      if (!href) return;
      let link = href.startsWith('/') ? `https://m.facebook.com${href}` : href;
      try {
        const x = new URL(link);
        const h = x.hostname.toLowerCase();
        if (/facebook\.com|m\.facebook\.com|l\.facebook\.com/.test(h)) {
          const real = x.searchParams.get('u') || x.searchParams.get('url') || '';
          if (real) link = decodeURIComponent(real);
        }
      } catch { }
      try {
        const ext = new URL(/^https?:\/\//.test(link) ? link : `https://${link}`);
        const host = ext.hostname.toLowerCase();
        if (/facebook\.com|twitter\.com|x\.com|instagram\.com|linkedin\.com/.test(host)) return;
        candidates.push(ext.toString());
      } catch { }
    });
    if (!candidates.length) {
      const bodyText = $('body').text() || '';
      const m = bodyText.match(/https?:\/\/[^\s]+|\b[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/);
      if (m) {
        let url = m[0];
        if (!/^https?:\/\//.test(url)) url = `https://${url}`;
        candidates.push(url);
      }
    }
    for (const c of Array.from(new Set(candidates))) {
      const ok = await verifyUrl(c);
      if (ok) return c;
    }
    return null;
  } catch { return null; }
}

async function getInstagramBioWebsite(url) {
  try {
    const res = await axios.get(url, { headers: { 'User-Agent': getUA(), 'Accept': 'text/html' }, timeout: 12000, maxRedirects: 5, validateStatus: () => true });
    const html = typeof res.data === 'string' ? res.data : '';
    const $ = cheerio.load(html);
    const anchors = [];
    $('a[href]').each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      if (!href) return;
      if (/^\//.test(href)) return;
      try {
        const u = new URL(/^https?:\/\//.test(href) ? href : `https://${href}`);
        const h = u.hostname.toLowerCase();
        if (/instagram\.com|facebook\.com|twitter\.com|x\.com|linkedin\.com/.test(h)) return;
        anchors.push(u.toString());
      } catch { }
    });
    const rawBlocks = [$('meta[property="og:description"]').attr('content') || '', $('meta[name="description"]').attr('content') || '', $('body').text() || '', html];
    $('script').each((_, el) => { const t = $(el).html(); if (t) rawBlocks.push(t); });
    const raw = rawBlocks.join(' ');
    const m = raw.match(/https?:\/\/[^\s]+|\b[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/);
    let cand = m?.[0] || anchors[0] || null;
    if (!cand) return null;
    if (!/^https?:\/\//.test(cand)) cand = `https://${cand}`;
    if (/linktr\.ee|bit\.ly|t\.co/i.test(cand)) {
      try {
        const resp = await axios.get(cand, { maxRedirects: 5, timeout: 8000, validateStatus: () => true });
        const finalUrl = resp.request?.res?.responseUrl || resp.headers?.location || cand;
        cand = finalUrl;
      } catch { }
    }
    const ok = await verifyUrl(cand);
    return ok ? cand : null;
  } catch { return null; }
}

async function getTwitterBioWebsite(url) {
  try {
    const res = await axios.get(url, { headers: { 'User-Agent': getUA(), 'Accept': 'text/html' }, timeout: 12000, maxRedirects: 5, validateStatus: () => true });
    const html = typeof res.data === 'string' ? res.data : '';
    const $ = cheerio.load(html);
    const anchors = [];
    $('a[href]').each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      if (!href) return;
      if (/^\//.test(href)) return;
      try {
        const u = new URL(/^https?:\/\//.test(href) ? href : `https://${href}`);
        const h = u.hostname.toLowerCase();
        if (/twitter\.com|x\.com|facebook\.com|instagram\.com|linkedin\.com/.test(h)) return;
        anchors.push(u.toString());
      } catch { }
    });
    const rawBlocks = [$('body').text() || '', html];
    $('script').each((_, el) => { const t = $(el).html(); if (t) rawBlocks.push(t); });
    const raw = rawBlocks.join(' ');
    const urlRx = /(https?:\/\/[^\s"'<>]+)|\b([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?:\b)/g;
    let found = null; let mm;
    while ((mm = urlRx.exec(raw)) !== null) { found = mm[1] || mm[2]; if (found) break; }
    let cand = found || anchors[0] || null;
    if (!cand) return null;
    if (!/^https?:\/\//.test(cand)) cand = `https://${cand}`;
    if (/t\.co|bit\.ly|linktr\.ee/i.test(cand)) {
      try {
        const resp = await axios.get(cand, { maxRedirects: 5, timeout: 8000, validateStatus: () => true });
        const finalUrl = resp.request?.res?.responseUrl || resp.headers?.location || cand;
        cand = finalUrl;
      } catch { }
    }
    const ok = await verifyUrl(cand);
    return ok ? cand : null;
  } catch { return null; }
}

/***********
 * UNUSED/LEGACY/SUPPLEMENT CODE BLOCKS
 ***********/

/*
// Unused: getLinkedInAboutWebsite
async function getLinkedInAboutWebsite(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const slugIdx = parts.indexOf('company') >= 0 ? parts.indexOf('company') + 1 : (parts[0] ? 1 : 0);
    const slug = parts[slugIdx] || parts[0] || '';
    if (!slug) return null;
    const aboutUrl = `https://www.linkedin.com/company/${slug}/about/`;
    const $ = await fetchPage(aboutUrl);
    if (!$) return null;
    const candidates = [];
    $('a[href]').each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      if (!href) return;
      let link = href.startsWith('/') ? `https://www.linkedin.com${href}` : href;
      try {
        const x = new URL(/^https?:\/\//.test(link) ? link : `https://${link}`);
        const h = x.hostname.toLowerCase();
        if (/linkedin\.com/.test(h)) return;
        candidates.push(x.toString());
      } catch { }
    });
    if (!candidates.length) {
      const text = $('body').text() || '';
      const m = text.match(/https?:\/\/[^\s]+|\b[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/);
      if (m) {
        let cand = m[0];
        if (!/^https?:\/\//.test(cand)) cand = `https://${cand}`;
        candidates.push(cand);
      }
    }
    for (const c of Array.from(new Set(candidates))) {
      const ok = await verifyUrl(c);
      if (ok) return c;
    }
    return null;
  } catch { return null; }
}
*/

/*
// Unused: findOutletSocialPages
async function findOutletSocialPages(outletName, hintHostname = null) {
  const base = outletName.replace(/\s+/g, ' ').trim();
  const quoted = `"${base}"`;
  const queries = [
    `${quoted} site:facebook.com`,
    `${quoted} site:twitter.com`,
    `${quoted} site:x.com`,
    `${quoted} site:instagram.com`,
    `${quoted} site:linkedin.com/company`,
    `${quoted} site:linkedin.com`,
    `${base} official facebook`,
    `${base} official twitter`,
    `${base} official instagram`,
    `${base} official linkedin`
  ];
  if (hintHostname) {
    const hostKey = hintHostname.replace(/^www\./, '').split('.')[0];
    queries.push(`"${hostKey}" site:facebook.com`);
    queries.push(`"${hostKey}" site:twitter.com`);
    queries.push(`"${hostKey}" site:instagram.com`);
    queries.push(`"${hostKey}" site:linkedin.com`);
  }
  const results = [];
  for (const q of queries) {
    const rs = await serperSearch(q, 8);
    for (const r of rs) {
      const link = r.link || '';
      if (!link) continue;
      if (/twitter\.com|x\.com|facebook\.com|instagram\.com|linkedin\.com/i.test(link)) {
        results.push(link);
      }
    }
  }
  if (!results.length) {
    const ddgSites = ['facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'linkedin.com'];
    for (const site of ddgSites) {
      const q = `${quoted} site:${site}`;
      try {
        const rs = await ddgHtmlSearch(q, 10);
        for (const r of rs) {
          const link = r.link || '';
          if (/facebook\.com|twitter\.com|x\.com|instagram\.com|linkedin\.com/i.test(link)) results.push(link);
        }
      } catch { }
    }
  }
  const dedup = Array.from(new Set(results));
  const pages = [];
  for (const url of dedup) {
    let platform = null;
    if (/facebook\.com/i.test(url)) platform = 'Facebook';
    else if (/twitter\.com|x\.com/i.test(url)) platform = 'Twitter';
    else if (/instagram\.com/i.test(url)) platform = 'Instagram';
    else if (/linkedin\.com/i.test(url)) platform = 'LinkedIn';
    if (platform) pages.push({ url, platform });
  }
  // Priority order: Facebook > Twitter/X > Instagram > LinkedIn
  const order = { Facebook: 1, Twitter: 2, Instagram: 3, LinkedIn: 4 };
  pages.sort((a, b) => (order[a.platform] || 99) - (order[b.platform] || 99));
  return pages.slice(0, 12);
}
*/

/*
// Unused: extractSocialLinksFromSite
async function extractSocialLinksFromSite(website) {
  const links = [];
  try {
    const $ = await fetchPage(website);
    if ($) {
      $('a[href]').each((_, el) => {
        const href = ($(el).attr('href') || '').trim();
        if (!href) return;
        const url = href.startsWith('/') ? `${website}${href}` : href;
        if (/facebook\.com|twitter\.com|x\.com|instagram\.com|linkedin\.com/i.test(url)) {
          let platform = null;
          if (/facebook\.com/i.test(url)) platform = 'Facebook';
          else if (/twitter\.com|x\.com/i.test(url)) platform = 'Twitter';
          else if (/instagram\.com/i.test(url)) platform = 'Instagram';
          else if (/linkedin\.com/i.test(url)) platform = 'LinkedIn';
          links.push({ url, platform });
        }
      });
    }
  } catch { }
  const seen = new Set();
  const out = [];
  for (const l of links) {
    const key = `${l.platform}:${l.url}`;
    if (!seen.has(key)) { seen.add(key); out.push(l); }
  }
  const order = { Facebook: 1, Twitter: 2, Instagram: 3, LinkedIn: 4 };
  out.sort((a, b) => (order[a.platform] || 99) - (order[b.platform] || 99));
  return out;
}
*/

/*
// Unused: collectSupplementaryPages
async function collectSupplementaryPages(outletName, queries, excludeUrl = null) {
  let links = [];
  for (const q of queries) {
    try {
      const rs = await serperSearch(q, 10);
      for (const r of rs) { if (r.link) links.push(r.link); }
    } catch { }
  }
  let dedup = Array.from(new Set(links));
  // Exclude the selected Google candidate host if provided
  try {
    if (excludeUrl) {
      const exHost = new URL(excludeUrl).hostname.replace(/^www\./, '').toLowerCase();
      dedup = dedup.filter(l => {
        try { return new URL(l).hostname.replace(/^www\./, '').toLowerCase() !== exHost; } catch { return true; }
      });
    }
  } catch { }
  // Keep only links likely related to the outlet (slug/path) or known profile/portfolio hosts
  const outletKey = outletName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '');
  const allowHosts = /(facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|muckrack\.com|about\.me|shutterstock\.com)/i;
  const rejectHosts = /(doubleclick\.net|cloudflareinsights\.com|captcha-delivery\.com|datado\.me|whatsapp\.com|google\.com|gstatic\.com|youtube\.com|w3\.org|kfc\.co\.th)/i;
  dedup = dedup.filter(l => {
    try {
      const u = new URL(l);
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      const path = `${u.pathname}${u.search}`.toLowerCase();
      if (rejectHosts.test(host)) return false;
      return allowHosts.test(host) || path.includes(outletKey) || host.includes(outletKey);
    } catch { return false; }
  });
  if (!dedup.length) {
    const sites = ['instagram.com', 'twitter.com', 'x.com', 'linkedin.com'];
    for (const site of sites) {
      try {
        const rs = await ddgHtmlSearch(`${outletName} site:${site}`, 10);
        for (const r of rs) { if (r.link) links.push(r.link); }
      } catch { }
    }
    dedup = Array.from(new Set(links));
    dedup = dedup.filter(l => {
      try {
        const u = new URL(l);
        const host = u.hostname.replace(/^www\./, '').toLowerCase();
        const path = `${u.pathname}${u.search}`.toLowerCase();
        if (rejectHosts.test(host)) return false;
        return allowHosts.test(host) || path.includes(outletKey) || host.includes(outletKey);
      } catch { return false; }
    });
  }
  return dedup.slice(0, 12);
}
*/

/*
// Unused: assessActivity
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
*/

/*
// Unused: detectOfficialWebsiteWithReport
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
*/

/*
// Unused: extractUrlsFromText
function extractUrlsFromText(raw, pageHost) {
  const urls = new Set();
  const rx = /(https?:\/\/[^\s"'<>]+)|\b(www\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;
  let m;
  while ((m = rx.exec(raw)) !== null) {
    let cand = (m[1] || m[2] || '').trim();
    if (!cand) continue;
    if (!/^https?:\/\//.test(cand)) cand = `https://${cand}`;
    try {
      const u = new URL(cand);
      const h = u.hostname.replace(/^www\./, '').toLowerCase();
      if (h === pageHost) continue;
      if (/facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|doubleclick\.net|cloudflareinsights\.com|gstatic\.com|google\.com/.test(h)) continue;
      urls.add(u.toString());
    } catch { }
  }
  return Array.from(urls);
}
*/

async function getShutterstockWebsite(url) {
  try {
    const res = await axios.get(url, { headers: { 'User-Agent': getUA(), 'Accept': 'text/html' }, timeout: 12000, maxRedirects: 5, validateStatus: () => true });
    const html = typeof res.data === 'string' ? res.data : '';
    const $ = cheerio.load(html);
    const candidates = [];
    $('a[href]').each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      if (!href) return;
      if (/^\//.test(href)) return;
      try {
        const u = new URL(/^https?:\/\//.test(href) ? href : `https://${href}`);
        const h = u.hostname.toLowerCase();
        if (/shutterstock\.com/.test(h)) return;
        candidates.push(u.toString());
      } catch { }
    });
    // Look for explicit www.* domain mentions in raw HTML/text
    const raw = $('body').text() + ' ' + html;
    const urlRx = /(https?:\/\/[^\s]+)|\b(www\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;
    let mm;
    while ((mm = urlRx.exec(raw)) !== null) {
      let cand = (mm[1] || mm[2] || '').trim();
      if (!cand) continue;
      if (!/^https?:\/\//.test(cand)) cand = `https://${cand}`;
      try {
        const u = new URL(cand);
        const h = u.hostname.toLowerCase();
        if (/shutterstock\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com/.test(h)) continue;
        candidates.push(u.toString());
      } catch { }
    }
    if (!candidates.length) return null;
    for (const c of Array.from(new Set(candidates))) {
      const ok = await verifyUrl(c);
      if (ok) return c;
    }
    return null;
  } catch { return null; }
}

/* UNUSED: findOutletSocialPages
async function findOutletSocialPages(outletName, hintHostname = null) {
  const base = outletName.replace(/\s+/g, ' ').trim();
  const quoted = `"${base}"`;
  const queries = [
    `${quoted} site:facebook.com`,
    `${quoted} site:twitter.com`,
    `${quoted} site:x.com`,
    `${quoted} site:instagram.com`,
    `${quoted} site:linkedin.com/company`,
    `${quoted} site:linkedin.com`,
    `${base} official facebook`,
    `${base} official twitter`,
    `${base} official instagram`,
    `${base} official linkedin`
  ];
  if (hintHostname) {
    const hostKey = hintHostname.replace(/^www\./, '').split('.')[0];
    queries.push(`"${hostKey}" site:facebook.com`);
    queries.push(`"${hostKey}" site:twitter.com`);
    queries.push(`"${hostKey}" site:instagram.com`);
    queries.push(`"${hostKey}" site:linkedin.com`);
  }
  const results = [];
  for (const q of queries) {
    const rs = await serperSearch(q, 8);
    for (const r of rs) {
      const link = r.link || '';
      if (!link) continue;
      if (/twitter\.com|x\.com|facebook\.com|instagram\.com|linkedin\.com/i.test(link)) {
        results.push(link);
      }
    }
  }
  if (!results.length) {
    const ddgSites = ['facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'linkedin.com'];
    for (const site of ddgSites) {
      const q = `${quoted} site:${site}`;
      try {
        const rs = await ddgHtmlSearch(q, 10);
        for (const r of rs) {
          const link = r.link || '';
          if (/facebook\.com|twitter\.com|x\.com|instagram\.com|linkedin\.com/i.test(link)) results.push(link);
        }
      } catch { }
    }
  }
  const dedup = Array.from(new Set(results));
  const pages = [];
  for (const url of dedup) {
    let platform = null;
    if (/facebook\.com/i.test(url)) platform = 'Facebook';
    else if (/twitter\.com|x\.com/i.test(url)) platform = 'Twitter';
    else if (/instagram\.com/i.test(url)) platform = 'Instagram';
    else if (/linkedin\.com/i.test(url)) platform = 'LinkedIn';
    if (platform) pages.push({ url, platform });
  }
  // Priority order: Facebook > Twitter/X > Instagram > LinkedIn
  const order = { Facebook: 1, Twitter: 2, Instagram: 3, LinkedIn: 4 };
  pages.sort((a, b) => (order[a.platform] || 99) - (order[b.platform] || 99));
  return pages.slice(0, 12);
}
*/

/* UNUSED: extractSocialLinksFromSite
async function extractSocialLinksFromSite(website) {
  const links = [];
  try {
    const $ = await fetchPage(website);
    if ($) {
      $('a[href]').each((_, el) => {
        const href = ($(el).attr('href') || '').trim();
        if (!href) return;
        const url = href.startsWith('/') ? `${website}${href}` : href;
        if (/facebook\.com|twitter\.com|x\.com|instagram\.com|linkedin\.com/i.test(url)) {
          let platform = null;
          if (/facebook\.com/i.test(url)) platform = 'Facebook';
          else if (/twitter\.com|x\.com/i.test(url)) platform = 'Twitter';
          else if (/instagram\.com/i.test(url)) platform = 'Instagram';
          else if (/linkedin\.com/i.test(url)) platform = 'LinkedIn';
          links.push({ url, platform });
        }
      });
    }
  } catch { }
  const seen = new Set();
  const out = [];
  for (const l of links) {
    const key = `${l.platform}:${l.url}`;
    if (!seen.has(key)) { seen.add(key); out.push(l); }
  }
  const order = { Facebook: 1, Twitter: 2, Instagram: 3, LinkedIn: 4 };
  out.sort((a, b) => (order[a.platform] || 99) - (order[b.platform] || 99));
  return out;
}
*/

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
      'news','opinion','technology','business','sports','international','entertainment','books','advertorials',
      'music','art','culture','style','politics','features','lifestyle','video','videos','podcast','africa'
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

/* UNUSED: collectSupplementaryPages
async function collectSupplementaryPages(outletName, queries, excludeUrl = null) {
  let links = [];
  for (const q of queries) {
    try {
      const rs = await serperSearch(q, 10);
      for (const r of rs) { if (r.link) links.push(r.link); }
    } catch { }
  }
  let dedup = Array.from(new Set(links));
  // Exclude the selected Google candidate host if provided
  try {
    if (excludeUrl) {
      const exHost = new URL(excludeUrl).hostname.replace(/^www\./, '').toLowerCase();
      dedup = dedup.filter(l => {
        try { return new URL(l).hostname.replace(/^www\./, '').toLowerCase() !== exHost; } catch { return true; }
      });
    }
  } catch { }
  // Keep only links likely related to the outlet (slug/path) or known profile/portfolio hosts
  const outletKey = outletName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '');
  const allowHosts = /(facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|muckrack\.com|about\.me|shutterstock\.com)/i;
  const rejectHosts = /(doubleclick\.net|cloudflareinsights\.com|captcha-delivery\.com|datado\.me|whatsapp\.com|google\.com|gstatic\.com|youtube\.com|w3\.org|kfc\.co\.th)/i;
  dedup = dedup.filter(l => {
    try {
      const u = new URL(l);
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      const path = `${u.pathname}${u.search}`.toLowerCase();
      if (rejectHosts.test(host)) return false;
      return allowHosts.test(host) || path.includes(outletKey) || host.includes(outletKey);
    } catch { return false; }
  });
  if (!dedup.length) {
    const sites = ['instagram.com', 'twitter.com', 'x.com', 'linkedin.com'];
    for (const site of sites) {
      try {
        const rs = await ddgHtmlSearch(`${outletName} site:${site}`, 10);
        for (const r of rs) { if (r.link) links.push(r.link); }
      } catch { }
    }
    dedup = Array.from(new Set(links));
    dedup = dedup.filter(l => {
      try {
        const u = new URL(l);
        const host = u.hostname.replace(/^www\./, '').toLowerCase();
        const path = `${u.pathname}${u.search}`.toLowerCase();
        if (rejectHosts.test(host)) return false;
        return allowHosts.test(host) || path.includes(outletKey) || host.includes(outletKey);
      } catch { return false; }
    });
  }
  return dedup.slice(0, 12);
}
*/

const KNOWN_BLOCKED_HOSTS = [
  'doubleclick.net', 'captcha-delivery.com', 'googletagmanager.com',
  'ct.captcha-delivery.com', 'cloudflare.com', 'akamaitechnologies.com',
  'gstatic.com', 'amazonaws.com', 'google-analytics.com',
  'googleapis.com', 'recaptcha.net', 'fonts.googleapis.com',
  'youtube.com', 'youtube-nocookie.com', 'whatsapp.com', 'datado.me'
];
function isBlockedInfraHost(host) {
  const h = host.toLowerCase().replace(/^www\./, '');
  return KNOWN_BLOCKED_HOSTS.some(blocked => h === blocked || h.endsWith('.' + blocked));
}

async function getExternalWebsiteFromPage(url, outletName = '') {
  const debug = !!process.env.DEBUG_FB_SITE_DETECT;
  try {
    const pageHost = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    if (/facebook\.com/i.test(pageHost)) {
      const fbGraph = await getFacebookPageWebsiteViaGraph(url);
      const fb = fbGraph || await getFacebookAboutWebsite(url);
      if (fb) return fb;
    }
    if (/instagram\.com/i.test(pageHost)) {
      const ig = await getInstagramBioWebsite(url);
      if (ig) return ig;
    }
    if (/twitter\.com|x\.com/i.test(pageHost)) {
      const tw = await getTwitterBioWebsite(url);
      if (tw) return tw;
    }
    if (/muckrack\.com/i.test(pageHost)) {
      const mr = await extractWebsiteFromSocialBio(url);
      if (mr) return mr;
    }
    if (/shutterstock\.com/i.test(pageHost)) {
      const ss = await getShutterstockWebsite(url);
      if (ss) return ss;
    }
    const res = await axios.get(url, { headers: { 'User-Agent': getUA(), 'Accept': 'text/html' }, timeout: 12000, maxRedirects: 5, validateStatus: () => true });
    const html = typeof res.data === 'string' ? res.data : '';
    const $ = cheerio.load(html);
    const cset = new Set();

    // Phase 1: Add all anchor and about/bio meta/blocks separately
    $('a[href]').each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      if (!href) return;
      try {
        // Look for u=... or url=... in attributes
        const uMatch = href.match(/(?:u|url)=([^&#]+)/);
        if (uMatch) {
          let uCand = decodeURIComponent(uMatch[1]);
          if (!/^https?:\/\//.test(uCand)) uCand = 'https://' + uCand;
          cset.add(uCand);
          if (debug) console.log(`[LINK_UNWRAP] from anchor: Added redirect param: ${uCand}`);
        }
        let u = new URL(/^https?:\/\//.test(href) ? href : `https://${href}`);
        let h = u.hostname.replace(/^www\./, '').toLowerCase();
        if (/l\.facebook\.com/.test(h)) {
          const real = u.searchParams.get('u') || u.searchParams.get('url') || '';
          if (real) {
            try { let r = decodeURIComponent(real); if (!/^https?:\/\//.test(r)) r = 'https://' + r; cset.add(r); if (debug) console.log(`[LINK_UNWRAP] from l.facebook.com: Added decoded: ${r}`); } catch { }
          }
        }
        if (h !== pageHost) {
          cset.add(u.toString());
        }
      } catch { }
    });

    // Phase 2: Greedy explicit bio/about selectors
    const bioAboutBlocks = [];
    const bioSelectors = [
      '.about', '.bio', '[role=bio]', '[itemprop="description"]', '.profile-bio', '.author-about', '.author-description', '.profile-bio__text',
      '.description', '.profile__bio'
    ];
    for (const sel of bioSelectors) {
      $(sel).each((_, el) => {
        const txt = $(el).text().trim();
        if (txt && txt.length > 3) bioAboutBlocks.push(txt);
      });
    }
    $("div,h1,h2,h3,h4,h5").each((_, el) => {
      const c = $(el).attr("class") || '';
      if (/about|bio/i.test(c)) {
        const t = $(el).text().trim();
        if (t && t.length > 3) bioAboutBlocks.push(t);
      }
    });
    let prioritizedSet = new Set();
    for (const txt of bioAboutBlocks) {
      for (const u of extractAllPotentialUrlsFromText(txt, 'about/bio')) prioritizedSet.add(u);
    }

    // Phase 3: All other text/meta/script
    const rawBlocks = [
      $('meta[property="og:description"]').attr('content') || '',
      $('meta[name="description"]').attr('content') || '',
      $('title').text() || '',
      $('body').text() || '',
      html
    ];
    $('script').each((_, el) => { const t = $(el).html(); if (t) rawBlocks.push(t); });
    for (const raw of rawBlocks) {
      for (const u of extractAllPotentialUrlsFromText(raw, 'main')) cset.add(u);
    }

    // Expand shorteners
    for (const c of Array.from(cset)) {
      if (/linktr\.ee|bit\.ly|t\.co/i.test(c)) {
        try {
          const resp = await axios.get(c, { maxRedirects: 5, timeout: 8000, validateStatus: () => true });
          const finalUrl = resp.request?.res?.responseUrl || resp.headers?.location || c;
          if (finalUrl && /^https?:\/\//.test(finalUrl)) cset.add(finalUrl);
        } catch { }
      }
    }

    // Prioritize about/bio above generic
    const candidates = Array.from(prioritizedSet).concat(Array.from(cset));
    const outletSlug = outletName.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const c of candidates) {
      try {
        const u = new URL(c);
        const lcHost = u.hostname.toLowerCase();
        if (isBlockedInfraHost(lcHost)) { if (debug) console.log(`[REJECT] ${c} blocked by infra host list`); continue; }
        if (/facebook|instagram|twitter|x\.com|linkedin|blogspot|wordpress|medium|about\.me|muckrack|shutterstock/.test(lcHost)) continue;
        // 1: Host contains outlet slug, or path contains it
        if (
          (outletSlug && (lcHost.replace(/^www\./, '').replace(/-/g, '').includes(outletSlug) || c.toLowerCase().includes(outletSlug)))
        ) {
          if (await verifyUrl(c)) { if (debug) console.log(`[DETECT_SITE] Accepted (slug match, prioritized): ${c}`); return c; }
          else { if (debug) console.log(`[REJECT] ${c} Verification failed (slug match, prioritized)`); }
        }
      } catch (e) { if (debug) console.log(`[REJECT] ${c} Error parsing candidate of slug match (prioritized):`, e); }
    }
    for (const c of candidates) {
      try {
        const u = new URL(c);
        const lcHost = u.hostname.toLowerCase();
        if (isBlockedInfraHost(lcHost)) { if (debug) console.log(`[REJECT] ${c} blocked by infra host list`); continue; }
        if (/facebook|instagram|twitter|x\.com|linkedin|blogspot|wordpress|medium|about\.me|muckrack|shutterstock/.test(lcHost)) continue;
        if (/\.co\.za$|\.co\.in$|\.com$|\.net$|\.org$|\.ng$|\.ke$|\.pk$|\.za$|\.africa$/.test(lcHost)) {
          if (await verifyUrl(c)) { if (debug) console.log(`[DETECT_SITE] Accepted (news ccTLD): ${c}`); return c; }
          else { if (debug) console.log(`[REJECT] ${c} Verification failed (news ccTLD)`); }
        }
      } catch (e) { if (debug) console.log(`[REJECT] ${c} Error parsing candidate of news ccTLD:`, e); }
    }
    for (const c of candidates) {
      try {
        const u = new URL(c);
        const lcHost = u.hostname.toLowerCase();
        if (isBlockedInfraHost(lcHost)) { if (debug) console.log(`[REJECT] ${c} blocked by infra host list`); continue; }
        if (/facebook|instagram|twitter|x\.com|linkedin|blogspot|wordpress|medium|about\.me|muckrack|shutterstock/.test(lcHost)) continue;
        if (await verifyUrl(c)) { if (debug) console.log(`[DETECT_SITE] Accepted (fallback live): ${c}`); return c; }
        else { if (debug) console.log(`[REJECT] ${c} Verification failed (fallback live)`); }
      } catch (e) { if (debug) console.log(`[REJECT] ${c} Error parsing candidate (fallback live):`, e); }
    }
    return null;
  } catch { return null; }
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
  const sels = ['a[href*="/author" ]', 'a[href*="/authors" ]', 'a[href*="/profile" ]', 'a[href*="/team" ]', 'a[href*="/contributors" ]', '[itemprop="author"] a', '[rel="author"]'];
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

  // STEP 2: AUTO-DETECT SECTIONS FROM NAVBAR/FOOTER/INTERNAL LINKS (dynamic)
  const sectionUrls = new Set([website]);

  try {
    const $ = await fetchPage(website);
    if ($) {
      const addSection = (url) => {
        try {
          const u = new URL(url.startsWith('/') ? `${website}${url}` : url);
          if (!u.hostname.includes(host)) return;
          const clean = u.toString().split('?')[0].replace(/#.*$/, '');
          sectionUrls.add(clean);
        } catch { }
      };
      $('header a[href], nav a[href], footer a[href], a[href]').each((_, el) => {
        const href = ($(el).attr('href') || '').trim();
        if (!href) return;
        const text = ($(el).text() || '').trim().toLowerCase();
        if (/^mailto:|^tel:/i.test(href)) return;
        const full = href.startsWith('/') ? `${website}${href}` : href;
        try {
          const u = new URL(full);
          if (!u.hostname.includes(new URL(website).hostname)) return;
          const path = u.pathname;
          const depth = path.split('/').filter(Boolean).length;
          const shortLabel = text && text.length <= 30;
          if (/\/category\//i.test(path)) addSection(u.toString());
          if (depth <= 2 && shortLabel && !/\d{4}/.test(path)) addSection(u.toString());
          if (/\/(news|world|business|sport|sports|opinion|tech|politics|entertainment|lifestyle|education|health|science|features|culture|africa)\b/i.test(path)) addSection(u.toString());
        } catch { }
      });
    }
  } catch { }

  try {
    const wpCats = await axios.get(`${website.replace(/\/$/, '')}/wp-json/wp/v2/categories?per_page=100`, { timeout: 8000, headers: { 'User-Agent': getUA() }, validateStatus: s => s < 500 });
    if (Array.isArray(wpCats.data)) {
      for (const c of wpCats.data) {
        const slug = (c.slug || '').toString();
        if (slug) sectionUrls.add(`${website.replace(/\/$/, '')}/category/${slug}/`);
      }
    }
  } catch { }

  try {
    const smUrls = [`${website.replace(/\/$/, '')}/sitemap_index.xml`, `${website.replace(/\/$/, '')}/sitemap.xml`];
    for (const sm of smUrls) {
      if (articles.size >= target) break;
      try {
        const res = await axios.get(sm, { timeout: 8000, headers: { 'User-Agent': getUA() } });
        const $ = cheerio.load(res.data, { xmlMode: true });
        const locs = [];
        $('loc').each((_, el) => { const loc = ($(el).text() || '').trim(); if (loc) locs.push(loc); });
        for (const loc of locs.slice(0, 200)) {
          try {
            const u = new URL(loc);
            if (!u.hostname.includes(new URL(website).hostname)) continue;
            const path = u.pathname;
            const depth = path.split('/').filter(Boolean).length;
            const isWpPostSm = /wp\-sitemap\-posts/i.test(path) || /post\-sitemap/i.test(path) || /sitemap\-posts/i.test(path);
            if (isWpPostSm) {
              try {
                const r2 = await axios.get(u.toString(), { timeout: 8000, headers: { 'User-Agent': getUA() } });
                const $$ = cheerio.load(r2.data, { xmlMode: true });
                $$('loc').each((_, el2) => {
                  if (articles.size >= target) return false;
                  const l2 = ($$(el2).text() || '').trim();
                  if (!l2) return;
                  try {
                    const u2 = new URL(l2);
                    if (!u2.hostname.includes(new URL(website).hostname)) return;
                    const p2 = u2.pathname;
                    if (/\/(tag|category|author|profile|search|archive|topic|section)\//i.test(l2)) return;
                    if (/\.(jpg|png|gif|pdf|mp4|mp3)$/i.test(l2)) return;
                    const titleGuess = u2.pathname.split('/').filter(Boolean).slice(-1)[0]?.replace(/[-_]/g, ' ') || '';
                    if (!articles.has(u2.toString())) {
                      articles.set(u2.toString(), { title: titleGuess || 'Article', url: u2.toString() });
                    }
                  } catch {}
                });
              } catch {}
              continue;
            }
            if (/\/category\//i.test(path) || (depth <= 2 && !/\d{4}/.test(path))) {
              sectionUrls.add(u.toString());
            } else {
              if (!/\.(jpg|png|gif|pdf|mp4|mp3)$/i.test(path)) {
                const titleGuess = path.split('/').filter(Boolean).slice(-1)[0]?.replace(/[-_]/g, ' ') || '';
                if (!articles.has(u.toString())) {
                  articles.set(u.toString(), { title: titleGuess || 'Article', url: u.toString() });
                }
              }
            }
          } catch { }
        }
      } catch { }
    }
  } catch { }

  console.log(`  Sections detected: ${sectionUrls.size}`);

  // STEP 3: DEEP SECTION SCRAPING WITH PAGINATION
  for (const section of sectionUrls) {
    if (articles.size >= target) break;

    console.log(`  → Scraping section: ${section}`);

    for (let page = 1; page <= 20; page++) {
      if (articles.size >= target) break;

      const pageUrl = page === 1
        ? section
        : `${section}?page=${page}`;
      const altPageUrl = `${section}/page/${page}`;

      const $ = await fetchPage(page === 1 ? pageUrl : (page % 2 === 0 ? pageUrl : altPageUrl));
      if (!$) break;

      const before = articles.size;

      $('a[href]').each((_, el) => {
        if (articles.size >= target) return;

        const href = $(el).attr('href');
        const title = $(el).text().trim() || $(el).attr('title');

        if (!href || !title) return;
        if (title.length < 15 || title.length > 300) return;

        let url = href.startsWith('/')
          ? `${website}${href}`
          : href;

        if (!url.includes(host)) return;

        if (/\/(tag|category|author|page|search|login|signup|about|policy|terms|archive|topic|section|video|photo|gallery)\b/i.test(url)) return;
        if (/\.(jpg|png|gif|pdf|mp4|mp3)$/i.test(url)) return;

        const isArticle =
          /\/\d{4}\//.test(url) ||
          /\.(html|cms)$/.test(url) ||
          /article|story|news/.test(url) ||
          /\d{6,}/.test(url) ||
          /articleshow|newsshow/.test(url) ||
          $(el).closest('article, .post, .entry, .post-card, .card-post, .article').length > 0 ||
          $(el).closest('.entry-title, .post-title, h2, h3').length > 0;

        if (isArticle && !articles.has(url)) {
          articles.set(url, { title, url });
        }
      });

      if (articles.size === before) break;
    }
  }

  console.log(`  Total collected: ${articles.size}`);
  if (articles.size < target) {
    try {
      const base = website.replace(/\/$/, '');
      for (let page = 1; page <= 5 && articles.size < target; page++) {
        const r = await axios.get(`${base}/wp-json/wp/v2/posts?per_page=100&page=${page}`, { timeout: 9000, headers: { 'User-Agent': getUA() }, validateStatus: s => s < 500 });
        const data = Array.isArray(r.data) ? r.data : [];
        for (const item of data) {
          const link = item?.link || item?.guid?.rendered || '';
          const t = item?.title?.rendered || '';
          if (!link) continue;
          try {
            const u = new URL(link);
            if (!u.hostname.includes(new URL(website).hostname)) continue;
            if (!articles.has(u.toString())) {
              articles.set(u.toString(), { title: (t || u.pathname.split('/').filter(Boolean).slice(-1)[0]?.replace(/[-_]/g, ' ') || 'Article'), url: u.toString() });
            }
          } catch {}
        }
        if (data.length < 100) break;
      }
    } catch {}
  }
  return Array.from(articles.values()).slice(0, target);
}

// ============ STEP 3: EXTRACT AUTHORS FROM ARTICLE BYLINES ============
function isBlockedAuthorName(name, website = "") {
  if (!name) return true;

  const clean = name.trim().toLowerCase();
  const outlet = website.toLowerCase();
  if (isEditorialName(name)) return false;
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
  if (outlet && clean.includes(outlet.replace(/^https?:\/\//, "").replace("www.", ""))) {
    return true;
  }

  // Block French article-leading phrases unless editorial
  if (/^(la|le|les|des|du|de|d’|d')\s+/.test(clean) && !/redaction|redaktion/.test(clean)) {
    return true;
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
async function extractAuthorsFromBylines(articles, website, max = 10) {
  console.log(`\n[STEP 3] Checking bylines in ${articles.length} articles (target: ${max} authors)`);
  const authors = new Map();

  const limit = Math.min(articles.length, 300);

  for (let i = 0; i < limit && authors.size < max; i += 5) {
    const batch = articles.slice(i, i + 5);

    await Promise.all(batch.map(async (article) => {
      if (authors.size >= max) return;

      const $ = await fetchPage(article.url);
      if (!$) return;

      let authorName = null;
      let authorRole = 'Journalist';

      // Method 0: Body-first strict byline detection (highest priority)
      try {
        const simple = await extractArticleAuthorSimple(article.url);
        if (simple && simple.author && simple.author !== 'Unknown' && !isBlockedAuthorName(simple.author, website)) {
          authorName = simple.author;
          if (isEditorialName(authorName)) authorRole = 'Editorial Team';
        }
      } catch {}

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
          '.article-author', '.post-author', '.article__author', '.post__author',
          '[itemprop="author"] [itemprop="name"]', '[itemprop="author"]',
          '.meta-author', '.entry-author', '.content-author', 'span.byline', '.story__author',
          '.c-author', '.post-meta .byline', '.entry-meta .byline', '.entry-meta [rel="author"]',
          '.td-post-author-name', '.jeg_meta_author', '.jeg_post_author', 'address.byline',
          '.entry-meta .author', '.article-meta .author', '.story-meta .byline',
          '.content-meta .author', '.blog-meta .byline', '.article-byline', '.header-meta .byline'
        ];

        for (const sel of bylineSelectors) {
          const $el = $(sel).first();

          const raw = $el.text().trim();
          const href = $el.find('a[href]').first().attr('href') || $el.attr('href') || '';
          const isProfileLink = /\/author\//i.test(href || '');
          const hasPrefix = /^(?:by|par|Publié par|Écrit par|Rédigé par|von|geschrieben von|verfasst von)\b/i.test(raw);
          let name = ($el.find('a[href]').first().text().trim() || raw)
            .replace(/^(?:by|par|por|Publicado por|Publié par|Écrit par|Rédigé par|geschrieben von|verfasst von|von|vom|durch|autor(?:in)?\s*:|auteur\s*:|autrice\s*:)\s+/i, '')
            .replace(/\|.*$/, '')
            .trim();

          if (isEditorialName(name)) {
            authorRole = 'Editorial Team';
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
      }

      // Method 3b: Targeted editorial body scan
      if (!authorName) {
        const headerText = [
          $('article').first().text(),
          $('.single-post').first().text(),
          $('.post').first().text(),
          $('.entry').first().text(),
          $('.entry-header').first().text(),
          $('.article-header').first().text(),
          $('body').text().substring(0, 2000)
        ].join(' ').toLowerCase();
        const hasEditorial =
          /\b(?:par|publié par|écrit par|rédigé par)\s+la\s+rédaction\b/.test(headerText) ||
          /\bla\s+rédaction\b/.test(headerText) ||
          /\bredaktion\b/.test(headerText);
        if (hasEditorial) {
          authorName = 'La rédaction';
          authorRole = 'Editorial Team';
        }
      }

      // Method 4: Fallback — body byline detection with strict rules
      if (!authorName) {
        try {
          const simple = await extractArticleAuthorSimple(article.url);
          if (simple && simple.author && simple.author !== 'Unknown' && !isBlockedAuthorName(simple.author, website)) {
            authorName = simple.author;
            if (isEditorialName(authorName)) authorRole = 'Editorial Team';
          }
        } catch {}
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
  const nameSlug = toSlug(authorName);
  const segs = path.split('/').filter(Boolean);
  const ix = segs.indexOf('author');
  const slugInPath = ix !== -1 ? (segs[ix + 1] || '') : '';

  let score = 0;

  // Strong signals
  if (pageText.includes(name)) score += 5;
  if ($("meta[property='og:type']").attr("content")?.includes("profile")) score += 3;
  if ($("meta[name='author']").attr("content")?.toLowerCase().includes(name)) score += 5;
  if (titleText.includes(name)) score += 3;
  if (/author|writer|columnist|profile|people|contributors|staff|byline/.test(path)) score += 3;
  if (path.includes('/author/') && slugInPath) {
    if (slugInPath === nameSlug) score += 6;
    else score -= 4;
  }

  // Bio / profile indicators
  if (/about|bio|profile|journalist|writer|columnist/i.test(pageText)) score += 2;

  // Social links are strong indicators
  if ($("a[href*='twitter']").length) score += 1;
  if ($("a[href*='linkedin']").length) score += 1;

  // Heavy penalties
  if (/breaking news|latest news|live updates|category|archive/i.test(pageText)) {
    score -= 10;
  }

  if (path.includes('/author/')) {
    return slugInPath === nameSlug && score >= 5;
  }
  return (titleText.includes(name) || pageText.includes(name)) && score >= 7;
}

// ============ STEP 4: FIND AUTHOR PROFILE PAGE VIA SERPER ============
async function findAuthorProfile(authorName, website) {
  const hostname = new URL(website).hostname.replace(/^www\./, "");
  const hostParts = hostname.split('.');
  const baseDomain = hostParts.slice(-2).join('.');
  const base = authorName.toLowerCase().trim();
  const nameSlug = toSlug(authorName);
  const nameUnderscore = base.replace(/\s+/g, "_");
  const firstName = base.split(" ")[0];
  const editorial = isEditorialName(authorName);

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

    `${website}/etreporter/author-${nameSlug}`,
    `${website}/etreporter/author-${nameUnderscore}`
  ];

  if (editorial) {
    patterns.push(
      `${website}/redaction`,
      `${website}/la-redaction`,
      `${website}/redaktion`,
      `${website}/team`,
      `${website}/staff`,
      `${website}/about`,
      `${website}/a-propos`,
      `${website}/qui-sommes-nous`
    );
  }

  for (const url of patterns) {
    const $ = await fetchPage(url);
    if ($ && validateAuthorPage($, authorName, url)) {
      return { url, $ };
    }
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
  if (!$ || !profileUrl) return [];

  const articles = new Map();
  const host = new URL(website).hostname;

  const basePages = [
    profileUrl,
    `${profileUrl}?page=2`,
    `${profileUrl}/page/2`
  ];

  for (const pageUrl of basePages) {
    if (articles.size >= 10) break;

    const $$ = pageUrl === profileUrl ? $ : await fetchPage(pageUrl);
    if (!$$) continue;

    $$('a[href]').each((i, el) => {
      if (articles.size >= 10) return false;

      const href = $$(el).attr('href');
      const title = $$(el).text().trim() || $$(el).attr('title');

      if (!href || !title || title.length < 15 || title.length > 300) return;

      let url = href.startsWith('/')
        ? `${website}${href}`
        : href;

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

  return Array.from(articles.values());
}

// ============ STEP 6: VERIFY ARTICLES BELONG TO AUTHOR ============
async function verifyArticles(articles, authorName) {
  if (!articles.length) return [];

  const verified = [];
  const firstName = authorName.split(/\s+/)[0].toLowerCase();
  const lastName = authorName.split(/\s+/).pop()?.toLowerCase() || '';
  const editorial = isEditorialName(authorName);

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
              (
                (editorial && /redaction|redaktion/i.test(auth.toLowerCase())) ||
                (auth.toLowerCase().includes(firstName) && (!lastName || auth.toLowerCase().includes(lastName)))
              )
            ) {
              isAuthorMatch = true;
            }

            if (
              auth?.name &&
              (
                (editorial && /redaction|redaktion/i.test(auth.name.toLowerCase())) ||
                (auth.name.toLowerCase().includes(firstName) && (!lastName || auth.name.toLowerCase().includes(lastName)))
              )
            ) {
              isAuthorMatch = true;
            }

            if (
              Array.isArray(auth) &&
              auth[0]?.name &&
              (
                (editorial && /redaction|redaktion/i.test(auth[0].name.toLowerCase())) ||
                (auth[0].name.toLowerCase().includes(firstName) && (!lastName || auth[0].name.toLowerCase().includes(lastName)))
              )
            ) {
              isAuthorMatch = true;
            }
          }
          // Fallback to creator/byline properties sometimes used
          if (item.creator) {
            const crt = item.creator;
            if (typeof crt === 'string' && (
              (editorial && /redaction|redaktion/i.test(crt.toLowerCase())) ||
              (crt.toLowerCase().includes(firstName) && (!lastName || crt.toLowerCase().includes(lastName)))
            )) {
              isAuthorMatch = true;
            }
            if (crt?.name && (
              (editorial && /redaction|redaktion/i.test(crt.name.toLowerCase())) ||
              (crt.name.toLowerCase().includes(firstName) && (!lastName || crt.name.toLowerCase().includes(lastName)))
            )) {
              isAuthorMatch = true;
            }
          }
          if (item.byline && typeof item.byline === 'string') {
            const bl = item.byline.toLowerCase();
            if (
              (editorial && /redaction|redaktion/.test(bl)) ||
              (bl.includes(firstName) && (!lastName || bl.includes(lastName)))
            ) {
              isAuthorMatch = true;
            }
          }
        }
      } catch { }
    });

    // Method 2: Byline check
    if (!isAuthorMatch) {
      const bylineSelectors = [
        '.author', '.byline', '.author-name', '.byline-author', '[rel="author"]', '[itemprop="author"]',
        '.article__author', '.post__author', '.c-author', 'span.byline', '.story__author', '.meta-author',
        '.entry-author', '.content-author', '[class*="author"] [class*="name"]'
      ];
      let bylineText = '';
      for (const sel of bylineSelectors) {
        const t = $(sel).first().text().toLowerCase();
        if (t && t.length >= 3) { bylineText = t; break; }
      }

      if (editorial ? /redaction|redaktion/.test(bylineText) : (bylineText.includes(firstName) && (!lastName || bylineText.includes(lastName)))) {
        isAuthorMatch = true;
      }
      // Explicit "By Name" pattern disabled (only explicit bylines used)
      // rel="author" link pointing to profile with name
      if (!isAuthorMatch) {
        const href = $('a[rel="author"]').first().attr('href') || '';
        const label = $('a[rel="author"]').first().text().toLowerCase();
        if (
          (editorial && /redaction|redaktion/.test(label)) ||
          (label && label.includes(firstName) && (!lastName || label.includes(lastName))) ||
          (href && href.toLowerCase().includes(firstName) && (!lastName || href.toLowerCase().includes(lastName)))
        ) {
          isAuthorMatch = true;
        }
      }
    }

    if (isAuthorMatch) {
      const publishedAt = extractPublicationDate($, article.url);
      verified.push(publishedAt ? { ...article, publishDate: publishedAt, publishedAt } : article);
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
async function socialPageMatchesOutlet(url, website, outletName) {
  const tokens = buildOutletMatchTokens(website, outletName);
  try {
    const $ = await fetchPage(url);
    if ($) {
      const text = [
        $('meta[property="og:title"]').attr('content') || '',
        $('meta[property="og:description"]').attr('content') || '',
        $('meta[name="description"]').attr('content') || '',
        $('h1').first().text() || '',
        $('body').text().substring(0, 1200) || ''
      ].join(' ').toLowerCase();
      if (tokens.some(t => t && text.includes(t.toLowerCase()))) return true;
    }
  } catch { }
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

  // Block outlet + brand accounts
  const rejectPatterns = /economictimes|timesofindia|hindustantimes|thehindu|ndtv|indiatoday|indianexpress|livemint|news|official|team/i;

  // TWITTER SEARCH 

  const synFromWebsite = getOutletSynonyms(website);
  const synonyms = (Array.isArray(synFromWebsite) && synFromWebsite.length > 0)
    ? synFromWebsite
    : [outletName];
  let twitterResultsAll = [];
  for (const syn of synonyms) {
    const twitterQuery = `"${authorName}" "${syn}" twitter`;
    console.log(`      Twitter search: "${twitterQuery}"`);
    const rs = await serperSearch(twitterQuery, 10);
    twitterResultsAll.push(...rs);
    if (links.twitter) break;
  }
  console.log(`      Found ${twitterResultsAll.length} results`);
  const twitterCandidates = [];
  for (const r of twitterResultsAll.slice(0, 20)) {
    const link = r.link;
    if (!link) continue;
    if (!link.includes("twitter.com") && !link.includes("x.com")) continue;
    if (/\/status\/|\/intent\/|\/hashtag\/|\/search/.test(link)) continue;
    const m = link.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/);
    if (!m) continue;
    const username = m[1].toLowerCase();
    if (rejectPatterns.test(username)) continue;
    const text = `${r.title || ""} ${r.snippet || ""}`.toLowerCase();
    let score = 0;
    if (text.includes(authorName.toLowerCase())) score += 3;
    if (text.includes(firstName)) score += 2;
    if (lastName && text.includes(lastName)) score += 2;
    if (username.includes(firstName)) score += 2;
    if (lastName && username.includes(lastName)) score += 2;
    if (/^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[a-z0-9_]+\/?$/i.test(link)) score += 1;
    twitterCandidates.push({ url: `https://twitter.com/${m[1]}`, score });
  }
  twitterCandidates.sort((a, b) => b.score - a.score);
  if (twitterCandidates.length) {
    let chosenT = null;
    for (const cand of twitterCandidates.slice(0, 5)) {
      if (await verifyUrl(cand.url)) {
        const ok = await socialPageMatchesOutlet(cand.url, website, outletName);
        if (ok) { chosenT = cand.url; break; }
      }
    }
    if (chosenT) {
      links.twitter = chosenT;
      console.log(`      ✓ Twitter found: ${links.twitter}`);
    } else {
      console.log(`      ✗ No Twitter matched outlet`);
    }
  }

  if (!links.twitter) console.log(`      ✗ No Twitter found`);

  // LINKEDIN SEARCH 

  let linkedinResultsAll = [];
  const nameVariants = new Set([authorName]);
  const parts = authorName.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) nameVariants.add(`${parts[0]} ${parts[parts.length - 1]}`);
  if (parts.length >= 2) nameVariants.add(`${parts[parts.length - 1]} ${parts[0]}`);
  if (parts.length >= 2) nameVariants.add(`${parts[0][0]}. ${parts[parts.length - 1]}`);
  console.log(`      LinkedIn search: "${authorName}" "${synonyms[0] || outletLower}" site:linkedin.com/in`);
  for (const variant of Array.from(nameVariants).slice(0, 2)) {
    for (const syn of synonyms.slice(0, 1)) {
      const qs = [
        `"${variant}" "${syn}" site:linkedin.com/in`,
        `"${variant}" site:linkedin.com/in`
      ];
      for (const q of qs) {
        const rs = await serperSearch(q, 6);
        linkedinResultsAll.push(...rs);
        if (links.linkedin) break;
        if (linkedinResultsAll.length > 40) break;
      }
      if (links.linkedin) break;
      if (linkedinResultsAll.length > 40) break;
    }
    if (links.linkedin) break;
    if (linkedinResultsAll.length > 40) break;
  }
  console.log(`      Found ${linkedinResultsAll.length} results`);
  const linkedinCandidates = [];
  for (const r of linkedinResultsAll.slice(0, 100)) {
    const link = r.link;
    if (!link) continue;
    if (!/linkedin\.com\/(in|pub)\//.test(link)) continue;
    if (/\/company\/|\/jobs\/|\/pulse\//.test(link)) continue;
    const m = link.match(/(https?:\/\/(?:[a-zA-Z0-9.-]+\.)?linkedin\.com\/(?:in|pub)\/[a-zA-Z0-9_-]+)/);
    if (!m) continue;
    const slug = (m[1].split("/in/")[1] || m[1].split("/pub/")[1] || "").toLowerCase();
    if (!slug || slug === 'dir' || slug.length < 3) continue;
    if (!/[a-z]/.test(slug)) continue;
    if (rejectPatterns.test(slug)) continue;
    if (!(slug.includes(firstName) || (lastName && slug.includes(lastName)))) continue;
    const text = `${r.title || ""} ${r.snippet || ""}`.toLowerCase();
    let score = 0;
    if (text.includes(authorName.toLowerCase())) score += 4;
    if (text.includes(firstName)) score += 2;
    if (lastName && text.includes(lastName)) score += 2;
    if (slug.includes(firstName)) score += 3;
    if (lastName && slug.includes(lastName)) score += 3;
    if (/\blinked[in]?\b/i.test(text)) score += 1;
    linkedinCandidates.push({ url: m[1], score });
  }
  linkedinCandidates.sort((a, b) => b.score - a.score);
  if (linkedinCandidates.length) {
    let chosen = null;
    for (const cand of linkedinCandidates.slice(0, 5)) {
      if (await verifyUrl(cand.url)) {
        const ok = await socialPageMatchesOutlet(cand.url, website, outletName);
        if (ok) { chosen = cand.url; break; }
      }
    }
    if (chosen) {
      links.linkedin = chosen;
      console.log(`      ✓ LinkedIn found: ${links.linkedin}`);
    } else {
      console.log(`      ✗ No LinkedIn matched outlet`);
    }
  }

  if (!links.linkedin) console.log(`      ✗ No LinkedIn found`);

  if (!links.linkedin) {
    const variant = authorName;
    const syn = (typeof synonyms !== "undefined" && Array.isArray(synonyms) && synonyms.length ? synonyms[0] : outletLower);
    const ddgQueries = [
      `"${variant}" "${syn}" site:linkedin.com/in`,
      `"${variant}" site:linkedin.com/in`,
      `"${authorName}" site:linkedin.com/in`
    ];
    const ddgResults = [];
    for (const q of ddgQueries) {
      const rs = await ddgHtmlSearch(q, 6);
      ddgResults.push(...rs);
    }
    console.log(`      Found ${ddgResults.length} results`);
    const ddgCandidates = [];
    for (const r of ddgResults.slice(0, 100)) {
      const link = r.link;
      if (!link || !/linkedin\.com\/(in|pub)\//.test(link)) continue;
      if (/\/company\/|\/jobs\/|\/pulse\//.test(link)) continue;
      const m = link.match(/(https?:\/\/(?:[a-zA-Z0-9.-]+\.)?linkedin\.com\/(?:in|pub)\/[a-zA-Z0-9_-]+)/);
      if (!m) continue;
      const slug = (m[1].split('/in/')[1] || m[1].split('/pub/')[1] || '').toLowerCase();
      if (!slug || slug === 'dir' || slug.length < 3) continue;
      if (!/[a-z]/.test(slug)) continue;
      if (rejectPatterns.test(slug)) continue;
      if (!(slug.includes(firstName) || (lastName && slug.includes(lastName)))) continue;
      const text = `${r.title || ''} ${r.snippet || ''}`.toLowerCase();
      let score = 0;
      if (text.includes(authorName.toLowerCase())) score += 4;
      if (slug.includes(firstName)) score += 2;
      if (lastName && slug.includes(lastName)) score += 2;
      if (text.includes(outletLower)) score += 2;
      for (const syn of synonyms) { if (syn && text.includes(syn.toLowerCase())) { score += 1; break; } }
      if (/\blinked[in]?\b/i.test(text)) score += 1;
      ddgCandidates.push({ url: m[1], score });
    }
    ddgCandidates.sort((a, b) => b.score - a.score);
    if (ddgCandidates.length) {
      let chosen = null;
      for (const cand of ddgCandidates.slice(0, 5)) {
        if (await verifyUrl(cand.url)) {
          const ok = await socialPageMatchesOutlet(cand.url, website, outletName);
          if (ok) { chosen = cand.url; break; }
        }
      }
      if (chosen) { links.linkedin = chosen; }
    }
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

// ============ PERSONAL WEBSITE DISCOVERY ============
async function findPersonalWebsite(authorName, socialLinks, website, outletName) {
  const blockedHosts = /facebook|instagram|twitter|x\.com|linkedin|medium\.com\/company|substack\.com\/publication|blogspot\.com\/u\//i;
  const outletHost = (() => { try { return new URL(website).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const queries = [
    `"${authorName}" personal website`,
    `"${authorName}" portfolio`,
    `"${authorName}" official site`,
    `"${authorName}" about me`,
    `"${authorName}" site:about.me`,
    `"${authorName}" site:substack.com`,
    `"${authorName}" site:medium.com`,
    `"${authorName}" site:notion.site`,
    `"${authorName}" site:wordpress.com`,
    `"${authorName}" blog`
  ];
  const results = [];
  for (const q of queries) {
    const rs = await serperSearch(q, 6);
    results.push(...rs);
    const drs = await ddgHtmlSearch(q, 6);
    results.push(...drs);
    if (results.length > 40) break;
  }
  const candidates = [];
  for (const r of results) {
    const link = r.link;
    if (!link || !/^https?:\/\//.test(link)) continue;
    try {
      const u = new URL(link);
      const h = u.hostname.replace(/^www\./, '').toLowerCase();
      if (outletHost && h.includes(outletHost)) continue;
      if (blockedHosts.test(h)) continue;
      if (/linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com/.test(h)) continue;
      candidates.push(u.toString());
    } catch {}
  }
  for (const url of Array.from(new Set(candidates)).slice(0, 10)) {
    try {
      const ok = await verifyUrl(url);
      if (!ok) continue;
      const $ = await fetchPage(url);
      if (!$) continue;
      const name = authorName.toLowerCase();
      const t = [
        $('title').text() || '',
        $('meta[name="description"]').attr('content') || '',
        $('meta[property="og:description"]').attr('content') || '',
        $('h1').first().text() || '',
        $('body').text().substring(0, 1000) || ''
      ].join(' ').toLowerCase();
      if (t.includes(name.split(' ')[0]) && t.includes(name.split(' ').slice(-1)[0])) {
        return url;
      }
    } catch {}
  }
  return null;
}

// ============ EXTRACT ROLE FROM PERSONAL WEBSITE ============
async function extractRoleFromPersonalSite(url, authorName, outletName, website) {
  try {
    const $ = await fetchPage(url);
    if (!$) return null;
    const tokens = buildOutletMatchTokens(website, outletName);
    const text = [
      $('meta[name="description"]').attr('content') || '',
      $('meta[property="og:description"]').attr('content') || '',
      $('h1').first().text() || '',
      $('h2').first().text() || '',
      $('body').text().substring(0, 1500) || ''
    ].join(' ');
    for (const tok of tokens) {
      const rx1 = new RegExp(`([A-Za-z][A-Za-z\\s&\\-]{3,60})\\s+(?:at|@)\\s+${tok.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}`, 'i');
      const m1 = text.match(rx1);
      if (m1 && m1[1]) {
        const cand = m1[1].trim();
        const r = matchRole(cand);
        if (r && !isGenericRole(r)) return r;
      }
    }
    const rb = extractRoleFromBio(text, authorName);
    if (rb && !isGenericRole(rb)) return rb;
    const mr = matchRole(text);
    if (mr && !isGenericRole(mr)) return mr;
    return null;
  } catch {
    return null;
  }
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
  let lastActiveAt = null;

  // STEP 4: Find profile page
  console.log(`    Finding profile page...`);
  const { url: foundProfileUrl, $: $ } = await findAuthorProfile(author.name, website);

  if (foundProfileUrl) {
    profileUrl = foundProfileUrl;
    console.log(`    ✓ Profile: ${profileUrl}`);

    // STEP 5: Scrape articles from profile
    const profileArticles = await scrapeArticlesFromProfile($, profileUrl, author.name, website);
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
    for (const sel of bioSelectors) {
      const text = $(sel).first().text().trim();
      if (text && text.length > 20 && text.length < 1000) { bio = text; break; }
    }
    if (!bio) {
      // JSON-LD Person.description
      $('script[type="application/ld+json"]').each((_, el) => {
        if (bio) return false;
        try {
          const data = JSON.parse($(el).html());
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
      const metaDesc = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content');
      if (metaDesc && metaDesc.length > 20 && metaDesc.length < 300) bio = metaDesc.trim();
    }

    if (bio) {
      const bioRole = extractRoleFromBio(bio, author.name);
      if (bioRole && !isGenericRole(bioRole)) {
        role = bioRole;
        console.log(`    ✓ Role from bio: ${role}`);
      }
    }

    // Structured profile role and email
    const { role: pageRole, email: pageEmail } = extractRoleAndEmail($, author.name);
    if (pageEmail) email = pageEmail;
    if (pageRole && !isGenericRole(pageRole) && (!role || isGenericRole(role))) {
      role = pageRole;
    }

    const fn = author.name.split(/\s+/)[0].toLowerCase();
    const ln = author.name.split(/\s+/).pop()?.toLowerCase() || '';
    const rejectBrand = /economictimes|timesofindia|hindustantimes|thehindu|ndtv|indiatoday|indianexpress|livemint|news|official|team/i;
    $('a[href*="twitter.com/"], a[href*="x.com/"]').each((i, el) => {
      if (socialLinks.twitter) return false;
      const href = $(el).attr('href');
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
    $('a[href*="linkedin.com/in/"]').each((i, el) => {
      if (socialLinks.linkedin) return false;
      const href = $(el).attr('href');
      if (!href) return;
      const m = href.match(/(https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+)/);
      if (!m) return;
      const slug = m[1].split('/in/')[1]?.toLowerCase() || '';
      if (rejectBrand.test(slug)) return;
      if (slug.includes(fn) || (ln && slug.includes(ln))) {
        socialLinks.linkedin = m[1];
      }
    });
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

  // Personal website role discovery before publication fallback
  if (!role || isGenericRole(role)) {
    const personalSite = await findPersonalWebsite(author.name, socialLinks, website, outletName);
    if (personalSite) {
      const rPortfolio = await extractRoleFromPersonalSite(personalSite, author.name, outletName, website);
      if (rPortfolio && !isGenericRole(rPortfolio)) {
        role = rPortfolio;
        console.log(`    ✓ Role from personal site: ${role}`);
      }
    }
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

  // Merge publish dates from verified articles into full article list
  const pubMap = new Map();
  for (const va of uniqueVerifiedArticles) {
    const p = (va.publishedAt || va.publishDate || null);
    if (p) pubMap.set(va.url, p);
  }
  if (!lastActiveAt) {
    // Try to infer from verified article dates first, then fallback
    const dates = Array.from(pubMap.values()).map(v => new Date(v)).filter(d => !isNaN(d.getTime()));
    if (dates.length) {
      dates.sort((a, b) => b.getTime() - a.getTime());
      lastActiveAt = dates[0].toISOString();
    } else {
      lastActiveAt = await inferLastActiveDate(uniqueArticles);
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

  console.log(`    ══════════════════════════════════════`);
  console.log(`    Role: ${role} | Articles: ${uniqueArticles.length} | Twitter: ${socialLinks.twitter ? '✓' : '✗'} | LinkedIn: ${socialLinks.linkedin ? '✓' : '✗'}`);

  return {
    name: author.name,
    role,
    bio,
    email,
    profileUrl,
    profileUrlVerified: !!profileUrl,
    socialLinks,
    verifiedArticles: uniqueVerifiedArticles.slice(0, 20).map(a => ({ title: a.title, url: a.url, publishDate: pubMap.get(a.url) || null })),
    articles: uniqueArticles.slice(0, 20).map(a => ({ title: a.title, url: a.url, publishDate: pubMap.get(a.url) || null })),
    totalArticles: uniqueArticles.length,
    lastActiveAt,
    topics: topics.slice(0, 5),
    keywords: keywordStrings.slice(0, 10),
    influenceScore: influence
  };
}
// ============ MAIN SCRAPER FUNCTION ============
export async function scrapeLightweight(outletName, maxAuthors = 30, progressCallback = null) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`SCRAPER: ${outletName} | Target: ${maxAuthors} journalists`);
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
      return { error: `No articles found on ${website}`, authorsCount: 0, authors: [] };
    }

    // STEP 3: Extract authors from bylines
    let authors = await extractAuthorsFromBylines(articles, website, maxAuthors);
    if (authors.length === 0) {
      return { error: `No authors found`, authorsCount: 0, authors: [] };
    }

    // STEPS 4-9: Extract full profile for each author
    console.log(`\n[STEP 4-9] Extracting ${authors.length} profiles...`);
    const profiles = [];

    for (let i = 0; i < authors.length; i++) {
      console.log(`\n[${i + 1}/${authors.length}] Processing: ${authors[i].name}`);

      const profile = await extractAuthorProfile(authors[i], outletName, website);

      // ✅ VERIFY SOCIAL LINKS HERE (use socialLinks object)
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
/*  extractUrlsFromText
function extractUrlsFromText(raw, pageHost) {
  const urls = new Set();
  const rx = /(https?:\/\/[^\s"'<>]+)|\b(www\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;
  let m;
  while ((m = rx.exec(raw)) !== null) {
    let cand = (m[1] || m[2] || '').trim();
    if (!cand) continue;
    if (!/^https?:\/\//.test(cand)) cand = `https://${cand}`;
    try {
      const u = new URL(cand);
      const h = u.hostname.replace(/^www\./, '').toLowerCase();
      if (h === pageHost) continue;
      if (/facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|doubleclick\.net|cloudflareinsights\.com|gstatic\.com|google\.com/.test(h)) continue;
      urls.add(u.toString());
    } catch { }
  }
  return Array.from(urls);
}
*/

// === AGGRESSIVE DOMAIN EXTRACTION FROM TEXT ===
function extractAllPotentialUrlsFromText(raw, contextTag = '') {
  const urls = new Set();
  if (!raw) return [];
  // Unescape any HTML entities, collapse all line breaks/tabs etc
  let flattened = raw.replace(/\r|\n|\t/g, ' ');
  try { flattened = he.decode(flattened); } catch { }
  // Regex: Find words containing a dot and TLD (allow a-z, 0-9, hyphens, dots), optionally surrounded by punctuation, whitespace, parens, etc
  // Also match http(s)://, www., or just domain.tld
  const rx = /\b(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][a-zA-Z0-9\-\.]*\.[a-zA-Z]{2,}(?:\/[\w\-\/.\?%&=]*)?)/gi;
  let m;
  while ((m = rx.exec(flattened)) !== null) {
    let dom = m[0];
    dom = dom.replace(/[.,;:!?\)\[\]{}\">']+$/, '');
    dom = dom.replace(/^['\(\["{]+/, '');
    // Defend against common false positives (double dots, ending on term, etc)
    if ((dom.match(/\./g) || []).length < 1) continue;
    if (!/^https?:\/\//.test(dom)) dom = 'https://' + dom;
    urls.add(dom);
    if (typeof process !== 'undefined' && process.env.DEBUG_FULL_URL_SCAN) {
      console.log(`[URL_SCAN] From ${contextTag}: Matched candidate domain: ${dom} (in:`, raw.slice(Math.max(0, m.index - 30), m.index + 60), ")");
    }
  }
  return Array.from(urls);
}

