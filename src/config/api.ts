// API Configuration
const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost';

export const API_CONFIG = {
  // Use local backend in development, production backend in production
  BASE_URL: isDevelopment
    ? 'http://localhost:5002'  // Local backend
    : 'https://aten-131r.onrender.com',  // Production backend

  // Fallback URLs (try production first, then local)
  FALLBACK_URLS: [
    'https://aten-131r.onrender.com',
    'http://localhost:5002'
  ],

  TIMEOUT: 60000, // 60 seconds
};

// API Endpoints
export const API_ENDPOINTS = {
  DETECT_OUTLET: '/detect-outlet',
  SCRAPE_AUTHORS: '/scrape-authors',
  SCRAPE_AUTHORS_QUICK: '/api/authors/scrape-authors-quick',
  DISCOVER_AND_SCRAPE: '/api/authors/discover-and-scrape',
  JOB_STATUS: '/api/authors/job-status',
  SCRAPE_STATUS: '/scrape-status',
  AUTHORS: '/authors',
  AUTHOR_PROFILES: '/api/authors/profiles',
  PROFILES: '/api/authors/profiles',
  PROFILE_BY_ID: '/api/authors/profile',
  TOPICS: '/topics',
  OUTLETS: '/outlets',
  ACTIVITIES: '/activities',
  TOP_JOURNALISTS: '/top-journalists',
  EXPORT_CSV: '/export/csv',
  EXPORT_JSON: '/export/json',
  ENRICH_ALL_PROFILES: '/enrich-all-profiles',
};

// Helper function to get full URL
export const getApiUrl = (endpoint: string): string => {
  return `${API_CONFIG.BASE_URL}${endpoint}`;
};

// Helper function to get fallback URLs
export const getFallbackUrls = (endpoint: string): string[] => {
  return API_CONFIG.FALLBACK_URLS.map(baseUrl => `${baseUrl}${endpoint}`);
};

export default API_CONFIG;
