import mongoose from "mongoose";

const ArticleSchema = new mongoose.Schema({
  title: String,
  url: String,
  scrapedAt: Date
}, { _id: false });

const SocialLinksSchema = new mongoose.Schema({
  twitter: String,
  linkedin: String,
  facebook: String,
  instagram: String,
  email: String
}, { _id: false });

const AuthorProfileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  outlet: { type: String, required: true },
  profileLink: { type: String, required: true },
  profilePic: String,
  bio: String,
  section: { type: String, default: 'General' },
  topics: { type: [String], default: [] },
  articles: { type: Number, default: 0 },
  articleLinks: { type: [String], default: [] },
  articleData: { type: [ArticleSchema], default: [] },
  latestArticle: ArticleSchema,
  socialLinks: SocialLinksSchema,
  
  // NLP and analysis fields
  influence: { type: Number, default: 0 }, // Calculated influence score
  keywords: { type: [String], default: [] }, // Extracted keywords from articles
  publicationFrequency: { type: String, enum: ['Very Active', 'Active', 'Moderate', 'Low'], default: 'Low' },
  
  // Accuracy tracking fields (for hackathon demo)
  accuracyScore: { type: Number, default: 0, min: 0, max: 100 }, // Overall accuracy percentage
  accuracyGrade: { type: String, enum: ['A+', 'A', 'B', 'C', 'D', 'F'], default: 'F' }, // Letter grade
  accuracyBreakdown: { // Detailed accuracy breakdown
    type: Object,
    default: {}
  },
  
  scrapedAt: { type: Date, default: Date.now },
}, {
  timestamps: true
});

// Create compound index for faster queries
AuthorProfileSchema.index({ name: 1, outlet: 1 }, { unique: true });
AuthorProfileSchema.index({ outlet: 1 });
AuthorProfileSchema.index({ topics: 1 });
AuthorProfileSchema.index({ influence: -1 }); // For sorting by influence
AuthorProfileSchema.index({ publicationFrequency: 1 });

const AuthorProfile = mongoose.models.AuthorProfile || mongoose.model("AuthorProfile", AuthorProfileSchema);

export default AuthorProfile;
