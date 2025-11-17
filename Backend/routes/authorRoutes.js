import express from "express";
import Author from "../models/Author.js";
import AuthorProfile from "../models/AuthorProfile.js";
import { scrapeOutletIntelligent } from "../scrapers/outletAuthorScraper.js";

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
        
        // Call the intelligent scraper
        const result = await scrapeOutletIntelligent(outlet, maxAuthors);

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

        // Save all authors and their profiles to MongoDB
        const savedProfiles = [];
        
        for (const authorData of result.authors) {
          try {
            // Save to AuthorProfile collection
            const profile = await AuthorProfile.findOneAndUpdate(
              { name: authorData.name, outlet: result.outlet },
              {
                $set: {
                  name: authorData.name,
                  outlet: result.outlet,
                  profileLink: authorData.profileUrl,
                  profilePic: authorData.profilePicture,
                  bio: authorData.bio,
                  role: authorData.role,
                  email: authorData.email,
                  socialLinks: authorData.socialLinks,
                  articles: authorData.totalArticles,
                  articleLinks: authorData.articles.map(a => a.url),
                  articleData: authorData.articles,
                  latestArticle: authorData.articles[0] || null,
                  scrapedAt: new Date()
                }
              },
              { upsert: true, new: true }
            );

            // Also save to Author collection for backwards compatibility
            await Author.findOneAndUpdate(
              { name: authorData.name, outlet: result.outlet },
              {
                $set: {
                  name: authorData.name,
                  outlet: result.outlet,
                  profileLink: authorData.profileUrl,
                  updatedAt: new Date()
                }
              },
              { upsert: true, new: true }
            );

            savedProfiles.push(profile);
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
    const { outlet, limit = 100 } = req.query;
    
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

// ============================================================
// LEGACY: Quick author discovery (names only, no profiles)
// ============================================================
router.post("/scrape-authors-quick", async (req, res) => {
  try {
    const { outlet } = req.body;

    if (!outlet) {
      return res.status(400).json({ error: "Outlet name is required" });
    }

    // For quick discovery, just return names and profile URLs
    // Don't scrape full profiles
    const result = await scrapeOutletIntelligent(outlet, 10); // Just 10 for quick

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    const authors = result.authors.map(a => ({
      name: a.name,
      profileLink: a.profileUrl
    }));

    res.json({
      success: true,
      outlet: result.outlet,
      website: result.website,
      authors
    });

  } catch (error) {
    console.error("Error in scrape-authors-quick:", error);
    res.status(500).json({ 
      error: "Failed to scrape authors",
      details: error.message 
    });
  }
});

export default router;