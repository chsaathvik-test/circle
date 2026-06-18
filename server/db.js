const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');
const dbPath = path.join(__dirname, 'data.sqlite');
const dbExists = fs.existsSync(dbPath);
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`PRAGMA foreign_keys = ON`);

  db.run(`CREATE TABLE IF NOT EXISTS Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    background_image TEXT DEFAULT '',
    theme_color TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.all(`PRAGMA table_info(Users)`, [], (err, cols) => {
    if (!err && !cols.some((col) => col.name === 'display_name')) {
      db.run(`ALTER TABLE Users ADD COLUMN display_name TEXT DEFAULT ''`);
    }
  });
  db.all(`PRAGMA table_info(Users)`, [], (err, cols) => {
    if (!err && !cols.some((col) => col.name === 'background_image')) {
      db.run(`ALTER TABLE Users ADD COLUMN background_image TEXT DEFAULT ''`);
    }
    if (!err && !cols.some((col) => col.name === 'theme_color')) {
      db.run(`ALTER TABLE Users ADD COLUMN theme_color TEXT DEFAULT ''`);
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS FriendRequests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(requester_id, receiver_id),
    FOREIGN KEY(requester_id) REFERENCES Users(id),
    FOREIGN KEY(receiver_id) REFERENCES Users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS Friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    friend_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, friend_id),
    FOREIGN KEY(user_id) REFERENCES Users(id),
    FOREIGN KEY(friend_id) REFERENCES Users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS Posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    text TEXT,
    image TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES Users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS Comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(post_id) REFERENCES Posts(id),
    FOREIGN KEY(user_id) REFERENCES Users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS Likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_id),
    FOREIGN KEY(post_id) REFERENCES Posts(id),
    FOREIGN KEY(user_id) REFERENCES Users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS Conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user1_id INTEGER NOT NULL,
    user2_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user1_id, user2_id),
    FOREIGN KEY(user1_id) REFERENCES Users(id),
    FOREIGN KEY(user2_id) REFERENCES Users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS Messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    text TEXT,
    image TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(conversation_id) REFERENCES Conversations(id),
    FOREIGN KEY(sender_id) REFERENCES Users(id)
  )`);
  db.all(`PRAGMA table_info(Messages)`, [], (err, cols) => {
    if (!err && !cols.some((col) => col.name === 'image')) {
      db.run(`ALTER TABLE Messages ADD COLUMN image TEXT DEFAULT ''`);
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS Groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    admin_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(admin_id) REFERENCES Users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS GroupMembers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, user_id),
    FOREIGN KEY(group_id) REFERENCES Groups(id),
    FOREIGN KEY(user_id) REFERENCES Users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS GroupMessages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    text TEXT,
    image TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(group_id) REFERENCES Groups(id),
    FOREIGN KEY(sender_id) REFERENCES Users(id)
  )`);
  db.all(`PRAGMA table_info(GroupMessages)`, [], (err, cols) => {
    if (!err && !cols.some((col) => col.name === 'image')) {
      db.run(`ALTER TABLE GroupMessages ADD COLUMN image TEXT DEFAULT ''`);
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS Notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    source_id INTEGER,
    text TEXT,
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES Users(id)
  )`);
});

module.exports = db;
