import React, { useState, useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getCampaign, getCharacters, getRaces, getClasses, createCharacter, removeCampaignCharacter, createCampaignCommand } from '../api/api';
import { useAuth } from '../components/AuthContext';
import { useNotices } from '../components/NoticeContext';
import { commandReceipt } from '../domain/notices.mjs';

function listDetail(row) {
  const kind = [row.race_name, row.class_name].filter(Boolean).join(' ');
  const raw = row.level == null || row.level === '' ? 1 : Number(row.level);
  const level = Number.isInteger(raw) ? `(lvl ${raw})` : '';
  return [kind, level].filter(Boolean).join(' ');
}

export default function CharactersPage() {
  const { campaignId } = useParams();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { notify } = useNotices();
  const rosterPath = pathname.startsWith(`/play/${campaignId}`)
    ? `/play/${campaignId}/characters`
    : `/campaigns/${campaignId}/characters`;
  const [campaign, setCampaign] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', level: 1, xp: 0, raceId: '', classId: '', baseId: '' });
  const [races, setRaces] = useState([]);
  const [classes, setClasses] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [showGm, setShowGm] = useState(false);
  const [gmTargetId, setGmTargetId] = useState('');
  const [gmXp, setGmXp] = useState(0);
  const [gmGold, setGmGold] = useState(0);
  const [gmSending, setGmSending] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      getCampaign(campaignId).then((r) => r.data).catch(() => null),
      getCharacters(campaignId).then((r) => r.data || []).catch(() => []),
    ])
      .then(([c, list]) => {
        setCampaign(c);
        setCharacters(list);
      })
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(), [campaignId]);

  useEffect(() => {
    if (!showForm || !campaign?.ruleset_id) return undefined;
    let cancelled = false;
    Promise.all([
      getRaces(campaign.ruleset_id).then((r) => r.data || []),
      getClasses(campaign.ruleset_id).then((r) => r.data || []),
    ])
      .then(([raceRows, classRows]) => {
        if (cancelled) return;
        setRaces(raceRows);
        setClasses(classRows);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || err.message);
      });
    return () => { cancelled = true; };
  }, [showForm, campaign?.ruleset_id]);

  const chosenClass = classes.find((row) => String(row.id) === String(form.classId)) || null;
  const needsBase = Boolean(chosenClass?.is_quasi);
  const fieldStyle = { padding: '0.5rem', borderRadius: 4, border: '1px solid #3d3530', background: '#252019', color: '#e8e0d5' };

  const handleCreate = (e) => {
    e.preventDefault();
    if (!form.name.trim() || (needsBase && form.baseId === '')) return;
    const race = form.raceId === '' ? null : parseInt(form.raceId, 10);
    const classId = form.classId === '' ? null : parseInt(form.classId, 10);
    const baseId = form.baseId === '' ? null : parseInt(form.baseId, 10);
    setSubmitting(true);
    createCharacter(campaignId, {
      name: form.name.trim(),
      level: form.level,
      xp: form.xp,
      race,
      class: needsBase ? baseId : classId,
      quasiclass: needsBase ? classId : null,
    })
      .then(() => {
        setForm({ name: '', level: 1, xp: 0, raceId: '', classId: '', baseId: '' });
        setShowForm(false);
        load();
      })
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setSubmitting(false));
  };

  const handleRemove = (id, name) => {
    const leaving = campaign?.role !== 'gm';
    const prompt = leaving
      ? `Leave "${name}" from this campaign?`
      : `Remove "${name}" from this campaign?`;
    if (!window.confirm(prompt)) return;
    removeCampaignCharacter(campaignId, id)
      .then(load)
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  const sendToCharacter = (type, payload, after) => {
    const name = characters.find((c) => String(c.id) === String(gmTargetId))?.name;
    setGmSending(true);
    setError(null);
    createCampaignCommand(campaignId, {
      recipient_character_id: parseInt(gmTargetId, 10),
      type,
      payload,
    })
      .then((res) => {
        const text = commandReceipt(name, { type, payload });
        if (text) {
          notify({
            tone: 'success',
            text,
            source: `gm-command:${res.data?.id ?? type}`,
          });
        }
        if (after) after();
      })
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setGmSending(false));
  };

  if (loading && !campaign) {
    return <div className="card"><p style={{ color: '#8a7f72' }}>Loading…</p></div>;
  }

  if (!campaign) {
    return (
      <div className="card">
        <p style={{ color: '#c95858' }}>Campaign not found.</p>
        <Link to="/campaigns" className="btn btn-secondary">Back to Campaigns</Link>
      </div>
    );
  }

  const ownedHere = (row) => String(row.user || '').toLowerCase() === String(user?.username || '').toLowerCase();
  const listed = campaign.role === 'gm' ? characters : characters.filter(ownedHere);
  const showMine = pathname.startsWith(`/play/${campaignId}`) && campaign.role === 'gm';
  const mine = characters.filter(ownedHere);

  return (
    <div>
      {!showMine && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{campaign.name} — Characters</h2>
            {campaign.ruleset_name && <span className="muted">{campaign.ruleset_name}</span>}
          </div>
        </div>
      )}
      <div className="card">
        {showMine && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>Campaign Roster</h2>
            {campaign.ruleset_name && <span className="muted">{campaign.ruleset_name}</span>}
          </div>
        )}
        {error && <p style={{ color: '#c95858', marginBottom: '0.5rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {campaign.role === 'gm' && (
            <>
              <Link
                to={`${rosterPath}/new`}
                className="btn btn-primary"
              >
                New character (wizard)
              </Link>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowForm(!showForm)}
              >
                {showForm ? 'Cancel' : 'New character (quick)'}
              </button>
            </>
          )}
          {campaign.role === 'gm' && (
            <button type="button" className="btn btn-secondary" onClick={() => setShowGm(!showGm)}>
              {showGm ? 'Hide GM' : 'GM commands'}
            </button>
          )}
        </div>
        {campaign.role === 'gm' && showGm && (
          <div style={{ marginBottom: '1rem', padding: '1rem', background: '#252019', borderRadius: 6, border: '1px solid #3d3530' }}>
            <h3 style={{ marginTop: 0 }}>GM: Send to player</h3>
            <p style={{ color: '#8a7f72', fontSize: '0.9rem', marginBottom: '0.75rem' }}>Commands are delivered when the player has their character open in Play mode.</p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 2 }}>Character</label>
                <select
                  value={gmTargetId}
                  onChange={(e) => setGmTargetId(e.target.value)}
                  style={{ padding: '0.5rem', borderRadius: 4, border: '1px solid #3d3530', background: '#1a1614', color: '#e8e0d5', minWidth: 160 }}
                >
                  <option value="">— Select —</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 2 }}>XP</label>
                <input type="number" min={0} value={gmXp} onChange={(e) => setGmXp(parseInt(e.target.value, 10) || 0)} style={{ width: 80, padding: '0.5rem', borderRadius: 4, border: '1px solid #3d3530', background: '#1a1614', color: '#e8e0d5' }} />
              </div>
              <button type="button" className="btn btn-primary" disabled={!gmTargetId || gmXp <= 0 || gmSending} onClick={() => sendToCharacter('give_xp', { amount: gmXp }, () => setGmXp(0))}>Give XP</button>
              <div>
                <label style={{ display: 'block', marginBottom: 2 }}>Money (cp)</label>
                <input type="number" min={0} value={gmGold} onChange={(e) => setGmGold(parseInt(e.target.value, 10) || 0)} style={{ width: 80, padding: '0.5rem', borderRadius: 4, border: '1px solid #3d3530', background: '#1a1614', color: '#e8e0d5' }} />
              </div>
              <button type="button" className="btn btn-primary" disabled={!gmTargetId || gmGold <= 0 || gmSending} onClick={() => sendToCharacter('give_gold', { amount_cp: gmGold }, () => setGmGold(0))}>Give Money</button>
              <button type="button" className="btn btn-secondary" disabled={!gmTargetId || gmSending} onClick={() => sendToCharacter('new_day', {})}>New day</button>
              <button type="button" className="btn btn-secondary" disabled={!gmTargetId || gmSending} onClick={() => sendToCharacter('new_round', {})}>New round</button>
            </div>
          </div>
        )}
        {showForm && (
          <form onSubmit={handleCreate} style={{ marginBottom: '1rem', padding: '1rem', background: '#1a1614', borderRadius: 6 }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', marginBottom: 2 }}>Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Character name"
                style={{ width: '100%', maxWidth: 300, padding: '0.5rem', borderRadius: 4, border: '1px solid #3d3530', background: '#252019', color: '#e8e0d5' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 2 }}>Race</label>
                <select
                  value={form.raceId}
                  onChange={(e) => setForm((f) => ({ ...f, raceId: e.target.value }))}
                  style={{ ...fieldStyle, minWidth: 160 }}
                >
                  <option value="">—</option>
                  {races.map((race) => (
                    <option key={race.id} value={race.id}>{race.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 2 }}>Class</label>
                <select
                  value={form.classId}
                  onChange={(e) => {
                    const classId = e.target.value;
                    const row = classes.find((item) => String(item.id) === classId);
                    setForm((f) => ({ ...f, classId, baseId: row?.is_quasi ? f.baseId : '' }));
                  }}
                  style={{ ...fieldStyle, minWidth: 160 }}
                >
                  <option value="">—</option>
                  {classes.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>
              {needsBase && (
                <div>
                  <label style={{ display: 'block', marginBottom: 2 }}>Base class</label>
                  <select
                    value={form.baseId}
                    onChange={(e) => setForm((f) => ({ ...f, baseId: e.target.value }))}
                    style={{ ...fieldStyle, minWidth: 160 }}
                  >
                    <option value="">—</option>
                    {classes.filter((item) => !item.is_quasi).map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 2 }}>Level</label>
                <input
                  type="number"
                  min={1}
                  value={form.level}
                  onChange={(e) => setForm((f) => ({ ...f, level: parseInt(e.target.value, 10) || 1 }))}
                  style={{ width: 80, padding: '0.5rem', borderRadius: 4, border: '1px solid #3d3530', background: '#252019', color: '#e8e0d5' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 2 }}>XP</label>
                <input
                  type="number"
                  min={0}
                  value={form.xp}
                  onChange={(e) => setForm((f) => ({ ...f, xp: parseInt(e.target.value, 10) || 0 }))}
                  style={{ width: 100, padding: '0.5rem', borderRadius: 4, border: '1px solid #3d3530', background: '#252019', color: '#e8e0d5' }}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting || !form.name.trim() || (needsBase && form.baseId === '')}>
              Create
            </button>
          </form>
        )}
        {loading ? (
          <p style={{ color: '#8a7f72' }}>Loading characters…</p>
        ) : (
          <ul style={{ listStyle: 'none' }}>
            {listed.map((c) => {
              const detail = listDetail(c);
              return (
              <li
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0',
                  borderBottom: '1px solid #3d3530',
                }}
              >
                <Link to={pathname.startsWith(`/play/${campaignId}`) ? `${rosterPath}/${c.id}` : `/characters/${c.id}`} style={{ color: '#c9a227', textDecoration: 'none' }}>
                  {c.name}
                  {detail && (
                    <span style={{ color: '#8a7f72', fontSize: '0.9rem', marginLeft: '0.5rem' }}>
                      — {detail}
                    </span>
                  )}
                  {c.user ? (
                    <span style={{ color: '#8a7f72', fontSize: '0.9rem', marginLeft: '0.5rem' }}>{c.user}</span>
                  ) : null}
                </Link>
                {(campaign.role === 'gm' || String(c.user || '').toLowerCase() === user.username.toLowerCase()) && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                    onClick={() => handleRemove(c.id, c.name)}
                  >
                    {campaign.role === 'gm' ? 'Remove From Campaign' : 'Leave Campaign'}
                  </button>
                )}
              </li>
              );
            })}
            {listed.length === 0 && !loading && (
              <li style={{ color: '#8a7f72' }}>
                {campaign.role === 'gm' ? 'No characters in this campaign.' : 'None of your characters are in this campaign.'}
              </li>
            )}
          </ul>
        )}
      </div>
      {showMine && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>My Characters</h2>
          <p style={{ color: '#8a7f72', marginTop: 0 }}>
            Characters owned by {user.username} in this campaign.
          </p>
          {mine.length === 0 ? (
            <p style={{ color: '#8a7f72' }}>None of your characters are in this campaign.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {mine.map((c) => {
                const detail = listDetail(c);
                return (
                <li key={c.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #3d3530' }}>
                  <Link to={`${rosterPath}/${c.id}`} style={{ color: '#c9a227', textDecoration: 'none' }}>
                    <strong>{c.name}</strong>
                    {detail && (
                      <span style={{ color: '#8a7f72', fontSize: '0.9rem', marginLeft: '0.5rem' }}>
                        — {detail}
                      </span>
                    )}
                  </Link>
                </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
