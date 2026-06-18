import { useEffect, useMemo, useState } from 'react';

export default function GroupsPage({ api, headers, socket, user }) {
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [inviteId, setInviteId] = useState('');
  const [error, setError] = useState('');

  const loadGroups = () => fetch(`${api}/groups`, { headers }).then((res) => res.json()).then(setGroups);
  const loadFriends = () => fetch(`${api}/users/me/friends`, { headers }).then((res) => res.json()).then(setFriends);

  useEffect(() => {
    loadGroups();
    loadFriends();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('group_message', (message) => {
      if (selected && message.group_id === selected.id) {
        setMessages((prev) => [...prev, message]);
      }
      loadGroups();
    });
    return () => socket.off('group_message');
  }, [socket, selected]);

  const getMediaUrl = useMemo(
    () => (value) => {
      if (!value) return '';
      if (value.startsWith('http') || value.startsWith('data:')) return value;
      return `${api}${value}`;
    },
    [api]
  );

  const openGroup = async (group) => {
    setSelected(group);
    const res = await fetch(`${api}/groups/${group.id}/messages`, { headers });
    const data = await res.json();
    setMessages(data);
  };

  const createGroup = async () => {
    if (!name.trim()) {
      setError('Group name is required.');
      return;
    }
    if (selectedMembers.length < 2) {
      setError('Pick at least two friends for a group.');
      return;
    }
    setError('');
    const res = await fetch(`${api}/groups`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, memberIds: selectedMembers }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Unable to create group');
      return;
    }
    setName('');
    setSelectedMembers([]);
    loadGroups();
    if (data.id) {
      openGroup({ id: data.id, name: data.name, members: [] });
    }
  };

  const sendGroupMessage = async () => {
    if (!selected || !text.trim()) return;
    const res = await fetch(`${api}/groups/${selected.id}/messages`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setText('');
    setMessages((prev) => [...prev, data]);
  };

  const inviteMember = async () => {
    if (!selected || !inviteId) return;
    const res = await fetch(`${api}/groups/${selected.id}/invite`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: Number(inviteId) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Unable to invite member');
      return;
    }
    setInviteId('');
    const refresh = await fetch(`${api}/groups/${selected.id}`, { headers });
    if (refresh.ok) {
      const data = await refresh.json();
      setSelected(data);
    }
  };

  const eligibleFriends = useMemo(
    () => friends.filter((friend) => {
      const label = `${friend.display_name || friend.username}`.toLowerCase();
      return !memberSearch || label.includes(memberSearch.toLowerCase());
    }),
    [friends, memberSearch]
  );

  return (
    <div className="groups-shell">
      <aside className="groups-sidebar card">
        <div className="groups-sidebar-header">
          <div>
            <h2>Groups</h2>
            <p className="muted">Premium circles for private chatting.</p>
          </div>
        </div>

        <div className="groups-search">
          <input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Find friends" />
        </div>

        <div className="groups-list">
          {groups.length ? (
            groups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`group-item ${selected?.id === group.id ? 'active' : ''}`}
                onClick={() => openGroup(group)}
              >
                <div>
                  <strong>{group.name}</strong>
                  <p>{group.admin_name ? `Hosted by ${group.admin_name}` : 'Group circle'}</p>
                </div>
              </button>
            ))
          ) : (
            <p className="muted">No groups yet. Create one to chat with friends.</p>
          )}
        </div>

        <div className="new-group-card">
          <h3>Create group</h3>
          <label>
            Group name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name your circle" />
          </label>
          <div className="friend-picker">
            {eligibleFriends.slice(0, 5).map((friend) => (
              <button
                key={friend.id}
                type="button"
                className="friend-chip"
                onClick={() => setSelectedMembers((prev) => prev.includes(friend.id) ? prev : [...prev, friend.id])}
              >
                {friend.display_name || friend.username}
              </button>
            ))}
          </div>
          <div className="group-members">
            {selectedMembers.map((id) => {
              const friend = friends.find((item) => item.id === id);
              return <span key={id} className="member-chip">{friend?.display_name || friend?.username || 'Friend'}</span>;
            })}
          </div>
          <button className="primary" type="button" onClick={createGroup}>Create group</button>
          {error && <p className="error-text">{error}</p>}
        </div>
      </aside>

      <section className="groups-panel card">
        {selected ? (
          <>
            <div className="group-header">
              <div className="group-profile">
                <div className="avatar avatar-lg" />
                <div>
                  <strong>{selected.name}</strong>
                  <p className="muted">Group chat • {selected.members?.length || '...' } members</p>
                </div>
              </div>
            </div>

            <div className="group-members" style={{ marginBottom: 16 }}>
              {(selected.members || []).map((member) => (
                <span key={member.id} className="member-chip">{member.username || member.display_name}</span>
              ))}
            </div>

            <div className="group-thread">
              {messages.map((message) => {
                const isMine = message.sender_id === user.id;
                return (
                  <div key={message.id} className={`group-message-row ${isMine ? 'mine' : 'theirs'}`}>
                    <div className={`group-message-bubble ${isMine ? 'mine' : 'theirs'}`}>
                      <strong>{message.username}</strong>
                      {message.image && (
                        <img className="group-message-image" src={getMediaUrl(message.image)} alt="group attachment" />
                      )}
                      <p>{message.text}</p>
                      <span className="group-message-meta">{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                );
              })}
              {!messages.length && <p className="muted">Select a group and start the conversation.</p>}
            </div>

            <div className="group-composer">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Share an update with the group..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendGroupMessage();
                  }
                }}
              />
              <div className="composer-actions">
                <button className="primary" type="button" onClick={sendGroupMessage}>Send message</button>
              </div>
            </div>

            <div className="new-chat-card" style={{ marginTop: 18 }}>
              <h3>Invite member</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                <select value={inviteId} onChange={(e) => setInviteId(e.target.value)}>
                  <option value="">Select friend</option>
                  {friends.map((friend) => (
                    <option key={friend.id} value={friend.id}>{friend.display_name || friend.username}</option>
                  ))}
                </select>
                <button className="secondary" type="button" onClick={inviteMember}>Invite</button>
              </div>
            </div>
          </>
        ) : (
          <div className="conversation-empty">
            <h2>Pick a group to open</h2>
            <p className="muted">Your groups appear on the left. Create one and invite friends.</p>
          </div>
        )}
      </section>
    </div>
  );
}
