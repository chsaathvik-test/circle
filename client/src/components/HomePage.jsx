import { useEffect, useMemo, useState } from 'react';
import FeedPage from './FeedPage.jsx';
import FriendsPage from './FriendsPage.jsx';
import MessagesPage from './MessagesPage.jsx';
import GroupsPage from './GroupsPage.jsx';
import ProfilePage from './ProfilePage.jsx';
import PublicProfilePage from './PublicProfilePage.jsx';

function getMediaUrl(api, value) {
  if (!value) return '';
  if (value.startsWith('http') || value.startsWith('data:')) return value;
  return `${api}${value}`;
}

const navItems = [
  { id: 'feed', label: 'Posts' },
  { id: 'friends', label: 'Friends' },
  { id: 'messages', label: 'Messages' },
  { id: 'groups', label: 'Groups' },
  { id: 'profile', label: 'Profile' },
];

export default function HomePage({ api, token, user, socket, onLogout, refreshUser }) {
  const [active, setActive] = useState('feed');
  const [notifications, setNotifications] = useState([]);
  const [viewUserId, setViewUserId] = useState(null);
  const [previousPage, setPreviousPage] = useState('feed');

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
    if (!user) return;
    fetch(`${api}/notifications`, { headers })
      .then((res) => res.json())
      .then(setNotifications)
      .catch(() => setNotifications([]));
    // Apply user's theme and background via CSS variables and class
    if (user.background_image) {
      document.body.classList.add('has-user-bg');
      document.body.style.setProperty('--user-bg-url', `url(${api}${user.background_image})`);
    } else {
      document.body.classList.remove('has-user-bg');
      document.body.style.removeProperty('--user-bg-url');
    }
    document.body.style.setProperty('--user-theme-color', user.theme_color || '');
  }, [api, headers, user]);

  useEffect(() => {
    if (!socket) return;
    socket.on('notification', (payload) => {
      setNotifications((prev) => [payload, ...prev]);
    });
    return () => {
      socket.off('notification');
    };
  }, [socket]);

  const unreadCount = notifications.filter((item) => item.read === 0).length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="user-card">
          <img className="avatar" src={getMediaUrl(api, user?.avatar) || 'https://via.placeholder.com/150'} alt="avatar" />
          <div>
            <strong>{user?.display_name || user?.username}</strong>
            {user?.username && user?.display_name !== user?.username && (
              <p style={{ margin: '6px 0 0', fontSize: '0.9rem', color: '#94a3b8' }}>@{user.username}</p>
            )}
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>{user?.bio || 'Private circle member'}</p>
          </div>
        </div>

        <nav>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={active === item.id ? 'primary' : 'secondary'}
              onClick={() => {
                setActive(item.id);
                setViewUserId(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="card">
          <h3>Notifications</h3>
          <p style={{ color: '#94a3b8' }}>{unreadCount} new alerts</p>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {notifications.slice(0, 5).map((item) => (
              <div key={item.id} style={{ color: '#e2e8f0', fontSize: '0.9rem', lineHeight: 1.4 }}>
                <strong>{item.type.replace('_', ' ')}</strong>
                <div style={{ color: '#94a3b8' }}>{item.text}</div>
              </div>
            ))}
          </div>
          <button className="secondary" onClick={onLogout}>Sign out</button>
        </div>
      </aside>

      <main className="page-content">
        {active === 'feed' && <FeedPage api={api} headers={headers} socket={socket} user={user} onViewProfile={(id) => {
          setPreviousPage('feed');
          setViewUserId(id);
          setActive('profile');
        }} />}
        {active === 'friends' && <FriendsPage api={api} headers={headers} socket={socket} onViewProfile={(id) => {
          setPreviousPage('friends');
          setViewUserId(id);
          setActive('profile');
        }} />}
        {active === 'messages' && <MessagesPage api={api} headers={headers} socket={socket} user={user} onViewProfile={(id) => {
          setPreviousPage('messages');
          setViewUserId(id);
          setActive('profile');
        }} />}
        {active === 'groups' && <GroupsPage api={api} headers={headers} socket={socket} user={user} onViewProfile={(id) => {
          setPreviousPage('groups');
          setViewUserId(id);
          setActive('profile');
        }} />}
        {active === 'profile' && viewUserId ? (
          <PublicProfilePage api={api} headers={headers} userId={viewUserId} onClose={() => {
            setViewUserId(null);
            setActive(previousPage || 'feed');
          }} />
        ) : (
          active === 'profile' && <ProfilePage api={api} headers={headers} user={user} onUserUpdated={refreshUser} />
        )}
      </main>
    </div>
  );
}
