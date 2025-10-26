import mongoose from "mongoose";

const AuthorProfileSchema = new mongoose.Schema({
  name: String,
  outlet: String,
  profileLink: String,
  profilePic: String,
  topics: [String],
  articles: Number,
  articleLinks: [String],
  scrapedAt: { type: Date, default: Date.now },
});

const AuthorProfile = mongoose.models.AuthorProfile || mongoose.model("AuthorProfile", AuthorProfileSchema);

export default AuthorProfile;
