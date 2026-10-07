import React, { useState } from 'react';
import { useAuth } from '../components/AuthContext';

const INPUT_STYLE = {
  width: '100%',
  padding: '0.5rem',
  borderRadius: 4,
  border: '1px solid #3d3530',
  background: '#1a1614',
  color: '#e8e0d5',
  marginBottom: '0.75rem',
};

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const action = mode === 'login' ? login : register;
    action(username.trim(), password)
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="card" style={{ maxWidth: 420, margin: '2rem auto' }}>
      <h1 style={{ marginTop: 0 }}>{mode === 'login' ? 'Log in' : 'Create account'}</h1>
      <form onSubmit={submit}>
        <label style={{ display: 'block', marginBottom: 4 }}>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} style={INPUT_STYLE} autoComplete="username" />
        <label style={{ display: 'block', marginBottom: 4 }}>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={INPUT_STYLE} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        {error && <p style={{ color: '#c95858' }}>{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy || !username.trim() || password.length < 8}>
          {mode === 'login' ? 'Log in' : 'Register'}
        </button>
      </form>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ marginTop: '1rem' }}
        onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
      >
        {mode === 'login' ? 'Need an account?' : 'Already have an account?'}
      </button>
    </div>
  );
}
