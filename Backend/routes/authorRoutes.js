import express from "express";
import Author from "../models/Author.js";
import AuthorProfile from "../models/AuthorProfile.js";
import { scrapeLightweight } from "../scrapers/newsOutletScraper.js";

const router = express.Router();

// Job tracking
const jobs = new Map();

// ============================================================
// NEW: Discover authors and fetch their complete profiles (JOB-BASED)
// ============================================================
router.post("/discover-and-scrape", async (req, res) => {
  try {
    const { outlet, maxAuthors = 30 } = req.body;

    if (!outlet) {
      return res.status(400).json({ error: "Outlet name is required" });
    }

    // Create job ID
    const jobId = `${outlet.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    
    // Initialize job status
    jobs.set(jobId, {
      status: 'started',
      outlet,
      maxAuthors,
      progress: 0,
      message: 'Starting scraper...',
      authorsFound: 0,
      authorsSaved: 0,
      startTime: new Date(),
    });

    console.log(`\n🚀 Starting job ${jobId} for: ${outlet}`);

    // Return immediately with job ID
    res.json({
      success: true,
      jobId,
      message: 'Scraping started. Use the job ID to check progress.',
      statusEndpoint: `/api/authors/job-status/${jobId}`
    });

    // Start scraping in background (don't await)
    (async () => {
      try {
        jobs.set(jobId, { ...jobs.get(jobId), progress: 10, message: 'Detecting website...' });
        
        // Call the lightweight scraper (no Puppeteer)
        const result = await scrapeLightweight(outlet, maxAuthors);

        if (result.error) {
          jobs.set(jobId, {
            ...jobs.get(jobId),
            status: 'failed',
            error: result.error,
            progress: 0,
            message: `Failed: ${result.error}`
          });
          return;
        }

        jobs.set(jobId, { 
          ...jobs.get(jobId), 
          progress: 80, 
          message: 'Saving to database...',
          authorsFound: result.authorsCount 
        });

        // DEBUG: Log what we received
        console.log(`\n🔍 DEBUG: Scraper result structure:`);
        console.log(`   - result.authorsCount: ${result.authorsCount}`);
        console.log(`   - result.authors exists: ${!!result.authors}`);
        console.log(`   - result.authors length: ${result.authors?.length}`);
        if (result.authors && result.authors.length > 0) {
          console.log(`   - First author sample:`, {
            name: result.authors[0].name,
            outlet: result.authors[0].outlet,
            totalArticles: result.authors[0].totalArticles,
            topics: result.authors[0].topics?.length,
            hasArticlesArray: !!result.authors[0].articles
          });
        }

        // Save all authors and their profiles to MongoDB
        const savedProfiles = [];
        
        // Normalize outlet name for consistency (lowercase, trimmed)
        const normalizedOutlet = result.outlet.toLowerCase().trim();
        
        if (!result.authors || result.authors.length === 0) {
          console.error(`❌ No authors data to save! Result structure:`, Object.keys(result));
          jobs.set(jobId, {
            ...jobs.get(jobId),
            status: 'completed',
            progress: 100,
            message: 'Scraping completed but no authors were saved',
            authorsFound: result.authorsCount || 0,
            authorsSaved: 0,
            error: 'No author data returned from scraper'
          });
          return;
        }
        
        for (const authorData of result.authors) {
          try {
            // DEBUG: Log what we're about to save
            console.log(`\n💾 Saving author: ${authorData.name}`);
            console.log(`   Topics: ${JSON.stringify(authorData.topics)}`);
            console.log(`   Keywords: ${JSON.stringify(authorData.keywords?.slice(0, 5))}`);
            console.log(`   Influence: ${authorData.influenceScore}`);
            console.log(`   Total Articles: ${authorData.totalArticles}`);
            
            // Ensure articles array exists
            const articlesArray = Array.isArray(authorData.articles) ? authorData.articles : [];
            const articleLinks = articlesArray.map(a => a.url).filter(url => url);
            
            // Use profileLink as the unique identifier (it has unique index)
            const profile = await AuthorProfile.findOneAndUpdate(
              { profileLink: authorData.profileUrl },
              {
                $set: {
                  name: authorData.name,
                  outlet: normalizedOutlet, // Use normalized outlet name
                  profileLink: authorData.profileUrl,
                  profilePic: authorData.profilePicture || null,
                  bio: authorData.bio || null,
                  role: authorData.role || 'Journalist',
                  email: authorData.email || null,
                  socialLinks: authorData.socialLinks || {},
                  articles: articlesArray.length,
                  articleLinks: articleLinks,
                  articleData: articlesArray,
                  latestArticle: articlesArray[0] || null,
                  topics: Array.isArray(authorData.topics) ? authorData.topics : [],
                  keywords: Array.isArray(authorData.keywords) ? authorData.keywords : [],
                  topKeywords: Array.isArray(authorData.topKeywords) ? authorData.topKeywords : [],
                  influence: authorData.influenceScore || 0,
                  scrapedAt: new Date()
                }
              },
              { upsert: true, new: true }
            );

            // Also save to Author collection for backwards compatibility
            await Author.findOneAndUpdate(
              { profileLink: authorData.profileUrl },
              {
                $set: {
                  name: authorData.name,
                  outlet: normalizedOutlet, // Use normalized outlet name
                  profileLink: authorData.profileUrl,
                  updatedAt: new Date()
                }
              },
              { upsert: true, new: true }
            );

            savedProfiles.push(profile);
            console.log(`✅ Saved/Updated: ${authorData.name} (${profile.topics?.length || 0} topics, ${profile.keywords?.length || 0} keywords)`);
          } catch (saveErr) {
            console.error(`❌ Error saving ${authorData.name}:`, saveErr.message);
          }
        }

        // Mark job as completed
        jobs.set(jobId, {
          ...jobs.get(jobId),
          status: 'completed',
          progress: 100,
          message: 'Completed successfully!',
          authorsFound: result.authorsCount,
          authorsSaved: savedProfiles.length,
          website: result.website,
          authors: result.authors,
          completedTime: new Date()
        });

        console.log(`\n✅ Job ${jobId} completed: ${savedProfiles.length} profiles saved\n`);

        // Clean up job after 10 minutes
        setTimeout(() => {
          jobs.delete(jobId);
        }, 10 * 60 * 1000);

      } catch (error) {
        console.error(`❌ Error in job ${jobId}:`, error);
        jobs.set(jobId, {
          ...jobs.get(jobId),
          status: 'failed',
          error: error.message,
          progress: 0,
          message: `Failed: ${error.message}`
        });
      }
    })();

  } catch (error) {
    console.error("❌ Error starting job:", error);
    res.status(500).json({ 
      error: "Failed to start scraping job",
      details: error.message 
    });
  }
});

// REMOVED: scrape-specific endpoint - use discover-and-scrape with specific author name filter instead

// ============================================================
// Check job status
// ============================================================
router.get("/job-status/:jobId", (req, res) => {
  const { jobId } = req.params;
  
  const job = jobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({ 
      error: "Job not found or expired",
      message: "Job IDs expire after 10 minutes of completion"
    });
  }
  
  res.json(job);
});

// ============================================================
// Get all author profiles from database
// ============================================================
router.get("/profiles", async (req, res) => {
  try {
    const { outlet, limit } = req.query;
    
    const query = outlet ? { outlet } : {};
    
    const profiles = await AuthorProfile.find(query)
      .sort({ articles: -1, scrapedAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: profiles.length,
      profiles
    });
  } catch (error) {
    console.error("Error fetching profiles:", error);
    res.status(500).json({ 
      error: "Failed to fetch profiles",
      details: error.message 
    });
  }
});

// ============================================================
// Get single author profile
// ============================================================
router.get("/profile/:id", async (req, res) => {
  try {
    const profile = await AuthorProfile.findById(req.params.id);
    
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ 
      error: "Failed to fetch profile",
      details: error.message 
    });
  }
});
router.get("/search-by-name", async (req, res) => {
  try {
    const { name } = req.query;

    if (!name) {
      return res.status(400).json({ error: "Name required" });
    }

    const profile = await AuthorProfile.findOne({
      name: { $regex: new RegExp("^" + name.trim() + "$", "i") }
    });

    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ error: "Failed", details: err.message });
  }
});

// REMOVED: scrape-authors-quick - use main discover-and-scrape endpoint

export default router;