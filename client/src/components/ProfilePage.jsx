import { useEffect, useState } from 'react';

function getMediaUrl(api, value) {
  if (!value) return '';
  if (value.startsWith('http') || value.startsWith('data:')) return value;
  return `${api}${value}`;
}

export default function ProfilePage({ api, headers, user, onUserUpdated }) {
  const [profile, setProfile] = useState(user);
  const [username, setUsername] = useState(user?.username || '');
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatar, setAvatar] = useState(null);
  const [background, setBackground] = useState(null);
  const [themeColor, setThemeColor] = useState(user?.theme_color || '#2563eb');
  const [bgPreview, setBgPreview] = useState(user?.background_image ? getMediaUrl(api, user.background_image) : null);
  const [backgroundResized, setBackgroundResized] = useState(null);
  const [backgroundFile, setBackgroundFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  useEffect(() => {
    setProfile(user);
    setUsername(user?.username || '');
    setDisplayName(user?.display_name || '');
    setBio(user?.bio || '');
    setThemeColor(user?.theme_color || '#2563eb');
    setBgPreview(user?.background_image ? getMediaUrl(api, user.background_image) : null);
  }, [user, api]);

  useEffect(() => {
    if (!background) return;
    let cancelled = false;
    const doResize = async () => {
      try {
        const blob = await resizeImage(background, 1600);
        if (cancelled) return;
        setBackgroundResized(blob);
        const url = URL.createObjectURL(blob);
        setBgPreview(url);
      } catch (e) {
        console.error('resize failed', e);
      }
    };
    doResize();
    return () => { cancelled = true; };
  }, [background]);

  useEffect(() => {
    return () => {
      if (bgPreview && bgPreview.startsWith('blob:')) URL.revokeObjectURL(bgPreview);
    };
  }, [bgPreview]);

  async function resizeImage(file, maxDim = 1600) {
    const imgBitmap = await createImageBitmap(file);
    let { width, height } = imgBitmap;
    const ratio = Math.min(1, maxDim / Math.max(width, height));
    const w = Math.max(1, Math.round(width * ratio));
    const h = Math.max(1, Math.round(height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgBitmap, 0, 0, w, h);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  }

  const saveProfile = async () => {
    const data = new FormData();
    data.append('username', username);
    data.append('display_name', displayName);
    data.append('bio', bio);
    data.append('theme_color', themeColor || '');
    if (avatar) data.append('avatar', avatar);
    if (backgroundResized) {
      data.append('background', backgroundResized, backgroundFile?.name || 'background.jpg');
    }
    const res = await fetch(`${api}/me`, {
      method: 'PUT',
      headers,
      body: data,
    });
    if (res.ok) {
      const updated = await res.json();
      setProfile(updated);
      setUsername(updated.username || '');
      setDisplayName(updated.display_name || '');
      setBio(updated.bio || '');
      setThemeColor(updated.theme_color || '#2563eb');
      setBackground(null);
      if (updated.background_image) {
        document.body.classList.add('has-user-bg');
        document.body.style.setProperty('--user-bg-url', `url(${getMediaUrl(api, updated.background_image)})`);
      } else {
        document.body.classList.remove('has-user-bg');
        document.body.style.removeProperty('--user-bg-url');
      }
      document.body.style.setProperty('--user-theme-color', updated.theme_color || '#2563eb');
      if (onUserUpdated) onUserUpdated(updated);
    }
  };

  const resetBackground = async () => {
    const res = await fetch(`${api}/me`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ background_remove: true }),
    });
    if (res.ok) {
      const updated = await res.json();
      setProfile(updated);
      setBgPreview(null);
      document.body.classList.remove('has-user-bg');
      document.body.style.removeProperty('--user-bg-url');
      if (onUserUpdated) onUserUpdated(updated);
    }
  };

  return (
    <div className="card profile-page-card">
      <div className="profile-heading">
        <div>
          <p className="eyebrow">Profile</p>
          <h2>Personalize your Circle</h2>
          <p className="muted">Upload your avatar, choose a premium background, and set your profile tone.</p>
        </div>
        <div className="profile-preview-avatar">
          <img className="avatar avatar-xxl" src={getMediaUrl(api, profile?.avatar) || 'https://via.placeholder.com/150'} alt="profile avatar" />
        </div>
      </div>

      <div className="profile-grid">
        <label>
          Display name
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="How friends see you" />
        </label>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Unique username" />
        </label>
        <label>
          Bio
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A short, elegant bio" />
        </label>
      </div>

      <div className="profile-media-grid">
        <div>
          <p className="field-label">Avatar</p>
          <div className="file-input">
            <label className="file-input-label" htmlFor="avatar-input">Upload avatar</label>
            <span className="file-input-name">{avatar ? avatar.name : 'No file selected'}</span>
            <input id="avatar-input" type="file" accept="image/*" onChange={(e) => {
              setFileError('');
              const f = e.target.files?.[0] || null;
              if (f) {
                if (!f.type.startsWith('image/')) { setFileError('Avatar must be an image'); return; }
                if (f.size > MAX_FILE_SIZE) { setFileError('Avatar too large (max 5MB)'); return; }
              }
              setAvatar(f);
            }} />
          </div>
        </div>
        <div>
          <p className="field-label">Background image</p>
          <div className="file-input">
            <label className="file-input-label" htmlFor="background-input">Upload background</label>
            <span className="file-input-name">{backgroundFile ? backgroundFile.name : 'No file selected'}</span>
            <input id="background-input" type="file" accept="image/*" onChange={(e) => {
              setFileError('');
              const f = e.target.files?.[0] || null;
              if (f) {
                if (!f.type.startsWith('image/')) { setFileError('Background must be an image'); return; }
                if (f.size > MAX_FILE_SIZE) { setFileError('Background too large (max 5MB)'); return; }
              }
              setBackgroundFile(f);
              setBackground(f);
            }} />
          </div>
        </div>
      </div>

      {fileError && <p className="error-text">{fileError}</p>}
      <div className="profile-actions">
        <button className="secondary" onClick={resetBackground}>Reset background</button>
        <button className="primary" onClick={saveProfile}>Save profile</button>
      </div>

      {bgPreview && (
        <div className="background-preview" style={{ backgroundImage: `url(${bgPreview})` }} />
      )}

      <label>
        Theme color
        <input type="color" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} className="color-picker" />
      </label>
    </div>
  );
}
