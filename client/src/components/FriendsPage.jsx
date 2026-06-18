import { useEffect, useState } from 'react';

export default function FriendsPage({ api, headers, socket, onViewProfile }) {
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [searchUsername, setSearchUsername] = useState('');
  const [requestError, setRequestError] = useState('');

  const loadFriends = () => fetch(`${api}/friends`, { headers }).then((res) => res.json()).then(setFriends);
  const loadRequests = () => fetch(`${api}/friends/requests`, { headers }).then((res) => res.json()).then(setRequests);

  useEffect(() => {
    loadFriends();
    loadRequests();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('notification', () => {
      loadRequests();
    });
    return () => socket.off('notification');
  }, [socket]);

  const acceptRequest = async (id) => {
    await fetch(`${api}/friends/requests/${id}/accept`, { method: 'POST', headers });
    loadFriends();
    loadRequests();
  };

  const declineRequest = async (id) => {
    await fetch(`${api}/friends/requests/${id}/decline`, { method: 'POST', headers });
    loadRequests();
  };

  const sendRequest = async () => {
    if (!searchUsername.trim()) {
      setRequestError('Enter the exact username.');
      return;
    }
    setRequestError('');
    const res = await fetch(`${api}/friends/request`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiverUsername: searchUsername.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setRequestError(data.error || 'Unable to send request');
      return;
    }
    setSearchUsername('');
    loadRequests();
  };

  return (
    <div className="grid-two">
      <div className="card">
        <h2>Friends</h2>
        {friends.map((friend) => (
          <div key={friend.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <button className="secondary" style={{ padding: 0, border: 'none', background: 'transparent', color: '#f8fafc', textAlign: 'left', cursor: 'pointer' }} onClick={() => onViewProfile(friend.id)}>
              {friend.display_name || friend.username}
            </button>
            <button className="secondary" onClick={() => onViewProfile(friend.id)}>View</button>
          </div>
        ))}
      </div>
      <div className="card">
        <h2>Friend requests</h2>
        {requests.map((request) => (
          <div key={request.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <span>{request.display_name || request.username}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={() => acceptRequest(request.id)}>Accept</button>
              <button className="secondary" onClick={() => declineRequest(request.id)}>Decline</button>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 18 }}>
          <label>
            Invite by username
            <input value={searchUsername} onChange={(e) => setSearchUsername(e.target.value)} placeholder="Exact username" />
          </label>
          <button className="primary" style={{ marginTop: 10 }} onClick={sendRequest}>Send request</button>
          {requestError && <p style={{ color: '#fb7185' }}>{requestError}</p>}
          <p style={{ marginTop: 18 }}>Friends can only be added by direct invitation or known username. Stranger search is disabled to preserve privacy.</p>
        </div>
      </div>
    </div>
  );
}
