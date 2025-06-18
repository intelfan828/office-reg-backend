const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  type: { type: String, enum: ['IN', 'OUT'], required: true },
  department: { type: String, required: true },
  sender: { type: String, required: true },
  recipient: { type: String, required: true },
  description: String,
  attachments: [String], // Array of file paths
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Document', documentSchema);
