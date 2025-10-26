// routes/topics.ts
import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();
const Author = mongoose.model('Author', new mongoose.Schema({
  name: String,
  outlet: String,
  topics: [String],
}));

// GET /topics
router.get('/', async (req, res) => {
  try {
    // Aggregate to get all unique topics + journalist count
    const topics = await Author.aggregate([
      { $unwind: "$topics" },
      { $group: { _id: "$topics", journalistCount: { $sum: 1 } } },
      { $sort: { journalistCount: -1 } },
    ]);

    // Rename fields for frontend
    const formatted = topics.map((t) => ({
      name: t._id,
      journalists: t.journalistCount,
    }));

    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
