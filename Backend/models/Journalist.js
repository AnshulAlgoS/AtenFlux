import mongoose from 'mongoose';

const JournalistSchema = new mongoose.Schema({
  name: { type: String, required: true },
  outlet: { type: String, required: true },
  topics: { type: [String], default: [] },
  influence: { type: Number, default: 0 },
  color: { type: String, default: '#000000' },
});

export const JournalistModel = mongoose.model('Journalist', JournalistSchema);
