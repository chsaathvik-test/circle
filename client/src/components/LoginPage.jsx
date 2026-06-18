import { useState } from 'react';

export default function LoginPage({ onSwitch, onLogin, api }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${api}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        onLogin(data.token);
      } else {
        setError(data.error || 'Unable to login');
      }
    } catch (err) {
      setError('Unable to reach the server. Make sure the backend is running.');
    }
  };

  return (
    <div className="login-container">
      <div className="panel card">
        <h1>Circle</h1>
        <p>Private sharing and chatting with your close circle.</p>
        <form onSubmit={submit}>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </label>
          {error && <p style={{ color: '#fb7185' }}>{error}</p>}
          <button className="primary" type="submit">Sign in</button>
        </form>
        <button className="secondary" onClick={onSwitch}>Create an account</button>
      </div>
    </div>
  );
}
