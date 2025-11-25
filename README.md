# AtenFlux – Real-Time Journalist Dashboard

**AtenFlux** is a dark-themed interactive dashboard that maps and analyzes journalists across media outlets in real-time. It provides insights into coverage trends, top contributors, and topic distribution, enabling transparency and informed research.

---

## 🚀 Live Demo
[View AtenFlux Demo](https://aten.vercel.app)

---

## ✨ Features

<div style="background-color:#1f1f2e; padding: 15px; border-radius: 8px;">

### 🎯 **Dashboard Features**

**Interactive Network Graph**

- Nodes = journalists, size = influence, color = topic
- Real-time updates with dynamic profile loading
- Top contributors highlighted with pulsing glow effects

**Hover Info Cards**

- Name, outlet, publication topics, article count
- Bio, role, and profile links

**Advanced Filters & Panels**

- Filter by topic, outlet, or activity
- Live activity feed for the most active journalists

**Modern Dark Theme**

- Neon accents for nodes
- Smooth animations, responsive design

### 🚀 **Autonomous Scraper Features**

**✅ Zero Configuration Required**

- No hardcoded URLs or outlet mappings
- Fully autonomous website detection
- Works for ANY news outlet (Indian or global)

**🌍 Universal Language Support**

- All 10+ Indian languages: Hindi, Tamil, Telugu, Malayalam, Kannada, Bengali, Marathi, Gujarati,
  Punjabi, Odia
- Automatic byline detection in all scripts
- Multi-language keyword extraction

**🇮🇳 Indian Outlet Prioritization**

- Aggressively prefers `.in` and `.co.in` domains
- Intelligent scoring: Indian domains get 100,000+ priority boost
- Foreign outlets automatically penalized (even with same name)

**📊 Advanced Topic Detection**

- 16 comprehensive topic categories
- URL + title + content analysis
- Identifies author's specific publication beats
- Topic scoring system for accuracy

**⚡ High-Speed Processing**

- Parallel article processing (5 concurrent requests)
- Batch author extraction
- Smart caching and deduplication
- Typical scrape: 30-50 authors in 2-3 minutes

**🎯 Intelligent Validation**

- Filters out agency bylines (PTI, IANS, Reuters)
- Removes generic terms in all languages
- Validates name structure per language
- Prevents outlet names being used as authors

</div>

---

## 🛠️ Tech Stack

**Frontend**  
[![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)  
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)  
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)  
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)  
[![D3.js](https://img.shields.io/badge/D3.js-F9A03C?style=for-the-badge&logo=d3.js&logoColor=white)](https://d3js.org/)  

**Backend**  
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)  
[![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)  
[![Puppeteer](https://img.shields.io/badge/Puppeteer-FF0000?style=for-the-badge&logo=puppeteer&logoColor=white)](https://pptr.dev/)  
[![Axios](https://img.shields.io/badge/Axios-5A29E4?style=for-the-badge&logo=axios&logoColor=white)](https://axios-http.com/)

**Database**  
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)  

**APIs & Services**  
[![SERP API](https://img.shields.io/badge/SERP_API-FFCD00?style=for-the-badge)](https://serpapi.com/)  


---

## 💻 Running Locally

```bash
git clone <https://github.com/AnshulAlgoS/AtenFlux>
cd <AtenFlux>
npm install
npm run dev

---

## 🔌 API Endpoints

- `POST /api/authors/discover-and-scrape` – start a scrape job for an outlet
- `GET /api/authors/job-status/:jobId` – poll job progress and results
- `GET /api/authors/profiles?outlet=<name>&limit=100` – list saved profiles
- `GET /top-journalists` – top influencers for the dashboard

---

## 🧠 How It Works

### 🔍 **Intelligent Website Detection** (DuckDuckGo Only - No Guessing!)
1. **Multi-query DuckDuckGo search** - Up to 4 targeted queries per outlet
2. **Aggressive Indian outlet prioritization**:
   - `.in` / `.co.in` domains: +100,000 priority
   - "India" in domain: +200,000 bonus
   - Indian keywords in domain: +50,000 each
   - Foreign TLDs (`.uk`, `.us`, etc.): -1,000,000 (disqualified)
   - Known foreign outlets: -500,000 penalty
3. **No fallback guessing** - Only returns verified search results
4. **Top 3 candidates shown** with priority scores for transparency

### 📰 **Article Collection** (500+ articles)
- RSS/Atom feed discovery
- Sitemap parsing
- Homepage and section crawling
- Search engine fallback

### 👥 **Universal Author Extraction** (ALL Indian Languages)
- **JSON-LD structured data** (highest reliability)
- **Meta tags** (article:author, og:author, etc.)
- **Author links** (25+ selector patterns)
- **Byline text extraction** with language-specific cleaning:
  - English, Hindi, Tamil, Telugu, Malayalam, Kannada, Bengali, Marathi, Gujarati, Punjabi, Odia
- **Parallel processing** (5 concurrent requests for speed)

### 📊 **Comprehensive Topic Detection**
- **16 topic categories**: Politics, Business, Technology, Sports, Entertainment, Health, Environment, Education, Crime, International, Lifestyle, Social Issues, Science, Real Estate, Automobile, Opinion
- **Multi-source analysis**:
  - URL path keywords (3 points per match)
  - Article title keywords (1 point per match)
  - NLP analysis of content
- **Scoring system** to identify author's primary publication topics

### 💾 **Data Processing**
1. Validate names and deduplicate
2. Extract bio, role, and social links from profile pages
3. Enrich with keywords and publication topics
4. Calculate influence score
5. Save/upsert to MongoDB

---

## ⚙️ Environment Setup (Backend/.env)

```env
PORT=5002
MONGO_URI=<your-mongodb-uri>
SERP_API_KEY=<your-serpapi-key>
```

- Get SERP API key at https://serpapi.com/
- Keep credentials private; do not commit `.env`

---

## 🧪 Testing & Debugging

### Quick API Test

```bash
# Start a scrape job
curl -X POST http://localhost:5002/api/authors/discover-and-scrape \
  -H 'Content-Type: application/json' \
  -d '{"outlet":"The Hindu","maxAuthors":30}'

# Check job status (replace <jobId> with actual job ID from above)
curl http://localhost:5002/api/authors/job-status/<jobId>

# Get saved profiles
curl 'http://localhost:5002/api/authors/profiles?outlet=the%20hindu&limit=100'
```

### Direct Scraper Test (with verbose logs)

```bash
cd Backend
node test-scraper.js "The Hindu" 10
```

### Common Issues & Solutions

**❌ "No authors found"**

- Website might use JavaScript rendering → Check if articles load without JS
- Bylines might use generic terms (e.g., "Staff Reporter") → These are filtered out
- Website might block non-browser requests → Try different outlet

**⚠️ "Slow scraping"**

- This is normal! Processing 300+ articles takes 2-3 minutes
- Scraper uses parallel requests (5 concurrent)
- Progress logs appear every 10 articles

**🌍 "Foreign outlet returned instead of Indian"**

- Scraper aggressively prioritizes `.in` domains (+100,000 priority)
- If outlet has both .com and .in versions, .in is always preferred
- Check logs for priority scores

### Monitoring Production (Render.com)

Logs are available in Render dashboard. Look for:

```
📊 Progress: X/300 articles → Y unique authors found
```

If logs stop, check:

1. Memory limit (1GB on free tier)
2. Timeout (30s request limit on free tier)
3. Cold starts (first request takes longer)

---

## 🛠️ Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind, D3
- Backend: Node.js, Express, Puppeteer, Axios
- Database: MongoDB
- External: SERP API
