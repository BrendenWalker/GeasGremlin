import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  getCampaign,
  getRaces,
  getClasses,
  createCharacter,
} from '../api/api';

const STEPS = ['Class', 'Race', 'Attributes', 'Name & gold'];
const STAT_KEYS = ['str', 'int', 'wis', 'dex', 'con', 'chr'];

function clampStat(value, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return min ?? 3;
  if (min != null && n < min) return min;
  if (max != null && max > 0 && n > max) return max;
  return n;
}

function getStatBounds(race, cls) {
  const mins = {};
  const maxs = {};
  STAT_KEYS.forEach((k) => {
    const rMin = race ? race[`min_${k === 'int' ? 'int' : k}`] : null;
    const rMax = race ? race[`max_${k === 'int' ? 'int' : k}`] : null;
    const cMin = cls ? cls[`min_${k === 'int' ? 'int' : k}`] : null;
    mins[k] = [rMin, cMin].filter((x) => x != null).length ? Math.max(rMin ?? 3, cMin ?? 3) : 3;
    maxs[k] = rMax != null && rMax > 0 ? rMax : 18;
  });
  return { mins, maxs };
}

export default function NewCharacterWizardPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [races, setRaces] = useState([]);
  const [classes, setClasses] = useState([]);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedRace, setSelectedRace] = useState(null);
  const [attrs, setAttrs] = useState({ str: 10, int: 10, wis: 10, dex: 10, con: 10, chr: 10 });
  const [name, setName] = useState('');
  const [startingGold, setStartingGold] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      getCampaign(campaignId).then((r) => r.data).catch(() => null),
      getRaces().then((r) => r.data || []),
      getClasses().then((r) => r.data || []),
    ])
      .then(([c, r, cl]) => {
        setCampaign(c);
        setRaces(r);
        setClasses(cl);
      })
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [campaignId]);

  const cls = selectedClass != null ? classes.find((c) => c.id === parseInt(selectedClass, 10)) : null;
  const race = selectedRace != null ? races.find((r) => r.id === parseInt(selectedRace, 10)) : null;
  const { mins, maxs } = getStatBounds(race, cls);

  const canNext = () => {
    if (step === 0) return selectedClass != null && selectedClass !== '';
    if (step === 1) return selectedRace != null && selectedRace !== '';
    if (step === 2) return true;
    if (step === 3) return name.trim().length > 0;
    return true;
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else handleCreate();
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    const payload = {
      name: name.trim(),
      level: 1,
      xp: 0,
      race: selectedRace ? parseInt(selectedRace, 10) : null,
      class: selectedClass ? parseInt(selectedClass, 10) : null,
      str: attrs.str,
      int: attrs.int,
      wis: attrs.wis,
      dex: attrs.dex,
      con: attrs.con,
      chr: attrs.chr,
      money: Math.round(startingGold) * 100 || 0,
    };
    createCharacter(campaignId, payload)
      .then((r) => {
        navigate(`/characters/${r.data.id}`);
      })
      .catch((err) => {
        setError(err.response?.data?.error || err.message);
        setSubmitting(false);
      });
  };

  if (loading && !campaign) {
    return (
      <div className="card">
        <p style={{ color: '#8a7f72' }}>Loading…</p>
      </div>
    );
  }
  if (!campaign) {
    return (
      <div className="card">
        <p style={{ color: '#c95858' }}>Campaign not found.</p>
        <Link to="/campaigns" className="btn btn-secondary">Back to Campaigns</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <Link
            to={`/campaigns/${campaignId}/characters`}
            style={{ color: '#8a7f72', textDecoration: 'none' }}
          >
            ← Characters
          </Link>
          <h2 style={{ margin: 0 }}>New character</h2>
          <span style={{ color: '#8a7f72' }}>
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </span>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: '1rem', borderLeft: '4px solid #c95858' }}>
          <p style={{ color: '#c95858', margin: 0 }}>{error}</p>
        </div>
      )}

      <div className="card">
        {step === 0 && (
          <>
            <h3>Choose class</h3>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {classes.map((c) => (
                <li key={c.id}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="class"
                      value={c.id}
                      checked={selectedClass === String(c.id)}
                      onChange={() => setSelectedClass(String(c.id))}
                    />
                    <span>{c.name}</span>
                    {c.description && (
                      <span style={{ color: '#8a7f72', fontSize: '0.9rem' }}>
                        — {c.description.slice(0, 80)}{c.description.length > 80 ? '…' : ''}
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}

        {step === 1 && (
          <>
            <h3>Choose race</h3>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {races.map((r) => (
                <li key={r.id}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="race"
                      value={r.id}
                      checked={selectedRace === String(r.id)}
                      onChange={() => setSelectedRace(String(r.id))}
                    />
                    <span>{r.name}</span>
                    {r.description && (
                      <span style={{ color: '#8a7f72', fontSize: '0.9rem' }}>
                        — {r.description.slice(0, 80)}{r.description.length > 80 ? '…' : ''}
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}

        {step === 2 && (
          <>
            <h3>Attributes</h3>
            <p style={{ color: '#8a7f72', marginBottom: '1rem' }}>
              Min/max from race and class. STR, INT, WIS, DEX, CON, CHR.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.75rem' }}>
              {STAT_KEYS.map((key) => (
                <div key={key}>
                  <label style={{ display: 'block', marginBottom: 2 }}>
                    {key.toUpperCase()} ({mins[key]}-{maxs[key]})
                  </label>
                  <input
                    type="number"
                    min={mins[key]}
                    max={maxs[key]}
                    value={attrs[key]}
                    onChange={(e) =>
                      setAttrs((a) => ({
                        ...a,
                        [key]: clampStat(e.target.value, mins[key], maxs[key]),
                      }))
                    }
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: 4,
                      border: '1px solid #3d3530',
                      background: '#1a1614',
                      color: '#e8e0d5',
                    }}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h3>Name & starting gold</h3>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: 4 }}>Character name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                style={{
                  width: '100%',
                  maxWidth: 300,
                  padding: '0.5rem',
                  borderRadius: 4,
                  border: '1px solid #3d3530',
                  background: '#1a1614',
                  color: '#e8e0d5',
                }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: 4 }}>Starting gold (GP)</label>
              <input
                type="number"
                min={0}
                value={startingGold}
                onChange={(e) => setStartingGold(parseFloat(e.target.value) || 0)}
                style={{
                  width: 120,
                  padding: '0.5rem',
                  borderRadius: 4,
                  border: '1px solid #3d3530',
                  background: '#1a1614',
                  color: '#e8e0d5',
                }}
              />
            </div>
          </>
        )}

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
          {step > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStep((s) => s - 1)}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleNext}
            disabled={!canNext() || submitting}
          >
            {step < STEPS.length - 1 ? 'Next' : submitting ? 'Creating…' : 'Create character'}
          </button>
        </div>
      </div>
    </div>
  );
}
