import { useEffect, useMemo, useState } from 'react';
import io from 'socket.io-client';
import LoginPage from './components/LoginPage.jsx';
import SignupPage from './components/SignupPage.jsx';
import HomePage from './components/HomePage.jsx';

const API = import.meta.env.VITE_API_URL || '/api';

function App() {
  const [token, setToken] = useState(localStorage.getItem('circle_token'));
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('login');

  const socket = useMemo(() => {
    if (!token) return null;
    const socketClient = io(API, { auth: { token }, transports: ['websocket'] });
    return socketClient;
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (data?.id) {
          setUser(data);
          setPage('home');
        } else {
          setToken(null);
          localStorage.removeItem('circle_token');
        }
      })
      .catch(() => {
        setToken(null);
        localStorage.removeItem('circle_token');
      });
  }, [token]);

  const refreshUser = () => {
    if (!token) return;
    fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (data?.id) setUser(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    return () => {
      if (socket) socket.disconnect();
    };
  }, [socket]);

  const handleLogin = (tokenValue) => {
    localStorage.setItem('circle_token', tokenValue);
    setToken(tokenValue);
  };

  const handleLogout = () => {
    localStorage.removeItem('circle_token');
    setToken(null);
    setUser(null);
    setPage('login');
  };

  if (!token) {
    return page === 'signup' ? (
      <SignupPage onSwitch={() => setPage('login')} onLogin={handleLogin} api={API} />
    ) : (
      <LoginPage onSwitch={() => setPage('signup')} onLogin={handleLogin} api={API} />
    );
  }

  return <HomePage api={API} token={token} user={user} socket={socket} onLogout={handleLogout} refreshUser={refreshUser} />;
}

export default App;
