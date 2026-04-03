// ==================== CHAT PAGE LOGIC ====================

const API_URL = '';
let socket = null;
let currentUser = null;
let activeChat = null; // { uniqueId, username, avatarColor }
let conversations = [];
let onlineUsers = new Set();
let typingTimeout = null;

// ==================== AUTH CHECK ====================
(function init() {
  const token = localStorage.getItem('chatterbox_token');
  const userData = localStorage.getItem('chatterbox_user');

  if (!token || !userData) {
    window.location.href = '/';
    return;
  }

  currentUser = JSON.parse(userData);
  setupProfile();
  connectSocket(token);
  loadConversations();
})();

// ==================== PROFILE SETUP ====================
function setupProfile() {
  document.getElementById('userName').textContent = currentUser.username;
  document.getElementById('userUniqueId').textContent = currentUser.uniqueId;
  
  const avatar = document.getElementById('userAvatar');
  avatar.style.background = currentUser.avatarColor;
  document.getElementById('userInitial').textContent = currentUser.username[0].toUpperCase();

  // Copy unique ID on click
  document.getElementById('userUniqueId').addEventListener('click', () => {
    navigator.clipboard.writeText(currentUser.uniqueId).then(() => {
      showToast('Unique ID copied!', 'success');
    });
  });
}

// ==================== SOCKET CONNECTION ====================
function connectSocket(token) {
  socket = io({
    auth: { token }
  });

  socket.on('connect', () => {
    console.log('✅ Connected to ChatterBox');
  });

  socket.on('connect_error', (err) => {
    console.error('Connection error:', err.message);
    if (err.message === 'Authentication required' || err.message === 'Invalid token') {
      localStorage.removeItem('chatterbox_token');
      localStorage.removeItem('chatterbox_user');
      window.location.href = '/';
    }
  });

  // Receive new message
  socket.on('new-message', (msg) => {
    // If this chat is active, display the message
    if (activeChat && msg.sender === activeChat.uniqueId) {
      appendMessage(msg, false);
      scrollToBottom();
      // Mark as read
      socket.emit('mark-read', { senderId: msg.sender });
    } else {
      // Show notification toast
      showToast(`${msg.senderName}: ${msg.content.substring(0, 50)}`, 'info');
    }
    // Refresh conversations list
    loadConversations();
  });

  // Message sent confirmation
  socket.on('message-sent', (msg) => {
    if (activeChat && msg.receiver === activeChat.uniqueId) {
      appendMessage(msg, true);
      scrollToBottom();
    }
    loadConversations();
  });

  // User online/offline status
  socket.on('user-status', (data) => {
    if (data.isOnline) {
      onlineUsers.add(data.uniqueId);
    } else {
      onlineUsers.delete(data.uniqueId);
    }
    updateChatStatus();
    updateConversationStatuses();
  });

  // Typing indicator
  socket.on('user-typing', (data) => {
    if (activeChat && data.uniqueId === activeChat.uniqueId) {
      document.getElementById('typingIndicator').classList.add('visible');
      document.getElementById('chatPartnerStatus').textContent = 'typing...';
      document.getElementById('chatPartnerStatus').classList.add('online');
    }
  });

  socket.on('user-stop-typing', (data) => {
    if (activeChat && data.uniqueId === activeChat.uniqueId) {
      document.getElementById('typingIndicator').classList.remove('visible');
      updateChatStatus();
    }
  });

  // Messages read
  socket.on('messages-read', (data) => {
    // Could update read receipts UI here
  });

  socket.on('error', (data) => {
    showToast(data.message, 'error');
  });
}

// ==================== LOAD CONVERSATIONS ====================
async function loadConversations() {
  try {
    const token = localStorage.getItem('chatterbox_token');
    const res = await fetch(`${API_URL}/api/conversations`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load conversations');
    const data = await res.json();
    conversations = data.conversations;
    renderConversations();
  } catch (error) {
    console.error('Load conversations error:', error);
  }
}

// ==================== RENDER CONVERSATIONS ====================
function renderConversations(filter = '') {
  const list = document.getElementById('conversationsList');
  const empty = document.getElementById('emptyConversations');

  let filtered = conversations;
  if (filter) {
    filtered = conversations.filter(c =>
      c.user.username.toLowerCase().includes(filter.toLowerCase()) ||
      c.user.uniqueId.toLowerCase().includes(filter.toLowerCase())
    );
  }

  if (filtered.length === 0) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = filtered.map(conv => {
    const isActive = activeChat && activeChat.uniqueId === conv.user.uniqueId;
    const isOnline = onlineUsers.has(conv.user.uniqueId);
    const lastMsg = conv.lastMessage
      ? (conv.lastMessage.isMine ? 'You: ' : '') + conv.lastMessage.content.substring(0, 35) + (conv.lastMessage.content.length > 35 ? '...' : '')
      : 'No messages yet';
    const timeStr = conv.lastMessage ? formatTime(conv.lastMessage.createdAt) : '';

    return `
      <div class="conversation-item ${isActive ? 'active' : ''}" onclick="openChat('${conv.user.uniqueId}', '${escapeHtml(conv.user.username)}', '${conv.user.avatarColor}')">
        <div class="avatar" style="background: ${conv.user.avatarColor}">
          <span>${conv.user.username[0].toUpperCase()}</span>
          <div class="status-dot ${isOnline ? '' : 'offline'}"></div>
        </div>
        <div class="conv-details">
          <div class="conv-name">${escapeHtml(conv.user.username)}</div>
          <div class="conv-last-msg">${escapeHtml(lastMsg)}</div>
        </div>
        <div class="conv-meta">
          <span class="conv-time">${timeStr}</span>
          ${conv.unreadCount > 0 ? `<div class="unread-badge">${conv.unreadCount}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ==================== OPEN CHAT ====================
async function openChat(uniqueId, username, avatarColor) {
  activeChat = { uniqueId, username, avatarColor };

  // Update UI
  document.getElementById('chatEmpty').style.display = 'none';
  const activeChatEl = document.getElementById('activeChat');
  activeChatEl.style.display = 'flex';

  // Set chat header
  document.getElementById('chatPartnerName').textContent = username;
  document.getElementById('chatAvatar').style.background = avatarColor;
  document.getElementById('chatAvatarInitial').textContent = username[0].toUpperCase();
  updateChatStatus();

  // Clear messages
  document.getElementById('messagesArea').innerHTML = '';

  // Load chat history
  try {
    const token = localStorage.getItem('chatterbox_token');
    const res = await fetch(`${API_URL}/api/messages/${uniqueId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to load messages');
    const data = await res.json();

    // Render messages
    let lastDate = '';
    data.messages.forEach(msg => {
      const msgDate = new Date(msg.createdAt).toLocaleDateString();
      if (msgDate !== lastDate) {
        appendDateDivider(msgDate);
        lastDate = msgDate;
      }
      const isMine = msg.sender === currentUser.uniqueId;
      appendMessage(msg, isMine);
    });

    scrollToBottom();

    // Mark messages as read
    socket.emit('mark-read', { senderId: uniqueId });
    loadConversations(); // Refresh unread counts

  } catch (error) {
    console.error('Load messages error:', error);
    showToast('Failed to load messages', 'error');
  }

  // Highlight active conversation
  renderConversations();

  // Focus input
  document.getElementById('messageInput').focus();
}

// ==================== SEND MESSAGE ====================
function sendMessage() {
  const input = document.getElementById('messageInput');
  const content = input.value.trim();

  if (!content || !activeChat) return;

  socket.emit('private-message', {
    receiverId: activeChat.uniqueId,
    content: content
  });

  input.value = '';
  socket.emit('stop-typing', { receiverId: activeChat.uniqueId });
}

// ==================== RENDER MESSAGES ====================
function appendMessage(msg, isMine) {
  const area = document.getElementById('messagesArea');
  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${isMine ? 'sent' : 'received'}`;

  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  bubble.innerHTML = `
    <div class="msg-content">${escapeHtml(msg.content)}</div>
    <span class="msg-time">${time}</span>
  `;

  area.appendChild(bubble);
}

function appendDateDivider(dateStr) {
  const area = document.getElementById('messagesArea');
  const divider = document.createElement('div');
  divider.className = 'message-date-divider';

  const today = new Date().toLocaleDateString();
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString();
  let label = dateStr;
  if (dateStr === today) label = 'Today';
  else if (dateStr === yesterday) label = 'Yesterday';

  divider.innerHTML = `<span>${label}</span>`;
  area.appendChild(divider);
}

function scrollToBottom() {
  const area = document.getElementById('messagesArea');
  setTimeout(() => {
    area.scrollTop = area.scrollHeight;
  }, 50);
}

// ==================== UPDATE STATUS ====================
function updateChatStatus() {
  if (!activeChat) return;
  const isOnline = onlineUsers.has(activeChat.uniqueId);
  const statusEl = document.getElementById('chatPartnerStatus');
  const dotEl = document.getElementById('chatStatusDot');

  statusEl.textContent = isOnline ? 'Online' : 'Offline';
  statusEl.className = 'chat-partner-status' + (isOnline ? ' online' : '');
  dotEl.className = 'status-dot' + (isOnline ? '' : ' offline');
}

function updateConversationStatuses() {
  renderConversations(document.getElementById('searchInput').value);
}

// ==================== NEW CHAT MODAL ====================
const newChatBtn = document.getElementById('newChatBtn');
const newChatModal = document.getElementById('newChatModal');
const modalClose = document.getElementById('modalClose');
const searchUniqueId = document.getElementById('searchUniqueId');
const userSearchResult = document.getElementById('userSearchResult');
const modalError = document.getElementById('modalError');
const startChatBtn = document.getElementById('startChatBtn');

let foundUser = null;

newChatBtn.addEventListener('click', () => {
  newChatModal.classList.add('visible');
  searchUniqueId.value = '';
  userSearchResult.classList.remove('visible');
  modalError.classList.remove('visible');
  setTimeout(() => searchUniqueId.focus(), 100);
});

modalClose.addEventListener('click', () => {
  newChatModal.classList.remove('visible');
});

newChatModal.addEventListener('click', (e) => {
  if (e.target === newChatModal) {
    newChatModal.classList.remove('visible');
  }
});

// Search user by unique ID
let searchTimeout;
searchUniqueId.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  let val = searchUniqueId.value.trim().toUpperCase();

  // Auto-add # prefix
  if (val && !val.startsWith('#')) {
    val = '#' + val;
    searchUniqueId.value = val;
  }

  userSearchResult.classList.remove('visible');
  modalError.classList.remove('visible');

  if (val.length < 2) return;

  searchTimeout = setTimeout(async () => {
    if (val === currentUser.uniqueId) {
      modalError.textContent = "That's your own ID! 😄";
      modalError.classList.add('visible');
      return;
    }

    try {
      const token = localStorage.getItem('chatterbox_token');
      const res = await fetch(`${API_URL}/api/auth/user/${val}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        if (res.status === 404) {
          modalError.textContent = 'No user found with this ID';
          modalError.classList.add('visible');
        }
        return;
      }

      const data = await res.json();
      foundUser = data.user;

      // Show user result
      document.getElementById('foundAvatar').style.background = foundUser.avatarColor;
      document.getElementById('foundInitial').textContent = foundUser.username[0].toUpperCase();
      document.getElementById('foundName').textContent = foundUser.username;
      document.getElementById('foundId').textContent = foundUser.uniqueId;
      userSearchResult.classList.add('visible');

    } catch (error) {
      console.error('Search error:', error);
    }
  }, 400);
});

startChatBtn.addEventListener('click', () => {
  if (!foundUser) return;
  newChatModal.classList.remove('visible');
  openChat(foundUser.uniqueId, foundUser.username, foundUser.avatarColor);
});

// ==================== EVENT LISTENERS ====================

// Send message
document.getElementById('sendBtn').addEventListener('click', sendMessage);

document.getElementById('messageInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Typing indicator
document.getElementById('messageInput').addEventListener('input', () => {
  if (!activeChat) return;

  socket.emit('typing', { receiverId: activeChat.uniqueId });

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('stop-typing', { receiverId: activeChat.uniqueId });
  }, 1500);
});

// Search conversations
document.getElementById('searchInput').addEventListener('input', (e) => {
  renderConversations(e.target.value);
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('chatterbox_token');
  localStorage.removeItem('chatterbox_user');
  if (socket) socket.disconnect();
  window.location.href = '/';
});

// Keyboard shortcut: Escape to close modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    newChatModal.classList.remove('visible');
  }
});

// ==================== UTILITIES ====================
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
  if (diff < 86400000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}
