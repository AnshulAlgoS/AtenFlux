# AtenFlux – Real-Time Journalist Dashboard

**AtenFlux** is a dark-themed interactive dashboard that maps and analyzes journalists across media outlets in real-time. It provides insights into coverage trends, top contributors, and topic distribution, enabling transparency and informed research.

---

## 🚀 Live Demo
[View AtenFlux Demo](#)

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

<div style="background-color:#1f1f2e; padding: 15px; border-radius: 8px;">

**Frontend**  
- React + TypeScript  
- Vite (fast bundler & dev server)  
- Tailwind CSS + shadcn-ui  
- D3.js / Cytoscape.js (network visualizations)

**Backend**  
- Node.js + Express  
- Puppeteer + Puppeteer Extra (headless scraping)  
- Axios (HTTP requests & SERP API)  
- Async jobs for parallel scraping & enrichment

**Database**  
- MongoDB for raw profiles, enriched data, topics, historical runs  
- Indexed for fast filtering/search

**APIs & Services**  
- SERP API for author page discovery  
- Ethical scraping: only publicly available data, no LLMs or paid journalism APIs

</div>

---

## 💻 Running Locally

```bash
git clone <https://github.com/AnshulAlgoS/AtenFlux>
cd <AtenFlux>
npm install
npm run dev
