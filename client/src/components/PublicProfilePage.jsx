import { useEffect, useState } from 'react';

function getMediaUrl(api, value) {
  if (!value) return '';
  if (value.startsWith('http') || value.startsWith('data:')) return value;
  return `${api}${value}`;
}

export default function PublicProfilePage({ api, headers, userId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return;
    fetch(`${api}/users/${userId}/profile`, { headers })
      .then((res) => res.json())
      .then((data) => {
        if (data?.id) setProfile(data);
        else setError('Profile not found');
      })
      .catch(() => setError('Unable to load profile'));

    fetch(`${api}/users/${userId}/posts`, { headers })
      .then((res) => res.json())
      .then(setPosts)
      .catch(() => setPosts([]));
  }, [api, headers, userId]);

  if (error) {
    return (
      <div className="card">
        <button className="secondary" onClick={onClose}>Back</button>
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="card">
        <button className="secondary" onClick={onClose}>Back</button>
        <h2>Loading profile…</h2>
      </div>
    );
  }

  return (
    <div className="card profile-view-card">
      <button className="secondary" onClick={onClose}>Back</button>
      <div className="profile-view-header">
        <img className="avatar avatar-xxl" src={getMediaUrl(api, profile.avatar) || 'https://via.placeholder.com/150'} alt="profile avatar" />
        <div>
          <h2>{profile.display_name || profile.username}</h2>
          <p className="muted">@{profile.username}</p>
          <p>{profile.bio || 'No bio available.'}</p>
        </div>
      </div>

      <div className="profile-view-posts">
        <h3>Recent posts</h3>
        {posts.length ? (
          posts.map((post) => (
            <div key={post.id} className="post-card">
              <div className="post-header">
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <img className="avatar" src={getMediaUrl(api, profile.avatar) || 'https://via.placeholder.com/150'} alt="author" />
                  <div>
                    <strong>{profile.display_name || profile.username}</strong>
                    <p style={{ margin: 0, color: '#94a3b8' }}>{new Date(post.created_at).toLocaleString()}</p>
                  </div>
                </div>
              </div>
              <p>{post.text}</p>
              {post.image && <img className="post-image" src={getMediaUrl(api, post.image)} alt="post" />}
            </div>
          ))
        ) : (
          <p className="muted">No posts yet.</p>
        )}
      </div>
    </div>
  );
}
