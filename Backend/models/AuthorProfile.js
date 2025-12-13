import mongoose from "mongoose";

const ArticleSchema = new mongoose.Schema({
  title: String,
  url: String,
  scrapedAt: Date,
  publishedAt: Date
}, { _id: false });

const SocialLinksSchema = new mongoose.Schema({
  twitter: String,
  linkedin: String,
  facebook: String,
  instagram: String,
  youtube: String,
  email: String
}, { _id: false });

const AuthorProfileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  outlet: { type: String, required: true },
  profileLink: { type: String, default: null },  // Now optional (can be null if not verified)
  profileLinkVerified: { type: Boolean, default: false },  // Track if profile URL is verified
  profilePic: String,
  bio: String,
  role: { type: String, default: 'Journalist' },  // NEW: Role (Editor-in-Chief, Senior Correspondent, etc.)
  email: { type: String, default: null },  // NEW: Direct email field
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
  
  // Activity tracking
  lastActiveAt: { type: Date, default: null },
  
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
AuthorProfileSchema.index({ role: 1 }); // NEW: For filtering by role
AuthorProfileSchema.index({ lastActiveAt: -1 });

const AuthorProfile = mongoose.models.AuthorProfile || mongoose.model("AuthorProfile", AuthorProfileSchema);

export default AuthorProfile;
