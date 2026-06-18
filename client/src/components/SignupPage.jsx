import { useState } from 'react';

export default function SignupPage({ onSwitch, onLogin, api }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${api}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, display_name: displayName || username, email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        onLogin(data.token);
      } else {
        setError(data.error || 'Unable to sign up');
      }
    } catch (err) {
      setError('Unable to reach the server. Make sure the backend is running.');
    }
  };

  return (
    <div className="signup-container">
      <div className="panel card">
        <h1>Get started</h1>
        <p>Create your private Circle account.</p>
        <form onSubmit={submit}>
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            Display name
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="How friends will see you" />
          </label>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </label>
          {error && <p style={{ color: '#fb7185' }}>{error}</p>}
          <button className="primary" type="submit">Create account</button>
        </form>
        <button className="secondary" onClick={onSwitch}>Already have an account?</button>
      </div>
    </div>
  );
}
