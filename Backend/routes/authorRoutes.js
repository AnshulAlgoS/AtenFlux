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
    const { outlet, maxAuthors = 10 } = req.body;

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

    console.log(`\nStarting job ${jobId} for: ${outlet}`);

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
        // STEP 1: Fetch existing data from DB
        jobs.set(jobId, { ...jobs.get(jobId), progress: 5, message: 'Checking existing data in database...' });
        
        const normalizedOutlet = outlet.toLowerCase().trim();
        const existingProfiles = await AuthorProfile.find({ 
          outlet: normalizedOutlet 
        }).sort({ articles: -1, scrapedAt: -1 });
        
        console.log(`\n Found ${existingProfiles.length} existing profiles in DB for "${outlet}"`);
        
        // STEP 2: Scrape new data
        jobs.set(jobId, { 
          ...jobs.get(jobId), 
          progress: 10, 
          message: 'Detecting website...',
          existingInDb: existingProfiles.length 
        });
        
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
        console.log(`\nDEBUG: Scraper result structure:`);
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
        
        // Reuse normalized outlet name from earlier (already declared above)
        // const normalizedOutlet is already defined at line 54
        
        if (!result.authors || result.authors.length === 0) {
          console.error(`ERROR: No authors data to save! Result structure:`, Object.keys(result));
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
            console.log(`\nSaving author: ${authorData.name}`);
            console.log(`   Topics: ${JSON.stringify(authorData.topics)}`);
            console.log(`   Keywords: ${JSON.stringify(authorData.keywords?.slice(0, 5))}`);
            console.log(`   Influence: ${authorData.influenceScore}`);
            console.log(`   Total Articles: ${authorData.totalArticles}`);
            
            // Ensure articles array exists
            const articlesArray = Array.isArray(authorData.articles) ? authorData.articles : [];
            const articleLinks = articlesArray.map(a => a.url).filter(url => url);
            
            // Use name + outlet as unique identifier (profile URLs may not exist for all authors)
            const uniqueKey = `${authorData.name.toLowerCase()}_${normalizedOutlet}`;
            
            // Normalize social links
            const socialLinksData = {
              twitter: authorData.socialLinks?.twitter || null,
              linkedin: authorData.socialLinks?.linkedin || null,
              facebook: authorData.socialLinks?.facebook || null,
              instagram: authorData.socialLinks?.instagram || null,
              youtube: authorData.socialLinks?.youtube || null,
              email: authorData.email || null  // Also store email in socialLinks for convenience
            };
            
            console.log(`   Role: ${authorData.role}`);
            console.log(`   Email: ${authorData.email || 'Not found'}`);
            console.log(`   Social Links: Twitter(${socialLinksData.twitter ? 'Yes' : 'No'}), LinkedIn(${socialLinksData.linkedin ? 'Yes' : 'No'})`);
            
            const profile = await AuthorProfile.findOneAndUpdate(
              { 
                name: authorData.name,
                outlet: normalizedOutlet
              },
              {
                $set: {
                  name: authorData.name,
                  outlet: normalizedOutlet,
                  profileLink: authorData.profileUrl || null,  // Only verified URLs or null
                  profileLinkVerified: authorData.profileUrlVerified || false,
                  profilePic: authorData.profilePicture || null,
                  bio: authorData.bio || null,
                  role: authorData.role || 'Journalist',
                  email: authorData.email || null,
                  socialLinks: socialLinksData,
                  articles: articlesArray.length,
                  articleLinks: articleLinks,
                  articleData: articlesArray,
                  latestArticle: articlesArray[0] || null,
                  lastActiveAt: authorData.lastActiveAt || (articlesArray[0]?.publishedAt ? new Date(articlesArray[0].publishedAt) : null),
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
              { 
                name: authorData.name,
                outlet: normalizedOutlet
              },
              {
                $set: {
                  name: authorData.name,
                  outlet: normalizedOutlet,
                  profileLink: authorData.profileUrl || null,
                  updatedAt: new Date()
                }
              },
              { upsert: true, new: true }
            );

            savedProfiles.push(profile);
            console.log(`SUCCESS: Saved/Updated: ${authorData.name} (${profile.topics?.length || 0} topics, ${profile.keywords?.length || 0} keywords)`);
          } catch (saveErr) {
            console.error(`ERROR: Error saving ${authorData.name}:`, saveErr.message);
          }
        }

        // STEP 3: Merge old DB data with newly scraped data
        const newProfileIds = new Set(savedProfiles.map(p => p._id.toString()));
        const oldProfilesNotUpdated = existingProfiles.filter(
          p => !newProfileIds.has(p._id.toString())
        );
        
        // Combine: newly scraped + old data that wasn't updated
        const allProfiles = [
          ...savedProfiles.map(p => ({ ...p.toObject(), source: 'newly_scraped', isNew: true })),
          ...oldProfilesNotUpdated.map(p => ({ ...p.toObject(), source: 'existing_db', isNew: false }))
        ];
        
        console.log(`\n📊 COMBINED RESULTS:`);
        console.log(`   - Newly scraped: ${savedProfiles.length}`);
        console.log(`   - Existing in DB (not updated): ${oldProfilesNotUpdated.length}`);
        console.log(`   - Total profiles: ${allProfiles.length}`);
        
        // Mark job as completed with BOTH old + new data
        jobs.set(jobId, {
          ...jobs.get(jobId),
          status: 'completed',
          progress: 100,
          message: 'Completed successfully!',
          authorsFound: result.authorsCount,
          authorsSaved: savedProfiles.length,
          existingInDb: existingProfiles.length,
          totalProfiles: allProfiles.length,
          website: result.website,
          authors: result.authors, // Raw scraped data
          profiles: allProfiles,    // Combined DB profiles (old + new)
          breakdown: {
            newlyScraped: savedProfiles.length,
            existingNotUpdated: oldProfilesNotUpdated.length,
            total: allProfiles.length
          },
          completedTime: new Date()
        });

        console.log(`\nSUCCESS: Job ${jobId} completed: ${savedProfiles.length} new profiles saved, ${allProfiles.length} total profiles returned\n`);

        // Clean up job after 10 minutes
        setTimeout(() => {
          jobs.delete(jobId);
        }, 10 * 60 * 1000);

      } catch (error) {
        console.error(`ERROR: Error in job ${jobId}:`, error);
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
    console.error("ERROR: Error starting job:", error);
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
    
    const query = outlet ? { outlet: outlet.toLowerCase().trim() } : {};
    
    // If limit is explicitly provided, use it; otherwise return ALL profiles
    const limitValue = limit ? parseInt(limit) : 0; // 0 means no limit in MongoDB
    
    const profiles = await AuthorProfile.find(query)
      .sort({ articles: -1, scrapedAt: -1 })
      .limit(limitValue);

    // Add metadata about data freshness
    const now = new Date();
    const profilesWithMeta = profiles.map(p => ({
      ...p.toObject(),
      dataAge: p.scrapedAt ? Math.floor((now - p.scrapedAt) / (1000 * 60 * 60 * 24)) : null, // days
      isFresh: p.scrapedAt && (now - p.scrapedAt) < (7 * 24 * 60 * 60 * 1000) // within 7 days
    }));

    res.json({
      success: true,
      count: profiles.length,
      outlet: outlet || 'all',
      profiles: profilesWithMeta,
      stats: {
        total: profiles.length,
        fresh: profilesWithMeta.filter(p => p.isFresh).length,
        stale: profilesWithMeta.filter(p => !p.isFresh).length
      }
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
