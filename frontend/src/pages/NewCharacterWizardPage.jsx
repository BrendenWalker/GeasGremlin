import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  getCampaign,
  getRaces,
  getClasses,
  createCharacter,
} from '../api/api';
import { useRuleset } from '../components/RulesetContext';
import { clampStat, formatModifier, openMechanic, statBounds } from '../domain/character.mjs';

const STEPS = ['Class', 'Race', 'Attributes', 'Name, HP & gold'];

export default function NewCharacterWizardPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { error: rulesetError, loading: rulesetsLoading, rulesets } = useRuleset();
  const [campaign, setCampaign] = useState(null);
  const [races, setRaces] = useState([]);
  const [classes, setClasses] = useState([]);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedBase, setSelectedBase] = useState(null);
  const [selectedRace, setSelectedRace] = useState(null);
  const [attrs, setAttrs] = useState({ str: 10, int: 10, wis: 10, dex: 10, con: 10, chr: 10 });
  const [name, setName] = useState('');
  const [startingGold, setStartingGold] = useState(0);
  const [baseHp, setBaseHp] = useState('');

  useEffect(() => {
    if (rulesetError) {
      setLoading(false);
      setError(rulesetError);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedClass(null);
    setSelectedBase(null);
    setSelectedRace(null);
    setBaseHp('');
    setStep(0);
    getCampaign(campaignId)
      .then((r) => r.data)
      .catch(() => null)
      .then((c) => {
        if (cancelled) return null;
        if (!c?.ruleset_id) {
          setCampaign(c);
          setRaces([]);
          setClasses([]);
          return null;
        }
        return Promise.all([
          getRaces(c.ruleset_id).then((r) => r.data || []),
          getClasses(c.ruleset_id).then((r) => r.data || []),
        ]).then(([r, cl]) => ({ campaign: c, races: r, classes: cl }));
      })
      .then((loaded) => {
        if (cancelled || !loaded) return;
        setCampaign(loaded.campaign);
        setRaces(loaded.races);
        setClasses(loaded.classes);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [campaignId, rulesetError]);

  const ruleset = (rulesets || []).find((row) => String(row.id) === String(campaign?.ruleset_id));
  let mechanic = null;
  let mechanicError = null;
  if (ruleset) {
    try {
      mechanic = openMechanic(ruleset);
    } catch (err) {
      mechanicError = err.message;
    }
  }
  const attributes = mechanic?.attributes || [];
  const conAttr = attributes.find((attr) => attr.name === 'CON');
  const conScore = conAttr ? attrs[conAttr.column] : undefined;
  const cls = selectedClass != null ? classes.find((c) => c.id === parseInt(selectedClass, 10)) : null;
  const baseCls = selectedBase != null ? classes.find((c) => c.id === parseInt(selectedBase, 10)) : null;
  const race = selectedRace != null ? races.find((r) => r.id === parseInt(selectedRace, 10)) : null;
  const dieSource = cls?.is_quasi ? baseCls : cls;
  const { mins, maxs } = mechanic
    ? statBounds(race, cls, cls?.is_quasi ? baseCls : null, attributes)
    : { mins: {}, maxs: {} };
  const hitdie = mechanic ? mechanic.classHitDie(dieSource?.abilities) : null;
  const conMod = mechanic ? mechanic.abilityModifier(conScore) : 0;
  const hitPoints = mechanic ? mechanic.adjustedHitPoints(baseHp, conScore, hitdie) : null;

  const canNext = () => {
    if (step === 0) {
      if (selectedClass == null || selectedClass === '') return false;
      if (cls?.is_quasi) return selectedBase != null && selectedBase !== '';
      return true;
    }
    if (step === 1) return selectedRace != null && selectedRace !== '';
    if (step === 2) return true;
    if (step === 3) return name.trim().length > 0 && hitPoints != null;
    return true;
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else handleCreate();
  };

  const handleCreate = () => {
    if (!name.trim() || hitPoints == null) return;
    setSubmitting(true);
    setError(null);
    const payload = {
      name: name.trim(),
      level: 1,
      xp: 0,
      ruleset_id: campaign.ruleset_id,
      race: selectedRace ? parseInt(selectedRace, 10) : null,
      class: cls?.is_quasi ? parseInt(selectedBase, 10) : (selectedClass ? parseInt(selectedClass, 10) : null),
      quasiclass: cls?.is_quasi ? parseInt(selectedClass, 10) : null,
      str: attrs.str,
      int: attrs.int,
      wis: attrs.wis,
      dex: attrs.dex,
      con: conScore,
      chr: attrs.chr,
      hp: hitPoints,
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

  if (rulesetError) {
    return (
      <div className="card">
        <p style={{ color: '#c95858' }}>{rulesetError}</p>
      </div>
    );
  }
  if (!rulesetsLoading && Array.isArray(rulesets) && rulesets.length === 0) {
    return (
      <div className="card">
        <p className="muted">No rulesets in database.</p>
      </div>
    );
  }
  if (rulesetsLoading || (loading && !campaign)) {
    return (
      <div className="card">
        <p style={{ color: '#8a7f72' }}>Loading…</p>
      </div>
    );
  }
  if (mechanicError) {
    return (
      <div className="card">
        <p style={{ color: '#c95858' }}>{mechanicError}</p>
        <Link to={`/campaigns/${campaignId}/characters`} className="btn btn-secondary">Back to characters</Link>
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
                      onChange={() => {
                        setSelectedClass(String(c.id));
                        if (!c.is_quasi) setSelectedBase(null);
                      }}
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
            {cls?.is_quasi && (
              <>
                <h3>Base class</h3>
                <p style={{ color: '#8a7f72', marginTop: 0 }}>
                  A quasi-class is layered on a base class. Hit die comes from the base class.
                </p>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {classes.filter((c) => !c.is_quasi).map((c) => (
                    <li key={c.id}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="base-class"
                          value={c.id}
                          checked={selectedBase === String(c.id)}
                          onChange={() => setSelectedBase(String(c.id))}
                        />
                        <span>{c.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
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
              Min/max from race and class. {attributes.map((attr) => attr.name).join(', ')}.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.75rem' }}>
              {attributes.map((attr) => (
                <div key={attr.column}>
                  <label style={{ display: 'block', marginBottom: 2 }}>
                    {attr.name} ({mins[attr.column]}-{maxs[attr.column]})
                  </label>
                  <input
                    type="number"
                    min={mins[attr.column]}
                    max={maxs[attr.column]}
                    value={attrs[attr.column]}
                    onChange={(e) =>
                      setAttrs((a) => ({
                        ...a,
                        [attr.column]: clampStat(e.target.value, mins[attr.column], maxs[attr.column]),
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
            <h3>Name, hit points & starting gold</h3>
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
              <label style={{ display: 'block', marginBottom: 4 }} htmlFor="base-hp">Base HP</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  id="base-hp"
                  type="number"
                  min={1}
                  max={hitdie ?? undefined}
                  value={baseHp}
                  onChange={(e) => setBaseHp(e.target.value)}
                  style={{
                    width: 120,
                    padding: '0.5rem',
                    borderRadius: 4,
                    border: '1px solid #3d3530',
                    background: '#1a1614',
                    color: '#e8e0d5',
                  }}
                />
                <span style={{ color: '#d4c4a8' }}>{hitdie ? `d${hitdie}` : 'No hit die'}</span>
              </div>
              <p style={{ color: '#8a7f72', margin: '0.4rem 0 0' }}>
                Constitution {conScore}: {formatModifier(conMod)}
                {hitPoints != null && (
                  <>
                    {' '}
                    · Hit points {hitPoints}
                    {Number(baseHp) + conMod < 1 ? ' (at least 1)' : ''}
                  </>
                )}
              </p>
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
