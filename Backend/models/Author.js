import mongoose from "mongoose";

const ArticleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  link: { type: String, required: true },
});

const AuthorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  outlet: { type: String, required: true },
  profileLink: { type: String, required: true, unique: true },
  profilePic: { type: String },
  topics: { type: [String], default: [] },
  articles: { type: [ArticleSchema], default: [] },
  articleCount: { type: Number, default: 0 },
  scrapedAt: { type: Date, default: Date.now },
});

const Author = mongoose.model("Author", AuthorSchema);

export default Author;
