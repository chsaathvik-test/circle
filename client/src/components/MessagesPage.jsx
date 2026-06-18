import { useEffect, useMemo, useState } from 'react';

export default function MessagesPage({ api, headers, socket, user, onViewProfile }) {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [friends, setFriends] = useState([]);
  const [search, setSearch] = useState('');
  const [friendSearch, setFriendSearch] = useState('');
  const [error, setError] = useState('');

  const loadConversations = () => fetch(`${api}/conversations`, { headers }).then((res) => res.json()).then(setConversations);
  const loadFriends = () => fetch(`${api}/users/me/friends`, { headers }).then((res) => res.json()).then(setFriends);

  useEffect(() => {
    loadConversations();
    loadFriends();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('message', (message) => {
      if (selected && message.conversation_id === selected.id) {
        setMessages((prev) => [...prev, message]);
      }
      loadConversations();
    });
    return () => socket.off('message');
  }, [socket, selected]);

  const openConversation = async (conv) => {
    setSelected(conv);
    const res = await fetch(`${api}/conversations/${conv.id}/messages`, { headers });
    const data = await res.json();
    setMessages(data);
  };

  const getMediaUrl = useMemo(
    () => (value) => {
      if (!value) return '';
      if (value.startsWith('http') || value.startsWith('data:')) return value;
      return `${api}${value}`;
    },
    [api]
  );

  const createConversation = async (targetFriendId) => {
    const friendIdValue = targetFriendId ?? friendId;
    if (!friendIdValue) {
      setError('Select a friend to open chat.');
      return;
    }
    setError('');
    const res = await fetch(`${api}/conversations`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendId: Number(friendIdValue) }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Unable to create conversation');
      return;
    }
    loadConversations();
    const friend = friends.find((f) => f.id === Number(friendIdValue));
    const conv = {
      id: data.id,
      peer_id: Number(friendIdValue),
      username: friend?.username || 'Friend',
      display_name: friend?.display_name || friend?.username || 'Friend',
      avatar: friend?.avatar || null,
    };
    openConversation(conv);
  };

  const filteredFriends = useMemo(
    () => friends.filter((friend) => {
      const label = `${friend.display_name || friend.username}`.toLowerCase();
      return !friendSearch || label.includes(friendSearch.toLowerCase());
    }),
    [friends, friendSearch]
  );

  const filteredConversations = useMemo(
    () => conversations.filter((conv) => {
      const label = `${conv.display_name || conv.username}`.toLowerCase();
      return !search || label.includes(search.toLowerCase()) || (conv.preview_text || '').toLowerCase().includes(search.toLowerCase());
    }),
    [conversations, search]
  );

  const sendMessage = async () => {
    if (!text.trim() || !selected) return;
    const res = await fetch(`${api}/messages`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: selected.id, text, recipientId: selected.peer_id }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setText('');
    setMessages((prev) => [...prev, data]);
    loadConversations();
  };

  return (
    <div className="messages-shell">
      <aside className="messages-sidebar card">
        <div className="messages-sidebar-header">
          <div>
            <h2>Chats</h2>
            <p className="muted">Quick access to your closest circles</p>
          </div>
        </div>

        <div className="messages-search">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats" />
        </div>

        <div className="messages-list">
          {filteredConversations.length ? (
            filteredConversations.map((conv) => (
              <button
                key={conv.id}
                type="button"
                className={`chat-item ${selected?.id === conv.id ? 'active' : ''}`}
                onClick={() => openConversation(conv)}
              >
                <img className="avatar" src={getMediaUrl(conv.avatar)} alt="peer avatar" />
                <div>
                  <strong>{conv.display_name || conv.username}</strong>
                  <p>{conv.preview_text || 'Say hi to someone new.'}</p>
                </div>
              </button>
            ))
          ) : (
            <p className="muted">No recent chats. Start a new conversation below.</p>
          )}
        </div>

        <div className="new-chat-card">
          <h3>Start a new chat</h3>
          <input
            value={friendSearch}
            onChange={(e) => setFriendSearch(e.target.value)}
            placeholder="Search friend"
          />
          <div className="friend-picker">
            {filteredFriends.slice(0, 6).map((friend) => (
              <button
                key={friend.id}
                type="button"
                className="friend-chip"
                onClick={() => createConversation(friend.id)}
              >
                {friend.display_name || friend.username}
              </button>
            ))}
          </div>
          {error && <p className="error-text">{error}</p>}
        </div>
      </aside>

      <section className="messages-panel card">
        {selected ? (
          <>
            <div className="chat-header">
              <button type="button" className="chat-profile" style={{ border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => onViewProfile(selected.peer_id)}>
                <img className="avatar avatar-lg" src={getMediaUrl(selected.avatar)} alt="peer avatar" />
                <div>
                  <strong>{selected.display_name || selected.username}</strong>
                  <p className="muted">Private chat • {selected.message_count || 0} messages</p>
                </div>
              </button>
            </div>

            <div className="chat-thread">
              {messages.map((message) => {
                const isMine = message.sender_id === user.id;
                return (
                  <div key={message.id} className={`message-row ${isMine ? 'mine' : 'theirs'}`}>
                    <div className={`message-bubble ${isMine ? 'mine' : 'theirs'}`}>
                      {message.image && (
                        <img className="message-image" src={getMediaUrl(message.image)} alt="message attachment" />
                      )}
                      {message.text && <p>{message.text}</p>}
                      <span className="message-meta">{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="chat-composer">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write something memorable..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <div className="composer-actions">
                <button className="primary" onClick={sendMessage}>Send message</button>
              </div>
            </div>
          </>
        ) : (
          <div className="conversation-empty">
            <h2>Choose a chat to continue</h2>
            <p className="muted">Pick a conversation from the left or start a new chat with a friend.</p>
          </div>
        )}
      </section>
    </div>
  );
}
