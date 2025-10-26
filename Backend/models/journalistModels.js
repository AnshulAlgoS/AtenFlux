const mongoose = require('mongoose');

const ArticleSchema = new mongoose.Schema({
  title: String,
  url: String,
  date: Date,
  section: String
});

const JournalistSchema = new mongoose.Schema({
  name: String,
  beat: String,
  contact: String,
  social: {
    twitter: String,
    linkedin: String,
    other: String
  },
  outlet: String,
  articles: [ArticleSchema]
});

module.exports = mongoose.model('Journalist', JournalistSchema);
