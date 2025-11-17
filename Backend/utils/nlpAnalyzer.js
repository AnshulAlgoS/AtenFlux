import natural from 'natural';

const tokenizer = new natural.WordTokenizer();
const TfIdf = natural.TfIdf;
const tfidf = new TfIdf();

// Common stop words to filter out
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
  'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
  'own', 'same', 'so', 'than', 'too', 'very', 'says', 'said', 'new', 'just'
]);

// Named entities and important keywords categories
const ENTITY_CATEGORIES = {
  POLITICS: ['government', 'parliament', 'minister', 'president', 'prime', 'election', 
             'vote', 'policy', 'law', 'bill', 'senate', 'congress', 'political',
             'democracy', 'opposition', 'ruling', 'campaign'],
  
  BUSINESS: ['economy', 'market', 'stock', 'trade', 'business', 'company', 'corporate',
             'finance', 'investment', 'revenue', 'profit', 'loss', 'shares', 'startup',
             'industry', 'commercial', 'economic', 'financial', 'bank', 'rupee', 'dollar'],
  
  TECHNOLOGY: ['technology', 'tech', 'software', 'hardware', 'ai', 'artificial', 'intelligence',
               'digital', 'online', 'internet', 'cyber', 'computer', 'mobile', 'app',
               'data', 'algorithm', 'innovation', 'smartphone', 'google', 'microsoft', 'apple'],
  
  SPORTS: ['cricket', 'football', 'hockey', 'tennis', 'sports', 'match', 'tournament',
           'championship', 'olympic', 'player', 'team', 'coach', 'win', 'loss', 'score',
           'game', 'league', 'ipl', 'worldcup'],
  
  ENTERTAINMENT: ['film', 'movie', 'actor', 'actress', 'cinema', 'bollywood', 'hollywood',
                  'music', 'song', 'album', 'concert', 'entertainment', 'celebrity',
                  'show', 'series', 'tv', 'streaming', 'netflix', 'star'],
  
  HEALTH: ['health', 'medical', 'hospital', 'doctor', 'patient', 'disease', 'virus',
           'vaccine', 'covid', 'pandemic', 'treatment', 'medicine', 'healthcare',
           'surgery', 'clinic', 'wellness'],
  
  ENVIRONMENT: ['climate', 'environment', 'pollution', 'green', 'carbon', 'emission',
                'renewable', 'energy', 'sustainability', 'conservation', 'wildlife',
                'forest', 'ocean', 'global warming', 'ecology'],
  
  CRIME: ['crime', 'murder', 'theft', 'robbery', 'arrest', 'police', 'investigation',
          'accused', 'victim', 'court', 'judge', 'trial', 'justice', 'criminal',
          'fraud', 'corruption', 'scam'],
  
  INTERNATIONAL: ['international', 'global', 'world', 'foreign', 'diplomatic', 'relations',
                  'united nations', 'country', 'nation', 'border', 'war', 'peace',
                  'treaty', 'ambassador', 'summit', 'alliance'],
  
  EDUCATION: ['education', 'school', 'college', 'university', 'student', 'teacher',
              'exam', 'degree', 'learning', 'academic', 'campus', 'admission', 'study']
};

/**
 * Extract keywords from text using TF-IDF
 */
export function extractKeywords(text, maxKeywords = 10) {
  if (!text || text.trim().length === 0) return [];
  
  // Tokenize and clean
  const tokens = tokenizer.tokenize(text.toLowerCase());
  
  // Filter stop words and short tokens
  const filteredTokens = tokens.filter(token => 
    !STOP_WORDS.has(token) && 
    token.length > 3 &&
    /^[a-z]+$/.test(token)
  );
  
  // Count frequency
  const frequency = {};
  filteredTokens.forEach(token => {
    frequency[token] = (frequency[token] || 0) + 1;
  });
  
  // Sort by frequency
  const keywords = Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word, count]) => ({ word, count }));
  
  return keywords;
}

/**
 * Categorize text into topics using entity matching
 */
export function categorizeTopics(text) {
  if (!text || text.trim().length === 0) return [];
  
  const lowerText = text.toLowerCase();
  const categories = new Set();
  
  for (const [category, keywords] of Object.entries(ENTITY_CATEGORIES)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        categories.add(category);
        break; // Found one match in this category, move to next
      }
    }
  }
  
  return Array.from(categories).map(cat => 
    cat.charAt(0) + cat.slice(1).toLowerCase()
  );
}

/**
 * Extract named entities (simple pattern-based)
 */
export function extractEntities(text) {
  if (!text || text.trim().length === 0) return [];
  
  const entities = [];
  
  // Extract capitalized words/phrases (potential proper nouns)
  const capitalizedRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  let match;
  
  while ((match = capitalizedRegex.exec(text)) !== null) {
    const entity = match[1];
    // Filter out common words that happen to be capitalized
    if (entity.length > 2 && !['The', 'A', 'An', 'In', 'On', 'At'].includes(entity)) {
      entities.push(entity);
    }
  }
  
  return [...new Set(entities)]; // Remove duplicates
}

/**
 * Analyze article titles in bulk using TF-IDF
 */
export function analyzeArticleTitles(titles) {
  if (!titles || titles.length === 0) return { keywords: [], topics: [] };
  
  // Add all titles to TF-IDF
  const localTfidf = new TfIdf();
  titles.forEach(title => localTfidf.addDocument(title));
  
  // Get top terms across all documents
  const termScores = {};
  
  titles.forEach((title, docIndex) => {
    localTfidf.listTerms(docIndex).forEach(item => {
      if (!STOP_WORDS.has(item.term) && item.term.length > 3) {
        termScores[item.term] = (termScores[item.term] || 0) + item.tfidf;
      }
    });
  });
  
  // Sort by TF-IDF score
  const topKeywords = Object.entries(termScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([term, score]) => ({ term, score: parseFloat(score.toFixed(3)) }));
  
  // Categorize all titles to find dominant topics
  const topicCounts = {};
  const allText = titles.join(' ');
  const topics = categorizeTopics(allText);
  
  topics.forEach(topic => {
    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
  });
  
  return {
    keywords: topKeywords,
    topics: Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([topic, count]) => ({ topic, count }))
  };
}

/**
 * Calculate journalist influence based on articles and topics
 */
export function calculateInfluence(journalist) {
  let score = 0;
  
  // Base score from article count
  score += Math.min(journalist.articles || 0, 50) * 2; // Cap at 50 articles
  
  // Bonus for topic diversity
  score += (journalist.topics?.length || 0) * 5;
  
  // Bonus for social media presence
  const socialLinks = journalist.socialLinks || {};
  const socialCount = Object.values(socialLinks).filter(v => v !== null).length;
  score += socialCount * 10;
  
  // Bonus for having bio
  if (journalist.bio && journalist.bio.length > 50) {
    score += 15;
  }
  
  // Bonus for profile picture
  if (journalist.profilePic) {
    score += 10;
  }
  
  return parseFloat(score.toFixed(1));
}

/**
 * Analyze journalist activity patterns
 */
export function analyzeActivity(journalists) {
  const analysis = {
    totalJournalists: journalists.length,
    totalArticles: 0,
    avgArticlesPerJournalist: 0,
    topicDistribution: {},
    outletDistribution: {},
    activityLevels: {
      veryActive: 0,    // 20+ articles
      active: 0,        // 10-19 articles
      moderate: 0,      // 5-9 articles
      lowActivity: 0    // < 5 articles
    }
  };
  
  journalists.forEach(j => {
    const articleCount = j.articles || 0;
    analysis.totalArticles += articleCount;
    
    // Categorize activity level
    if (articleCount >= 20) analysis.activityLevels.veryActive++;
    else if (articleCount >= 10) analysis.activityLevels.active++;
    else if (articleCount >= 5) analysis.activityLevels.moderate++;
    else analysis.activityLevels.lowActivity++;
    
    // Count topics
    (j.topics || []).forEach(topic => {
      analysis.topicDistribution[topic] = (analysis.topicDistribution[topic] || 0) + 1;
    });
    
    // Count outlets
    if (j.outlet) {
      analysis.outletDistribution[j.outlet] = (analysis.outletDistribution[j.outlet] || 0) + 1;
    }
  });
  
  analysis.avgArticlesPerJournalist = journalists.length > 0 
    ? parseFloat((analysis.totalArticles / journalists.length).toFixed(1))
    : 0;
  
  // Sort distributions
  analysis.topicDistribution = Object.entries(analysis.topicDistribution)
    .sort((a, b) => b[1] - a[1])
    .reduce((obj, [topic, count]) => {
      obj[topic] = count;
      return obj;
    }, {});
  
  analysis.outletDistribution = Object.entries(analysis.outletDistribution)
    .sort((a, b) => b[1] - a[1])
    .reduce((obj, [outlet, count]) => {
      obj[outlet] = count;
      return obj;
    }, {});
  
  return analysis;
}

export default {
  extractKeywords,
  categorizeTopics,
  extractEntities,
  analyzeArticleTitles,
  calculateInfluence,
  analyzeActivity
};
