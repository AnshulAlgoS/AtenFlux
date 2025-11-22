# AtenFlux – Real-Time Journalist Dashboard

**AtenFlux** is a dark-themed interactive dashboard that maps and analyzes journalists across media outlets in real-time. It provides insights into coverage trends, top contributors, and topic distribution, enabling transparency and informed research.

---

## 🚀 Live Demo
[View AtenFlux Demo](https://aten.vercel.app)

---

## ✨ Features

<div style="background-color:#1f1f2e; padding: 15px; border-radius: 8px;">

**Interactive Network Graph**  
- Nodes = journalists, size = influence, color = topic  

**Real-Time Updates**  
- New journalist profiles appear dynamically  
- Top contributors highlighted with pulsing glow effects  

**Hover Info Cards**  
- Name, outlet, sections/beats, article count, profile links  

**Advanced Filters & Panels**  
- Filter by topic, outlet, or activity  
- Live activity feed for the most active journalists  

**Modern Dark Theme**  
- Neon accents for nodes  
- Smooth animations, responsive design

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

1. Detect outlet website automatically.
2. Collect ~300 articles across sections and paginated lists.
3. Extract unique authors from collected articles.
4. Validate names and deduplicate.
5. Verify each article belongs to the author via byline/JSON‑LD checks.
6. Enrich topics/keywords and compute influence.
7. Save/upsert to MongoDB; frontend loads combined saved profiles.

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

## 🧪 Quick Test

```bash
curl -X POST http://localhost:5002/api/authors/discover-and-scrape \
  -H 'Content-Type: application/json' \
  -d '{"outlet":"Pink Villa","maxAuthors":30}'

curl http://localhost:5002/api/authors/job-status/<jobId>

curl 'http://localhost:5002/api/authors/profiles?outlet=pink%20villa&limit=100'
```

---

## 🛠️ Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind, D3
- Backend: Node.js, Express, Puppeteer, Axios
- Database: MongoDB
- External: SERP API
