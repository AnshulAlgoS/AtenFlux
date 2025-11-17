/**
 * Strict validation utilities for author scraping
 * Ensures only real journalists are scraped, not categories/sections
 */

// Category/section names that are NOT journalists
const INVALID_NAMES = [
  'travel', 'news', 'desk', 'bureau', 'team', 'editor', 'reporter',
  'international', 'national', 'sports', 'business', 'politics',
  'entertainment', 'technology', 'health', 'education', 'general',
  'lifestyle', 'opinion', 'analysis', 'cricket', 'food', 'auto',
  'world', 'india', 'fashion', 'gaming', 'music', 'movies', 'tv',
  'science', 'environment', 'climate', 'regional', 'state'
];

/**
 * Validate if a name is likely a real person vs a category/section
 */
export function isValidJournalistName(name) {
  if (!name || typeof name !== 'string') return false;
  
  const trimmedName = name.trim();
  
  // Too short or too long
  if (trimmedName.length < 5 || trimmedName.length > 50) return false;
  
  // Check word count (must be 2-5 words for "First Last")
  const words = trimmedName.split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  
  // Check if name is in invalid list (case-insensitive)
  const nameLower = trimmedName.toLowerCase();
  if (INVALID_NAMES.includes(nameLower)) return false;
  
  // Each word in invalid list
  const hasInvalidWord = words.some(word => INVALID_NAMES.includes(word.toLowerCase()));
  if (hasInvalidWord && words.length === 1) return false;
  
  // Must contain only letters, spaces, dots, hyphens, apostrophes
  if (!/^[A-Za-z\s\.\-\']+$/.test(trimmedName)) return false;
  
  // Check for common non-name patterns
  const badPatterns = [
    /^(the|by|from|with|and|or)\s/i,  // Starts with articles/conjunctions
    /(desk|bureau|team|staff|group)$/i,  // Ends with team indicators
    /^(mr|mrs|ms|dr|prof)\s/i,  // Don't want titles (we want clean names)
  ];
  
  for (const pattern of badPatterns) {
    if (pattern.test(trimmedName)) return false;
  }
  
  return true;
}

/**
 * Validate if a profile URL looks like a real journalist profile
 */
export function isValidProfileURL(url, name) {
  if (!url) return false;
  
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.toLowerCase();
    
    // Must contain /author/, /profile/, /journalist/, etc.
    if (!/\/(author|profile|journalist|writer|reporter|contributor|people|staff)\//i.test(path)) {
      return false;
    }
    
    // URL should contain a hyphenated version of the name
    if (name) {
      const nameSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z\-]/g, '');
      
      // Check if URL path contains the name slug or significant part of it
      if (nameSlug.length > 5) {
        const nameWords = nameSlug.split('-').filter(w => w.length > 2);
        if (nameWords.length >= 2) {
          // At least one significant word from name should be in URL
          const hasNameInUrl = nameWords.some(word => path.includes(word));
          if (!hasNameInUrl) return false;
        }
      }
    }
    
    // Reject URLs that look like topic/category pages
    const categoryPatterns = [
      '/author/travel', '/author/sports', '/author/news',
      '/author/business', '/author/politics', '/author/entertainment',
      '/author/technology', '/author/health', '/author/education',
      '/topic/', '/category/', '/section/', '/tag/'
    ];
    
    for (const pattern of categoryPatterns) {
      if (path.includes(pattern)) return false;
    }
    
    return true;
    
  } catch (e) {
    return false;
  }
}

/**
 * Validate scraped author object before saving to database
 */
export function validateAuthor(author) {
  const errors = [];
  
  if (!author.name) {
    errors.push('Missing name');
  } else if (!isValidJournalistName(author.name)) {
    errors.push(`Invalid name format: "${author.name}"`);
  }
  
  if (!author.profileLink) {
    errors.push('Missing profile link');
  } else if (!isValidProfileURL(author.profileLink, author.name)) {
    errors.push(`Invalid profile URL: "${author.profileLink}"`);
  }
  
  if (!author.outlet) {
    errors.push('Missing outlet');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Calculate quality score for a profile (0-100)
 * Used for post-scraping cleanup
 */
export function calculateProfileQuality(profile) {
  let score = 0;
  const issues = [];
  
  // Name (25 points)
  if (profile.name && isValidJournalistName(profile.name)) {
    score += 25;
  } else {
    issues.push('Invalid or missing name');
  }
  
  // Articles (30 points)
  if (profile.articles >= 5) {
    score += 30;
  } else if (profile.articles >= 3) {
    score += 20;
    issues.push('Low article count');
  } else if (profile.articles > 0) {
    score += 10;
    issues.push('Very low article count');
  } else {
    issues.push('No articles');
  }
  
  // Bio (20 points)
  if (profile.bio && profile.bio.length >= 100) {
    const hasGeneric = /(read all|latest news|breaking news|exclusive news)/i.test(profile.bio);
    if (!hasGeneric) {
      score += 20;
    } else {
      score += 5;
      issues.push('Generic bio');
    }
  } else if (profile.bio && profile.bio.length >= 50) {
    score += 10;
    issues.push('Short bio');
  } else {
    issues.push('No bio or too short');
  }
  
  // Topics (15 points)
  if (profile.topics && profile.topics.length >= 2) {
    score += 15;
  } else if (profile.topics && profile.topics.length === 1) {
    score += 7;
    issues.push('Only 1 topic');
  } else {
    issues.push('No topics');
  }
  
  // Section (10 points)
  if (profile.section && profile.section !== 'General') {
    score += 10;
  } else {
    score += 3;
    issues.push('Generic section');
  }
  
  return {
    score,
    issues,
    isHighQuality: score >= 70,
    isAcceptable: score >= 50,
    shouldDelete: score < 50
  };
}

export default {
  isValidJournalistName,
  isValidProfileURL,
  validateAuthor,
  calculateProfileQuality,
  INVALID_NAMES
};