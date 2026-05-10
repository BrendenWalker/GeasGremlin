import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getPlayerCharacters } from '../api/api';

const PLAYER_NAME_KEY = 'rpghub_player_name';

export default function PlayPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const userParam = searchParams.get('user') || '';
  const [playerName, setPlayerName] = useState(() => localStorage.getItem(PLAYER_NAME_KEY) || userParam || '');
  const [submitName, setSubmitName] = useState(playerName.trim().toUpperCase());
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const name = submitName.trim();
    if (!name) {
      setCharacters([]);
      return;
    }
    setLoading(true);
    setError(null);
    getPlayerCharacters(name)
      .then((r) => setCharacters(r.data || []))
      .catch((err) => {
        setError(err.response?.data?.error || err.message);
        setCharacters([]);
      })
      .finally(() => setLoading(false));
  }, [submitName]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const name = playerName.trim().toUpperCase();
    if (!name) return;
    localStorage.setItem(PLAYER_NAME_KEY, name);
    setSearchParams({ user: name });
    setSubmitName(name);
  };

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h1 style={{ marginTop: 0 }}>Play (Familiar-style)</h1>
      <p style={{ color: '#8a7f72', marginBottom: '1rem' }}>
        Enter your player name to see your characters. You can then open a character sheet, see party members, receive GM rewards, and send items or gold to other party members.
      </p>
      <form onSubmit={handleSubmit} style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: 4 }}>Player name</label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="e.g. ALICE"
            style={{
              flex: 1,
              minWidth: 120,
              padding: '0.5rem',
              borderRadius: 4,
              border: '1px solid #3d3530',
              background: '#1a1614',
              color: '#e8e0d5',
            }}
          />
          <button type="submit" className="btn btn-primary">Load my characters</button>
        </div>
      </form>

      {error && <p style={{ color: '#c95858', marginBottom: '0.5rem' }}>{error}</p>}
      {loading && <p style={{ color: '#8a7f72' }}>Loading…</p>}

      {!loading && submitName && (
        <>
          <h2 style={{ marginBottom: '0.5rem' }}>Characters</h2>
          {characters.length === 0 ? (
            <p style={{ color: '#8a7f72' }}>No characters found for “{submitName}”. Create one from a campaign (Manage → Campaigns → campaign → Characters → New).</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {characters.map((c) => (
                <li key={c.id} style={{ marginBottom: '0.5rem' }}>
                  <Link to={`/play/characters/${c.id}`} style={{ color: '#c9a227', textDecoration: 'none' }}>
                    <strong>{c.name}</strong>
                    {c.race_name || c.class_name ? (
                      <span style={{ color: '#8a7f72', marginLeft: 8 }}> · {[c.race_name, c.class_name].filter(Boolean).join(' ')}</span>
                    ) : null}
                    {c.campaign_names?.length ? (
                      <span style={{ color: '#6a5f52', fontSize: '0.9rem', display: 'block' }}>
                        Campaigns: {c.campaign_names.join(', ')}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p style={{ marginTop: '1.5rem', borderTop: '1px solid #3d3530', paddingTop: '1rem' }}>
        <Link to="/" style={{ color: '#8a7f72', textDecoration: 'none' }}>← Home</Link>
        {' · '}
        <Link to="/campaigns" style={{ color: '#8a7f72', textDecoration: 'none' }}>Manage campaigns</Link>
      </p>
    </div>
  );
}
