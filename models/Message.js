const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: String,
    required: true,
    ref: 'User'
  },
  receiver: {
    type: String,
    required: true,
    ref: 'User'
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters']
  },
  read: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for fast chat history queries
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, read: 1 });

module.exports = mongoose.model('Message', messageSchema);
