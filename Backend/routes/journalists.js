import express from "express";
import Author from "../models/Author.js"; // the Author.js we created
// import { scrapeAuthorData } from "../scrapers/enrichAuthors.js"; // optional, for scraping later

const router = express.Router();

// ---------------- GET all authors ----------------
router.get("/", async (req, res) => {
  try {
    const authors = await Author.find().sort({ articleCount: -1 });
    res.json(authors);
  } catch (err) {
    console.error("Error fetching authors:", err);
    res.status(500).json({ error: "Failed to fetch authors" });
  }
});

// ---------------- GET single author ----------------
router.get("/:id", async (req, res) => {
  try {
    const author = await Author.findById(req.params.id);
    if (!author) return res.status(404).json({ error: "Author not found" });
    res.json(author);
  } catch (err) {
    console.error("Error fetching author:", err);
    res.status(500).json({ error: "Failed to fetch author" });
  }
});

// ---------------- POST scrape & enrich author ----------------
// This endpoint can trigger your scraping/enrichment logic
// router.post("/scrape", async (req, res) => {
//   const { profileLink } = req.body;
//   try {
//     const enrichedData = await scrapeAuthorData(profileLink);
//     const author = await Author.findOneAndUpdate(
//       { profileLink },
//       { $set: enrichedData },
//       { upsert: true, new: true }
//     );
//     res.json(author);
//   } catch (err) {
//     console.error("Error enriching author:", err);
//     res.status(500).json({ error: "Failed to enrich author" });
//   }
// });

export default router;
