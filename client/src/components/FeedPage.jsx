import { useEffect, useState } from 'react';

function getMediaUrl(api, value) {
  if (!value) return '';
  if (value.startsWith('http') || value.startsWith('data:')) return value;
  return `${api}${value}`;
}

export default function FeedPage({ api, headers, socket, user, onViewProfile }) {
  const [posts, setPosts] = useState([]);
  const [text, setText] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [postFileError, setPostFileError] = useState('');
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  const fetchFeed = () => {
    fetch(`${api}/posts/feed`, { headers })
      .then((res) => res.json())
      .then(setPosts)
      .catch(() => setPosts([]));
  };

  useEffect(() => {
    fetchFeed();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('notification', () => {
      fetchFeed();
    });
    return () => socket.off('notification');
  }, [socket]);

  const submitPost = async (e) => {
    e.preventDefault();
    setLoading(true);
    const data = new FormData();
    data.append('text', text);
    if (image) data.append('image', image);
    const res = await fetch(`${api}/posts`, {
      method: 'POST',
      headers,
      body: data,
    });
    const result = await res.json();
    if (res.ok) {
      setText('');
      setImage(null);
      fetchFeed();
    }
    setLoading(false);
  };

  const likePost = async (id) => {
    await fetch(`${api}/posts/${id}/likes`, { method: 'POST', headers });
    fetchFeed();
  };

  return (
    <div>
      <div className="card">
        <h2>Close circle posts</h2>
        <form onSubmit={submitPost} style={{ display: 'grid', gap: 12 }}>
          <label>
            Share with friends
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write something for your friends..." />
          </label>
          <label>Add image</label>
          <div className="file-input">
            <label className="file-input-label" htmlFor="post-image-input">Select image</label>
            <span className="file-input-name">{image ? image.name : 'No file selected'}</span>
            <input id="post-image-input" type="file" accept="image/*" onChange={(e) => {
              setPostFileError('');
              const f = e.target.files?.[0] || null;
              if (f) {
                if (!f.type.startsWith('image/')) { setPostFileError('File must be an image'); return; }
                if (f.size > MAX_FILE_SIZE) { setPostFileError('Image too large (max 5MB)'); return; }
              }
              setImage(f);
            }} />
          </div>
          {postFileError && <p style={{ color: '#fb7185' }}>{postFileError}</p>}
          <button className="primary" type="submit" disabled={loading}>Post</button>
        </form>
      </div>
      {posts.map((post) => (
        <div key={post.id} className="post-card">
          <div className="post-header">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <img className="avatar" src={getMediaUrl(api, post.avatar) || 'https://via.placeholder.com/150'} alt="author" />
              <div>
                <button className="secondary" style={{ padding: 0, border: 'none', background: 'transparent', color: '#f8fafc', textAlign: 'left', cursor: 'pointer' }} onClick={() => onViewProfile(post.user_id)}>
                  <strong>{post.display_name || post.username}</strong>
                </button>
                <p style={{ margin: 0, color: '#94a3b8' }}>@{post.username} • {new Date(post.created_at).toLocaleString()}</p>
              </div>
            </div>
          </div>
          <p>{post.text}</p>
          {post.image && <img className="post-image" src={api + post.image} alt="post" />}
          <div className="post-actions">
            <button className="secondary" onClick={() => likePost(post.id)}>{post.liked ? 'Liked' : 'Like'} ({post.likes})</button>
          </div>
        </div>
      ))}
    </div>
  );
}
