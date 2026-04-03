require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

const authRoutes = require('./routes/auth');
const User = require('./models/User');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);

// Get chat history between two users
app.get('/api/messages/:uniqueId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ error: 'Invalid token' });

    const otherUniqueId = req.params.uniqueId;
    const messages = await Message.find({
      $or: [
        { sender: user.uniqueId, receiver: otherUniqueId },
        { sender: otherUniqueId, receiver: user.uniqueId }
      ]
    }).sort({ createdAt: 1 }).limit(200);

    // Mark messages as read
    await Message.updateMany(
      { sender: otherUniqueId, receiver: user.uniqueId, read: false },
      { read: true }
    );

    res.json({ messages });
  } catch (error) {
    console.error('Messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get conversation list for current user
app.get('/api/conversations', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ error: 'Invalid token' });

    // Find all unique conversation partners
    const sentMessages = await Message.distinct('receiver', { sender: user.uniqueId });
    const receivedMessages = await Message.distinct('sender', { receiver: user.uniqueId });
    const partnerIds = [...new Set([...sentMessages, ...receivedMessages])];

    const conversations = [];
    for (const partnerId of partnerIds) {
      const partner = await User.findOne({ uniqueId: partnerId });
      if (!partner) continue;

      // Get last message
      const lastMessage = await Message.findOne({
        $or: [
          { sender: user.uniqueId, receiver: partnerId },
          { sender: partnerId, receiver: user.uniqueId }
        ]
      }).sort({ createdAt: -1 });

      // Get unread count
      const unreadCount = await Message.countDocuments({
        sender: partnerId,
        receiver: user.uniqueId,
        read: false
      });

      conversations.push({
        user: partner.toSafeObject(),
        lastMessage: lastMessage ? {
          content: lastMessage.content,
          createdAt: lastMessage.createdAt,
          isMine: lastMessage.sender === user.uniqueId
        } : null,
        unreadCount
      });
    }

    // Sort by last message time
    conversations.sort((a, b) => {
      if (!a.lastMessage) return 1;
      if (!b.lastMessage) return -1;
      return new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt);
    });

    res.json({ conversations });
  } catch (error) {
    console.error('Conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Track online users: uniqueId -> socketId
const onlineUsers = new Map();

// Socket.io authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return next(new Error('User not found'));

    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
});

// Socket.io connection handling
io.on('connection', async (socket) => {
  const user = socket.user;
  console.log(`✅ ${user.username} (${user.uniqueId}) connected`);

  // Mark user online
  onlineUsers.set(user.uniqueId, socket.id);
  await User.findByIdAndUpdate(user._id, { isOnline: true });
  io.emit('user-status', { uniqueId: user.uniqueId, isOnline: true });

  // Join personal room
  socket.join(user.uniqueId);

  // Handle private message
  socket.on('private-message', async (data) => {
    try {
      const { receiverId, content } = data;
      if (!content || !content.trim()) return;

      // Save message to database
      const message = new Message({
        sender: user.uniqueId,
        receiver: receiverId,
        content: content.trim()
      });
      await message.save();

      const messageData = {
        _id: message._id,
        sender: user.uniqueId,
        senderName: user.username,
        senderColor: user.avatarColor,
        receiver: receiverId,
        content: message.content,
        createdAt: message.createdAt,
        read: false
      };

      // Send to receiver if online
      socket.to(receiverId).emit('new-message', messageData);
      // Send back to sender for confirmation
      socket.emit('message-sent', messageData);
    } catch (error) {
      console.error('Message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Typing indicator
  socket.on('typing', (data) => {
    socket.to(data.receiverId).emit('user-typing', {
      uniqueId: user.uniqueId,
      username: user.username
    });
  });

  socket.on('stop-typing', (data) => {
    socket.to(data.receiverId).emit('user-stop-typing', {
      uniqueId: user.uniqueId
    });
  });

  // Mark messages as read
  socket.on('mark-read', async (data) => {
    try {
      await Message.updateMany(
        { sender: data.senderId, receiver: user.uniqueId, read: false },
        { read: true }
      );
      socket.to(data.senderId).emit('messages-read', {
        readerId: user.uniqueId
      });
    } catch (error) {
      console.error('Mark read error:', error);
    }
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log(`❌ ${user.username} (${user.uniqueId}) disconnected`);
    onlineUsers.delete(user.uniqueId);
    await User.findByIdAndUpdate(user._id, { isOnline: false, lastSeen: new Date() });
    io.emit('user-status', { uniqueId: user.uniqueId, isOnline: false });
  });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('📦 Connected to MongoDB');
    server.listen(PORT, () => {
      console.log(`🚀 ChatterBox server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('\n💡 Make sure to update your .env file with a valid MongoDB connection string.');
    console.log('   Get a free one at: https://www.mongodb.com/atlas\n');
    process.exit(1);
  });
