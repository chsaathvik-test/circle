const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
});

const SECRET = process.env.JWT_SECRET || 'circle_secret';
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

let sharp = null;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('sharp not available, skipping server-side image resizing');
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) return cb(new Error('Only image uploads are allowed'));
    cb(null, true);
  },
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(uploadDir));

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Circle backend is running', version: '0.1.0' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime_seconds: process.uptime(), timestamp: new Date().toISOString() });
});

const userSockets = new Map();

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing token' });
  jwt.verify(token, SECRET, (err, payload) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.userId = payload.id;
    next();
  });
}

function sendNotification(userId, type, sourceId, text) {
  db.run(
    `INSERT INTO Notifications (user_id, type, source_id, text) VALUES (?, ?, ?, ?)`,
    [userId, type, sourceId, text],
    function () {
      const socketId = userSockets.get(userId);
      if (socketId) {
        io.to(socketId).emit('notification', {
          id: this.lastID,
          user_id: userId,
          type,
          source_id: sourceId,
          text,
          read: 0,
          created_at: new Date().toISOString(),
        });
      }
    }
  );
}

function getFriendIds(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT friend_id FROM Friends WHERE user_id = ?`,
      [userId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows.map((row) => row.friend_id));
      }
    );
  });
}

app.post('/auth/signup', async (req, res) => {
  const { username, display_name, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  const hashed = await bcrypt.hash(password, 10);
  const displayName = display_name?.trim() || username.trim();
  db.run(
    `INSERT INTO Users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?)`,
    [username.trim(), email.trim().toLowerCase(), hashed, displayName],
    function (err) {
      if (err) return res.status(400).json({ error: 'User exists or invalid' });
      const token = jwt.sign({ id: this.lastID }, SECRET, { expiresIn: '30d' });
      res.json({ token });
    }
  );
});

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
  db.get(`SELECT * FROM Users WHERE email = ?`, [email.trim().toLowerCase()], async (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: '30d' });
    res.json({ token });
  });
});

app.get('/me', authMiddleware, (req, res) => {
  db.get(
    `SELECT id, username, display_name, email, bio, avatar, background_image, theme_color, created_at FROM Users WHERE id = ?`,
    [req.userId],
    (err, user) => {
      if (err || !user) return res.status(404).json({ error: 'User not found' });
      if (!user.display_name?.trim()) user.display_name = user.username;
      res.json(user);
    }
  );
});

app.put('/me', authMiddleware, upload.fields([{ name: 'avatar' }, { name: 'background' }]), async (req, res) => {
  const { username, display_name, bio, theme_color } = req.body;
  const updates = [];
  const params = [];
  if (username) {
    updates.push('username = ?');
    params.push(username.trim());
  }
  if (display_name !== undefined) {
    const trimmed = display_name.trim();
    if (trimmed) {
      updates.push('display_name = ?');
      params.push(trimmed);
    }
  }
  if (bio !== undefined) {
    updates.push('bio = ?');
    params.push(bio);
  }
  if (theme_color !== undefined) {
    const t = (theme_color || '').trim();
    if (t) {
      updates.push('theme_color = ?');
      params.push(t);
    }
  }
  // support clearing background via body param background_remove=true
  if (req.body && (req.body.background_remove === '1' || req.body.background_remove === 'true' || req.body.background_remove === true)) {
    updates.push('background_image = ?');
    params.push('');
  }
  try {
    if (req.files) {
      if (req.files.avatar && req.files.avatar[0]) {
        const file = req.files.avatar[0];
        if (sharp) {
          const outName = `avatar-${Date.now()}.jpg`;
          const outPath = path.join(uploadDir, outName);
          await sharp(file.path).resize(512, 512, { fit: 'cover' }).jpeg({ quality: 80 }).toFile(outPath);
          fs.unlinkSync(file.path);
          const avatarPath = `/uploads/${outName}`;
          updates.push('avatar = ?');
          params.push(avatarPath);
        } else {
          const avatarPath = `/uploads/${path.basename(file.path)}`;
          updates.push('avatar = ?');
          params.push(avatarPath);
        }
      }
      if (req.files.background && req.files.background[0]) {
        const file = req.files.background[0];
        if (sharp) {
          const outName = `background-${Date.now()}.jpg`;
          const outPath = path.join(uploadDir, outName);
          await sharp(file.path).resize({ width: 1920, height: null, fit: 'inside' }).jpeg({ quality: 80 }).toFile(outPath);
          fs.unlinkSync(file.path);
          const bgPath = `/uploads/${outName}`;
          updates.push('background_image = ?');
          params.push(bgPath);
        } else {
          const bgPath = `/uploads/${path.basename(file.path)}`;
          updates.push('background_image = ?');
          params.push(bgPath);
        }
      }
    }
  } catch (err) {
    console.error('image processing failed', err);
    return res.status(500).json({ error: 'Image processing failed' });
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.userId);
  db.run(`UPDATE Users SET ${updates.join(', ')} WHERE id = ?`, params, function (err) {
    if (err) return res.status(500).json({ error: 'Profile update failed' });
    db.get(`SELECT id, username, display_name, email, bio, avatar, background_image, theme_color, created_at FROM Users WHERE id = ?`, [req.userId], (err2, user) => {
      if (err2 || !user) return res.status(500).json({ error: 'Unable to load user' });
      res.json(user);
    });
  });
});

app.post('/friends/request', authMiddleware, (req, res) => {
  const { receiverId, receiverUsername } = req.body;
  const createRequest = (resolvedId) => {
    if (!resolvedId || resolvedId === req.userId) return res.status(400).json({ error: 'Invalid receiver' });
    db.run(
      `INSERT INTO FriendRequests (requester_id, receiver_id) VALUES (?, ?)`,
      [req.userId, resolvedId],
      function (err) {
        if (err) return res.status(400).json({ error: 'Already requested or invalid user' });
        sendNotification(resolvedId, 'friend_request', this.lastID, 'You have a new friend request');
        res.json({ id: this.lastID, requester_id: req.userId, receiver_id: resolvedId, status: 'pending' });
      }
    );
  };

  if (receiverId) {
    createRequest(receiverId);
    return;
  }

  if (!receiverUsername) return res.status(400).json({ error: 'Invalid receiver' });
  db.get(`SELECT id FROM Users WHERE username = ? OR display_name = ?`, [receiverUsername.trim(), receiverUsername.trim()], (err, user) => {
    if (err) return res.status(500).json({ error: 'Unable to resolve user' });
    if (!user) return res.status(404).json({ error: 'User not found' });
    createRequest(user.id);
  });
});

app.post('/friends/requests/:id/decline', authMiddleware, (req, res) => {
  const requestId = Number(req.params.id);
  db.get(`SELECT * FROM FriendRequests WHERE id = ? AND receiver_id = ?`, [requestId, req.userId], (err, request) => {
    if (err || !request) return res.status(404).json({ error: 'Request not found' });
    db.run(`UPDATE FriendRequests SET status = 'declined' WHERE id = ?`, [requestId], function (err2) {
      if (err2) return res.status(500).json({ error: 'Unable to decline' });
      sendNotification(request.requester_id, 'friend_declined', requestId, 'Your friend request was declined');
      res.json({ success: true });
    });
  });
});

app.get('/friends/requests', authMiddleware, (req, res) => {
  db.all(
    `SELECT fr.id, fr.requester_id, fr.receiver_id, fr.status, fr.created_at, u.username, u.display_name, u.avatar FROM FriendRequests fr JOIN Users u ON u.id = fr.requester_id WHERE fr.receiver_id = ? AND fr.status = 'pending' ORDER BY fr.created_at DESC`,
    [req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Unable to load requests' });
      res.json(rows);
    }
  );
});

app.post('/friends/requests/:id/accept', authMiddleware, (req, res) => {
  const requestId = Number(req.params.id);
  db.get(`SELECT * FROM FriendRequests WHERE id = ? AND receiver_id = ?`, [requestId, req.userId], (err, request) => {
    if (err || !request) return res.status(404).json({ error: 'Request not found' });
    db.run(`UPDATE FriendRequests SET status = 'accepted' WHERE id = ?`, [requestId], function (err2) {
      if (err2) return res.status(500).json({ error: 'Unable to accept' });
      db.run(`INSERT OR IGNORE INTO Friends (user_id, friend_id) VALUES (?, ?)`, [req.userId, request.requester_id]);
      db.run(`INSERT OR IGNORE INTO Friends (user_id, friend_id) VALUES (?, ?)`, [request.requester_id, req.userId]);
      sendNotification(request.requester_id, 'friend_accepted', requestId, 'Your friend request was accepted');
      res.json({ success: true });
    });
  });
});

app.get('/friends', authMiddleware, (req, res) => {
  db.all(
    `SELECT u.id, u.username, u.display_name, u.avatar, u.bio FROM Friends f JOIN Users u ON u.id = f.friend_id WHERE f.user_id = ? ORDER BY u.username`,
    [req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Unable to load friends' });
      res.json(rows);
    }
  );
});

app.post('/posts', authMiddleware, upload.single('image'), async (req, res) => {
  const { text } = req.body;
  let imagePath = null;
  if (req.file) {
    imagePath = `/uploads/${path.basename(req.file.path)}`;
  }
  db.run(
    `INSERT INTO Posts (user_id, text, image) VALUES (?, ?, ?)`,
    [req.userId, text || '', imagePath],
    function (err) {
      if (err) return res.status(500).json({ error: 'Unable to create post' });
      getFriendIds(req.userId).then((friends) => {
        friends.forEach((friendId) => {
          sendNotification(friendId, 'post', this.lastID, 'A friend posted something new');
        });
      });
      res.json({ id: this.lastID, user_id: req.userId, text: text || '', image: imagePath, created_at: new Date().toISOString() });
    }
  );
});

app.get('/posts/feed', authMiddleware, (req, res) => {
  db.all(
    `SELECT p.id, p.user_id, p.text, p.image, p.created_at, u.username, u.display_name, u.avatar FROM Posts p JOIN Users u ON u.id = p.user_id WHERE p.user_id IN (SELECT friend_id FROM Friends WHERE user_id = ?) OR p.user_id = ? ORDER BY p.created_at DESC LIMIT 40`,
    [req.userId, req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Unable to load feed' });
      if (!rows.length) return res.json([]);
      const postIds = rows.map((p) => p.id);
      db.all(
        `SELECT post_id, COUNT(*) as count FROM Likes WHERE post_id IN (${postIds.map(() => '?').join(',')}) GROUP BY post_id`,
        postIds,
        (err2, likes) => {
          const likeMap = Object.fromEntries((likes || []).map((like) => [like.post_id, like.count]));
          db.all(
            `SELECT post_id, COUNT(*) as count FROM Comments WHERE post_id IN (${postIds.map(() => '?').join(',')}) GROUP BY post_id`,
            postIds,
            (err3, comments) => {
              const commentMap = Object.fromEntries((comments || []).map((comment) => [comment.post_id, comment.count]));
              db.all(
                `SELECT post_id FROM Likes WHERE user_id = ? AND post_id IN (${postIds.map(() => '?').join(',')})`,
                [req.userId, ...postIds],
                (err4, userLikes) => {
                  const likedSet = new Set((userLikes || []).map((like) => like.post_id));
                  res.json(
                    rows.map((post) => ({
                      ...post,
                      likes: likeMap[post.id] || 0,
                      comments: commentMap[post.id] || 0,
                      liked: likedSet.has(post.id),
                    }))
                  );
                }
              );
            }
          );
        }
      );
    }
  );
});

app.get('/users/:id/profile', authMiddleware, (req, res) => {
  const profileId = Number(req.params.id);
  if (!profileId) return res.status(400).json({ error: 'Invalid user id' });
  db.get(
    `SELECT id, username, display_name, bio, avatar, background_image, theme_color, created_at FROM Users WHERE id = ?`,
    [profileId],
    (err, user) => {
      if (err || !user) return res.status(404).json({ error: 'Profile not found' });
      if (!user.display_name?.trim()) user.display_name = user.username;
      res.json(user);
    }
  );
});

app.get('/users/:id/posts', authMiddleware, (req, res) => {
  const profileId = Number(req.params.id);
  if (!profileId) return res.status(400).json({ error: 'Invalid user id' });
  db.all(
    `SELECT p.id, p.user_id, p.text, p.image, p.created_at, u.username, u.display_name, u.avatar FROM Posts p JOIN Users u ON u.id = p.user_id WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT 40`,
    [profileId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Unable to load posts' });
      res.json(rows || []);
    }
  );
});

app.post('/posts/:id/likes', authMiddleware, (req, res) => {
  const postId = Number(req.params.id);
  db.get(`SELECT user_id FROM Posts WHERE id = ?`, [postId], (err, post) => {
    if (err || !post) return res.status(404).json({ error: 'Post not found' });
    db.run(`INSERT OR IGNORE INTO Likes (post_id, user_id) VALUES (?, ?)`, [postId, req.userId], function (err2) {
      if (err2) return res.status(500).json({ error: 'Unable to like' });
      if (post.user_id !== req.userId) sendNotification(post.user_id, 'like', postId, 'A friend liked your post');
      res.json({ success: true });
    });
  });
});

app.post('/posts/:id/comments', authMiddleware, (req, res) => {
  const postId = Number(req.params.id);
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Comment text required' });
  db.get(`SELECT user_id FROM Posts WHERE id = ?`, [postId], (err, post) => {
    if (err || !post) return res.status(404).json({ error: 'Post not found' });
    db.run(`INSERT INTO Comments (post_id, user_id, text) VALUES (?, ?, ?)`, [postId, req.userId, text], function (err2) {
      if (err2) return res.status(500).json({ error: 'Unable to comment' });
      if (post.user_id !== req.userId) sendNotification(post.user_id, 'comment', postId, 'A friend commented on your post');
      res.json({ id: this.lastID, post_id: postId, user_id: req.userId, text, created_at: new Date().toISOString() });
    });
  });
});

app.get('/posts/:id/comments', authMiddleware, (req, res) => {
  const postId = Number(req.params.id);
  db.all(
    `SELECT c.id, c.text, c.created_at, c.user_id, u.username, u.avatar FROM Comments c JOIN Users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.created_at ASC`,
    [postId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Unable to load comments' });
      res.json(rows);
    }
  );
});

app.get('/conversations', authMiddleware, (req, res) => {
  db.all(
    `SELECT c.id, c.user1_id, c.user2_id, u.id as peer_id, u.username, u.avatar, u.display_name, COUNT(m.id) as message_count, MAX(m.created_at) as last_message_time, SUBSTR(m.text, 1, 60) AS preview_text FROM Conversations c JOIN Messages m ON m.conversation_id = c.id JOIN Users u ON u.id = CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END WHERE c.user1_id = ? OR c.user2_id = ? GROUP BY c.id ORDER BY last_message_time DESC`,
    [req.userId, req.userId, req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Unable to load conversations' });
      res.json(rows || []);
    }
  );
});

app.post('/conversations', authMiddleware, (req, res) => {
  const { friendId } = req.body;
  if (!friendId || friendId === req.userId) return res.status(400).json({ error: 'Invalid friend' });
  db.get(`SELECT 1 FROM Friends WHERE user_id = ? AND friend_id = ?`, [req.userId, friendId], (err, row) => {
    if (err || !row) return res.status(403).json({ error: 'Only friends can start a conversation' });
    const [user1, user2] = req.userId < friendId ? [req.userId, friendId] : [friendId, req.userId];
    db.run(
      `INSERT OR IGNORE INTO Conversations (user1_id, user2_id) VALUES (?, ?)`,
      [user1, user2],
      function (err2) {
        if (err2) return res.status(500).json({ error: 'Unable to create conversation' });
        const conversationId = this.lastID || null;
        if (!conversationId) {
          db.get(`SELECT id FROM Conversations WHERE user1_id = ? AND user2_id = ?`, [user1, user2], (err3, conv) => {
            if (err3 || !conv) return res.status(500).json({ error: 'Unable to retrieve conversation' });
            res.json({ id: conv.id });
          });
        } else {
          res.json({ id: conversationId });
        }
      }
    );
  });
});

app.get('/conversations/:id/messages', authMiddleware, (req, res) => {
  const convId = Number(req.params.id);
  db.get(`SELECT * FROM Conversations WHERE id = ?`, [convId], (err, conv) => {
    if (err || !conv) return res.status(404).json({ error: 'Conversation not found' });
    if (conv.user1_id !== req.userId && conv.user2_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    db.all(
      `SELECT m.id, m.text, m.created_at, m.sender_id, u.username, u.avatar FROM Messages m JOIN Users u ON u.id = m.sender_id WHERE m.conversation_id = ? ORDER BY m.created_at ASC`,
      [convId],
      (err2, rows) => {
        if (err2) return res.status(500).json({ error: 'Unable to load messages' });
        res.json(rows);
      }
    );
  });
});

app.post('/messages', authMiddleware, upload.single('image'), async (req, res) => {
  const { conversationId, text, recipientId } = req.body;
  if (!text && !req.file) return res.status(400).json({ error: 'Missing message text or image' });
  if (!conversationId && !recipientId) return res.status(400).json({ error: 'Missing recipient or conversation' });
  let imagePath = '';
  if (req.file) {
    try {
      if (sharp) {
        const outName = `message-${Date.now()}.jpg`;
        const outPath = path.join(uploadDir, outName);
        await sharp(req.file.path).resize({ width: 900, height: null, fit: 'inside' }).jpeg({ quality: 80 }).toFile(outPath);
        fs.unlinkSync(req.file.path);
        imagePath = `/uploads/${outName}`;
      } else {
        imagePath = `/uploads/${path.basename(req.file.path)}`;
      }
    } catch (err) {
      console.error('message image processing failed', err);
      return res.status(500).json({ error: 'Unable to process message image' });
    }
  }
  const sendMessage = (convId, senderId, recipientIdValue) => {
    db.run(
      `INSERT INTO Messages (conversation_id, sender_id, text, image) VALUES (?, ?, ?, ?)`,
      [convId, senderId, text || '', imagePath],
      function (err) {
        if (err) return res.status(500).json({ error: 'Unable to save message' });
        const message = { id: this.lastID, conversation_id: convId, sender_id: senderId, text: text || '', image: imagePath, created_at: new Date().toISOString() };
        const recipientSocket = userSockets.get(recipientIdValue);
        if (recipientSocket) io.to(recipientSocket).emit('message', message);
        sendNotification(recipientIdValue, 'message', convId, 'New message from a friend');
        res.json(message);
      }
    );
  };
  if (conversationId) {
    db.get(`SELECT * FROM Conversations WHERE id = ?`, [conversationId], (err, conv) => {
      if (err || !conv) return res.status(404).json({ error: 'Conversation not found' });
      const otherId = conv.user1_id === req.userId ? conv.user2_id : conv.user1_id;
      if (!otherId) return res.status(404).json({ error: 'Invalid conversation' });
      sendMessage(conversationId, req.userId, otherId);
    });
  } else {
    const friendId = Number(recipientId);
    db.get(`SELECT 1 FROM Friends WHERE user_id = ? AND friend_id = ?`, [req.userId, friendId], (err, row) => {
      if (err || !row) return res.status(403).json({ error: 'Only friends can message' });
      const [user1, user2] = req.userId < friendId ? [req.userId, friendId] : [friendId, req.userId];
      db.run(`INSERT OR IGNORE INTO Conversations (user1_id, user2_id) VALUES (?, ?)`, [user1, user2], function (err2) {
        if (err2) return res.status(500).json({ error: 'Unable to create conversation' });
        db.get(`SELECT id FROM Conversations WHERE user1_id = ? AND user2_id = ?`, [user1, user2], (err3, existing) => {
          if (err3 || !existing) return res.status(500).json({ error: 'Unable to retrieve conversation' });
          sendMessage(existing.id, req.userId, friendId);
        });
      });
    });
  }
});

app.post('/groups', authMiddleware, (req, res) => {
  const { name, memberIds = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  if (!Array.isArray(memberIds) || memberIds.length < 2) return res.status(400).json({ error: 'A group requires at least two friends' });
  db.run(`INSERT INTO Groups (name, admin_id) VALUES (?, ?)`, [name, req.userId], function (err) {
    if (err) return res.status(500).json({ error: 'Unable to create group' });
    const groupId = this.lastID;
    const members = Array.from(new Set([req.userId, ...memberIds]));
    const stmt = db.prepare(`INSERT OR IGNORE INTO GroupMembers (group_id, user_id) VALUES (?, ?)`);
    members.forEach((userId) => stmt.run(groupId, userId));
    stmt.finalize(() => {
      members.forEach((memberId) => {
        if (memberId !== req.userId) sendNotification(memberId, 'group_invite', groupId, `You were added to group ${name}`);
      });
      res.json({ id: groupId, name, admin_id: req.userId, members });
    });
  });
});

app.get('/groups', authMiddleware, (req, res) => {
  db.all(
    `SELECT g.id, g.name, g.admin_id, u.username as admin_name FROM Groups g JOIN Users u ON u.id = g.admin_id JOIN GroupMembers gm ON gm.group_id = g.id WHERE gm.user_id = ? ORDER BY g.created_at DESC`,
    [req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Unable to load groups' });
      res.json(rows);
    }
  );
});

app.get('/groups/:id', authMiddleware, (req, res) => {
  const groupId = Number(req.params.id);
  db.get(`SELECT * FROM Groups WHERE id = ?`, [groupId], (err, group) => {
    if (err || !group) return res.status(404).json({ error: 'Group not found' });
    db.get(`SELECT 1 FROM GroupMembers WHERE group_id = ? AND user_id = ?`, [groupId, req.userId], (err2, membership) => {
      if (err2 || !membership) return res.status(403).json({ error: 'Forbidden' });
      db.all(
        `SELECT u.id, u.username, u.avatar FROM GroupMembers gm JOIN Users u ON u.id = gm.user_id WHERE gm.group_id = ? ORDER BY u.username`,
        [groupId],
        (err3, members) => {
          if (err3) return res.status(500).json({ error: 'Unable to load members' });
          res.json({ ...group, members });
        }
      );
    });
  });
});

app.post('/groups/:id/invite', authMiddleware, (req, res) => {
  const groupId = Number(req.params.id);
  const { memberId } = req.body;
  if (!memberId) return res.status(400).json({ error: 'MemberId required' });
  db.get(`SELECT * FROM Groups WHERE id = ?`, [groupId], (err, group) => {
    if (err || !group) return res.status(404).json({ error: 'Group not found' });
    if (group.admin_id !== req.userId) return res.status(403).json({ error: 'Only admin can invite' });
    db.run(`INSERT OR IGNORE INTO GroupMembers (group_id, user_id) VALUES (?, ?)`, [groupId, memberId], function (err2) {
      if (err2) return res.status(500).json({ error: 'Unable to invite member' });
      sendNotification(memberId, 'group_invite', groupId, `You were invited to group ${group.name}`);
      res.json({ success: true });
    });
  });
});

app.post('/groups/:id/remove', authMiddleware, (req, res) => {
  const groupId = Number(req.params.id);
  const { memberId } = req.body;
  if (!memberId) return res.status(400).json({ error: 'MemberId required' });
  db.get(`SELECT * FROM Groups WHERE id = ?`, [groupId], (err, group) => {
    if (err || !group) return res.status(404).json({ error: 'Group not found' });
    if (group.admin_id !== req.userId) return res.status(403).json({ error: 'Only admin can remove' });
    db.run(`DELETE FROM GroupMembers WHERE group_id = ? AND user_id = ?`, [groupId, memberId], function (err2) {
      if (err2) return res.status(500).json({ error: 'Unable to remove member' });
      res.json({ success: true });
    });
  });
});

app.get('/groups/:id/messages', authMiddleware, (req, res) => {
  const groupId = Number(req.params.id);
  db.get(`SELECT 1 FROM GroupMembers WHERE group_id = ? AND user_id = ?`, [groupId, req.userId], (err, membership) => {
    if (err || !membership) return res.status(403).json({ error: 'Forbidden' });
    db.all(
      `SELECT gm.id, gm.text, gm.created_at, gm.sender_id, u.username, u.avatar FROM GroupMessages gm JOIN Users u ON u.id = gm.sender_id WHERE gm.group_id = ? ORDER BY gm.created_at ASC`,
      [groupId],
      (err2, rows) => {
        if (err2) return res.status(500).json({ error: 'Unable to load group messages' });
        res.json(rows);
      }
    );
  });
});

app.post('/groups/:id/messages', authMiddleware, (req, res) => {
  const groupId = Number(req.params.id);
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Message text required' });
  db.get(`SELECT * FROM GroupMembers WHERE group_id = ? AND user_id = ?`, [groupId, req.userId], (err, membership) => {
    if (err || !membership) return res.status(403).json({ error: 'Forbidden' });
    db.run(`INSERT INTO GroupMessages (group_id, sender_id, text) VALUES (?, ?, ?)`, [groupId, req.userId, text], function (err2) {
      if (err2) return res.status(500).json({ error: 'Unable to send group message' });
      db.all(`SELECT user_id FROM GroupMembers WHERE group_id = ?`, [groupId], (err3, members) => {
        const message = { id: this.lastID, group_id: groupId, sender_id: req.userId, text, created_at: new Date().toISOString() };
        members.forEach((member) => {
          const socketId = userSockets.get(member.user_id);
          if (socketId) io.to(socketId).emit('group_message', { ...message, group_id: groupId });
          if (member.user_id !== req.userId) sendNotification(member.user_id, 'group_message', groupId, 'New message in group chat');
        });
        res.json(message);
      });
    });
  });
});

app.get('/notifications', authMiddleware, (req, res) => {
  db.all(
    `SELECT id, type, source_id, text, read, created_at FROM Notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    [req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Unable to load notifications' });
      res.json(rows);
    }
  );
});

app.post('/notifications/:id/read', authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  db.run(`UPDATE Notifications SET read = 1 WHERE id = ? AND user_id = ?`, [id, req.userId], function (err) {
    if (err) return res.status(500).json({ error: 'Unable to mark read' });
    res.json({ success: true });
  });
});

app.get('/users/me/friends', authMiddleware, (req, res) => {
  db.all(`SELECT u.id, u.username, u.display_name FROM Users u JOIN Friends f ON u.id = f.friend_id WHERE f.user_id = ?`, [req.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Unable to load friend options' });
    res.json(rows);
  });
});

// Multer / upload error handling
app.use((err, req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large' });
  if (err.message && err.message.includes('Only image uploads')) return res.status(400).json({ error: err.message });
  next(err);
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication error'));
  jwt.verify(token, SECRET, (err, payload) => {
    if (err) return next(new Error('Authentication error'));
    socket.userId = payload.id;
    next();
  });
});

io.on('connection', (socket) => {
  userSockets.set(socket.userId, socket.id);
  socket.on('disconnect', () => {
    userSockets.delete(socket.userId);
  });
  socket.on('send_message', ({ conversationId, recipientId, text }) => {
    if (!text) return;
    const sendMessage = (convId, recipient) => {
      db.run(`INSERT INTO Messages (conversation_id, sender_id, text) VALUES (?, ?, ?)`, [convId, socket.userId, text], function (err) {
        if (err) return;
        const message = { id: this.lastID, conversation_id: convId, sender_id: socket.userId, text, created_at: new Date().toISOString() };
        const recipientSocketId = userSockets.get(recipient);
        socket.emit('message', message);
        if (recipientSocketId) io.to(recipientSocketId).emit('message', message);
        sendNotification(recipient, 'message', convId, 'New message from a friend');
      });
    };
    if (conversationId) {
      db.get(`SELECT * FROM Conversations WHERE id = ?`, [conversationId], (err, conv) => {
        if (conv && (conv.user1_id === socket.userId || conv.user2_id === socket.userId)) {
          const recipient = conv.user1_id === socket.userId ? conv.user2_id : conv.user1_id;
          sendMessage(conversationId, recipient);
        }
      });
    } else if (recipientId) {
      const friendId = recipientId;
      const [user1, user2] = socket.userId < friendId ? [socket.userId, friendId] : [friendId, socket.userId];
      db.run(`INSERT OR IGNORE INTO Conversations (user1_id, user2_id) VALUES (?, ?)`, [user1, user2], function () {
        const convId = this.lastID;
        if (convId && convId > 0) {
          sendMessage(convId, friendId);
        } else {
          db.get(`SELECT id FROM Conversations WHERE user1_id = ? AND user2_id = ?`, [user1, user2], (err2, existing) => {
            if (existing) sendMessage(existing.id, friendId);
          });
        }
      });
    }
  });

  socket.on('send_group_message', ({ groupId, text }) => {
    if (!text) return;
    db.get(`SELECT 1 FROM GroupMembers WHERE group_id = ? AND user_id = ?`, [groupId, socket.userId], (err, membership) => {
      if (err || !membership) return;
      db.run(`INSERT INTO GroupMessages (group_id, sender_id, text) VALUES (?, ?, ?)`, [groupId, socket.userId, text], function (err2) {
        if (err2) return;
        const msg = { id: this.lastID, group_id: groupId, sender_id: socket.userId, text, created_at: new Date().toISOString() };
        db.all(`SELECT user_id FROM GroupMembers WHERE group_id = ?`, [groupId], (err3, members) => {
          members.forEach((member) => {
            const socketId = userSockets.get(member.user_id);
            if (socketId) io.to(socketId).emit('group_message', msg);
            if (member.user_id !== socket.userId) sendNotification(member.user_id, 'group_message', groupId, 'New group message');
          });
        });
      });
    });
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Circle server running on http://localhost:${PORT}`);
});
