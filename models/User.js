const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [20, 'Username cannot exceed 20 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  uniqueId: {
    type: String,
    unique: true
  },
  avatarColor: {
    type: String,
    default: '#7c4dff'
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Generate unique ID before saving
userSchema.pre('save', async function(next) {
  // Generate unique ID
  if (!this.uniqueId) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id;
    let exists = true;
    while (exists) {
      id = '#';
      for (let i = 0; i < 8; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      exists = await mongoose.model('User').findOne({ uniqueId: id });
    }
    this.uniqueId = id;
  }

  // Hash password
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }

  // Assign random avatar color
  if (this.isNew) {
    const colors = ['#7c4dff', '#ff6bcb', '#00e5ff', '#69f0ae', '#ffab40', '#ff5252', '#40c4ff', '#e040fb', '#ffd740', '#64ffda'];
    this.avatarColor = colors[Math.floor(Math.random() * colors.length)];
  }

  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Return safe user object (no password)
userSchema.methods.toSafeObject = function() {
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    uniqueId: this.uniqueId,
    avatarColor: this.avatarColor,
    isOnline: this.isOnline,
    lastSeen: this.lastSeen
  };
};

module.exports = mongoose.model('User', userSchema);
