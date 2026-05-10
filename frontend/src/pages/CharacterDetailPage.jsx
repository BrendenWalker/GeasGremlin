import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getCharacter,
  getRaces,
  getClasses,
  getSpells,
  getItems,
  updateCharacter,
  addCharacterItem,
  removeCharacterItem,
  learnCharacterSpell,
  setCharacterSpellMemorized,
  castCharacterSpell,
  getParty,
  getCharacterCommands,
  markCommandRead,
  createTransfer,
  getCharacterTransfers,
  updateTransfer,
} from '../api/api';

const TAB_IDS_GM = ['info', 'combat', 'spellbook', 'inventory'];
const TAB_IDS_PLAYER = ['info', 'combat', 'spellbook', 'inventory', 'adventuring'];
const STAT_KEYS = ['str', 'int', 'wis', 'dex', 'con', 'chr'];
const INPUT_STYLE = {
  width: '100%',
  padding: '0.5rem',
  borderRadius: 4,
  border: '1px solid #3d3530',
  background: '#1a1614',
  color: '#e8e0d5',
};

function moneyToCoins(cp) {
  const c = cp || 0;
  const pp = Math.floor(c / 1000);
  const rest1 = c % 1000;
  const gp = Math.floor(rest1 / 100);
  const rest2 = rest1 % 100;
  const sp = Math.floor(rest2 / 10);
  const co = rest2 % 10;
  return { pp, gp, sp, cp: co };
}

function coinsDisplay(cp) {
  const { pp, gp, sp, cp: co } = moneyToCoins(cp);
  const parts = [];
  if (pp) parts.push(`${pp} PP`);
  if (gp) parts.push(`${gp} GP`);
  if (sp) parts.push(`${sp} SP`);
  if (co) parts.push(`${co} CP`);
  return parts.length ? parts.join(', ') : '0 CP';
}

export default function CharacterDetailPage({ playerMode = false }) {
  const { id } = useParams();
  const [character, setCharacter] = useState(null);
  const [races, setRaces] = useState([]);
  const [classes, setClasses] = useState([]);
  const [allSpells, setAllSpells] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const TAB_IDS = playerMode ? TAB_IDS_PLAYER : TAB_IDS_GM;
  const [activeTab, setActiveTab] = useState('info');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [spellModal, setSpellModal] = useState(false);
  const [addItemModal, setAddItemModal] = useState(false);
  const [hpAdjust, setHpAdjust] = useState(null);
  const [party, setParty] = useState([]);
  const [sendStuffModal, setSendStuffModal] = useState(false);
  const [sendStuffRecipient, setSendStuffRecipient] = useState(null);
  const [sendStuffItems, setSendStuffItems] = useState([]);
  const [sendStuffGold, setSendStuffGold] = useState(0);
  const [incomingTransfers, setIncomingTransfers] = useState([]);

  const refreshCharacter = useCallback(() => {
    return getCharacter(id)
      .then((r) => setCharacter(r.data))
      .catch((err) => setError(err.response?.data?.error || err.message));
  }, [id]);

  useEffect(() => {
    if (!playerMode || !character?.campaign_ids?.length) return;
    const campaignId = character.campaign_ids[0];
    getParty(campaignId)
      .then((r) => setParty(r.data || []))
      .catch(() => setParty([]));
  }, [playerMode, character?.id, character?.campaign_ids?.[0]]);

  useEffect(() => {
    if (!playerMode || !id) return;
    const interval = setInterval(() => {
      getCharacterCommands(id)
        .then((r) => {
          const cmds = r.data || [];
          cmds.forEach((cmd) => {
            markCommandRead(cmd.id).catch(() => {});
            refreshCharacter();
          });
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [playerMode, id, refreshCharacter]);

  useEffect(() => {
    if (!playerMode || !id) return;
    getCharacterTransfers(id, 'incoming')
      .then((r) => setIncomingTransfers((r.data || []).filter((t) => t.status === 'pending')))
      .catch(() => {});
  }, [playerMode, id]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      getCharacter(id).then((r) => r.data),
      getRaces().then((r) => r.data || []),
      getClasses().then((r) => r.data || []),
      getSpells().then((r) => r.data || []),
      getItems().then((r) => r.data || []),
    ])
      .then(([char, r, c, sp, it]) => {
        setCharacter(char);
        setForm({
          name: char.name,
          level: char.level,
          xp: char.xp,
          hp: char.hp,
          ac: char.ac,
          str: char.str,
          int: char.int,
          wis: char.wis,
          dex: char.dex,
          con: char.con,
          chr: char.chr,
          race: char.race,
          class: char.class,
          notes: char.notes,
          money: char.money,
          gender: char.gender,
          age: char.age,
          hair: char.hair,
          eyes: char.eyes,
          height: char.height,
          weight: char.weight,
          move: char.move,
          languages: char.languages,
        });
        setRaces(r);
        setClasses(c);
        setAllSpells(sp);
        setAllItems(it);
      })
      .catch((err) => {
        const data = err.response?.data;
        let msg = 'Failed to fetch character';
        if (data && typeof data === 'object') {
          const parts = [data.error, data.detail, data.code, data.hint].filter(Boolean);
          if (data.debug && typeof data.debug === 'object') parts.push('Debug: ' + JSON.stringify(data.debug));
          if (parts.length) msg = parts.join(' — ');
          else if (Object.keys(data).length) msg = JSON.stringify(data);
        } else if (err.message) msg = err.message;
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = (e) => {
    e.preventDefault();
    setSaving(true);
    updateCharacter(id, form)
      .then((r) => {
        setCharacter(r.data);
        setEditing(false);
      })
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setSaving(false));
  };

  const handleEquip = (slot, characterItemId) => {
    const key = {
      melee_primary: 'equipped_melee_primary_id',
      melee_secondary: 'equipped_melee_secondary_id',
      ranged: 'equipped_ranged_id',
      armor: 'equipped_armor_id',
      shield: 'equipped_shield_id',
    }[slot];
    if (!key) return;
    updateCharacter(id, { [key]: characterItemId ? parseInt(characterItemId, 10) : null })
      .then((r) => setCharacter(r.data))
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  const handleLearnSpell = (spellId, memorized = 0) => {
    learnCharacterSpell(id, { spell_id: spellId, memorized })
      .then(() => { setSpellModal(false); refreshCharacter(); })
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  const handleSetMemorized = (spellId, memorized) => {
    setCharacterSpellMemorized(id, spellId, memorized)
      .then(() => refreshCharacter())
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  const handleCastSpell = (spellId) => {
    castCharacterSpell(id, spellId)
      .then(() => refreshCharacter())
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  const handleAddItem = (itemId, quantity = 1) => {
    addCharacterItem(id, { item_id: itemId, quantity })
      .then(() => { setAddItemModal(false); refreshCharacter(); })
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  const handleRemoveItem = (itemId, oneOnly) => {
    removeCharacterItem(id, itemId, oneOnly)
      .then(() => refreshCharacter())
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  const handleHpChange = (delta) => {
    const newHp = Math.max(0, (character.hp ?? 0) + delta);
    updateCharacter(id, { hp: newHp })
      .then((r) => { setCharacter(r.data); setHpAdjust(null); })
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  if (loading && !character) {
    return <div className="card"><p style={{ color: '#8a7f72' }}>Loading…</p></div>;
  }
  if (error && !character) {
    return (
      <div className="card">
        <p style={{ color: '#c95858' }}>{error}</p>
        <Link to="/campaigns" className="btn btn-secondary">Back to Campaigns</Link>
      </div>
    );
  }
  if (!character) return null;

  const statBlock = STAT_KEYS.map((k) => ({ label: k.toUpperCase(), val: character[k], key: k }));
  const weapons = (character.items || []).filter(
    (i) => i.item_attackbonus != null || i.item_damage
  );
  const armors = (character.items || []).filter(
    (i) => i.item_ac != null || i.item_ac_melee != null
  );
  const spellsByLevel = {};
  (character.spells || []).forEach((s) => {
    const lvl = s.spell_level ?? 0;
    if (!spellsByLevel[lvl]) spellsByLevel[lvl] = [];
    spellsByLevel[lvl].push(s);
  });
  const knownSpellIds = new Set((character.spells || []).filter((s) => s.known).map((s) => s.spell_id));

  return (
    <div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <Link to={playerMode ? '/play' : (character.campaign_ids?.length ? `/campaigns/${character.campaign_ids[0]}/characters` : '/campaigns')} style={{ color: '#8a7f72', textDecoration: 'none' }}>← Back</Link>
          <h2 style={{ margin: 0 }}>{character.name}</h2>
          {character.race_name && <span style={{ color: '#b8b0a0' }}>{character.race_name}</span>}
          {character.class_name && <span style={{ color: '#b8b0a0' }}>{character.class_name}</span>}
          <span style={{ color: '#8a7f72' }}>Level {character.level ?? 1} · XP {character.xp ?? 0}</span>
          {character.next_level_xp != null && (
            <span style={{ color: '#8a7f72' }}>· Next level at {character.next_level_xp} XP</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          {TAB_IDS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ textTransform: 'capitalize' }}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: '#c95858', marginBottom: '0.5rem' }}>{error}</p>}

      {activeTab === 'info' && (
        <div className="card">
          {editing ? (
            <>
              <h2>Edit character</h2>
              <form onSubmit={handleSave}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                  {['name', 'level', 'xp', 'hp', 'ac'].map((key) => (
                    <div key={key}>
                      <label style={{ display: 'block', marginBottom: 2 }}>{key.toUpperCase()}</label>
                      <input
                        value={form[key] ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: key === 'name' ? e.target.value : (parseInt(e.target.value, 10) || null) }))}
                        type={key === 'name' ? 'text' : 'number'}
                        min={key !== 'name' ? 0 : undefined}
                        style={INPUT_STYLE}
                      />
                    </div>
                  ))}
                  <div>
                    <label style={{ display: 'block', marginBottom: 2 }}>Money (copper)</label>
                    <input
                      type="number"
                      min={0}
                      value={form.money ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, money: parseInt(e.target.value, 10) || null }))}
                      style={INPUT_STYLE}
                    />
                  </div>
                  {['gender', 'age', 'hair', 'eyes', 'height', 'weight', 'move', 'languages'].map((key) => (
                    <div key={key}>
                      <label style={{ display: 'block', marginBottom: 2 }}>{key.replace(/_/g, ' ')}</label>
                      <input
                        value={form[key] ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                        type={key === 'age' ? 'number' : 'text'}
                        style={INPUT_STYLE}
                      />
                    </div>
                  ))}
                  <div>
                    <label style={{ display: 'block', marginBottom: 2 }}>Race</label>
                    <select value={form.race ?? ''} onChange={(e) => setForm((f) => ({ ...f, race: e.target.value ? parseInt(e.target.value, 10) : null }))} style={INPUT_STYLE}>
                      <option value="">—</option>
                      {races.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 2 }}>Class</label>
                    <select value={form.class ?? ''} onChange={(e) => setForm((f) => ({ ...f, class: e.target.value ? parseInt(e.target.value, 10) : null }))} style={INPUT_STYLE}>
                      <option value="">—</option>
                      {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', marginBottom: 2 }}>STR INT WIS DEX CON CHR</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {STAT_KEYS.map((key) => (
                      <input
                        key={key}
                        type="number"
                        placeholder={key.toUpperCase()}
                        value={form[key] ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: parseInt(e.target.value, 10) || null }))}
                        style={{ width: 48, padding: '0.5rem', borderRadius: 4, border: '1px solid #3d3530', background: '#1a1614', color: '#e8e0d5' }}
                      />
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', marginBottom: 2 }}>Notes</label>
                  <textarea value={form.notes || ''} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...INPUT_STYLE, width: '100%' }} />
                </div>
                <button type="submit" className="btn btn-primary" disabled={saving}>Save</button>
                <button type="button" className="btn btn-secondary" style={{ marginLeft: '0.5rem' }} onClick={() => setEditing(false)}>Cancel</button>
              </form>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h2>Info</h2>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>Edit</button>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                {statBlock.map(({ label, val }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: '#8a7f72' }}>{label}</div>
                    <div style={{ fontSize: '1.25rem', color: '#c9a227' }}>{val ?? '—'}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <span>HP {character.hp ?? '—'}</span>
                <span>AC {character.ac ?? '—'}</span>
                <span>Money {coinsDisplay(character.money)}</span>
              </div>
              {(character.gender || character.age || character.hair || character.eyes || character.height || character.weight) && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #3d3530' }}>
                  <strong>Demographics</strong>
                  <p style={{ color: '#b8b0a0', marginTop: 4 }}>
                    {[character.gender, character.age ? `Age ${character.age}` : null, character.hair, character.eyes, character.height, character.weight].filter(Boolean).join(' · ')}
                  </p>
                </div>
              )}
              {(character.move || character.languages) && (
                <div style={{ marginTop: '0.5rem' }}>
                  <strong>Move / Languages</strong>
                  <p style={{ color: '#b8b0a0', marginTop: 4 }}>{[character.move, character.languages].filter(Boolean).join(' · ')}</p>
                </div>
              )}
              {character.notes && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #3d3530' }}>
                  <strong>Notes</strong>
                  <p style={{ whiteSpace: 'pre-wrap', color: '#b8b0a0', marginTop: 4 }}>{character.notes}</p>
                </div>
              )}
              {(character.race_name || character.class_name) && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #3d3530' }}>
                  <strong>Race / Class</strong>
                  <p style={{ color: '#b8b0a0', marginTop: 4 }}>
                    {races.find((r) => r.id === character.race)?.description && <span>{races.find((r) => r.id === character.race).description.slice(0, 200)}… </span>}
                    {classes.find((c) => c.id === character.class)?.description && <span>{classes.find((c) => c.id === character.class).description.slice(0, 200)}…</span>}
                  </p>
                </div>
              )}
            </>
          )}
          {hpAdjust === 'damage' && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#252019', borderRadius: 6 }}>
              <p>Take damage: subtract HP</p>
              <input type="number" min={0} id="hp-damage" placeholder="Amount" style={{ ...INPUT_STYLE, width: 80, marginRight: 8 }} />
              <button type="button" className="btn btn-primary" onClick={() => { const v = parseInt(document.getElementById('hp-damage')?.value, 10); if (!Number.isNaN(v)) handleHpChange(-v); }}>Apply</button>
              <button type="button" className="btn btn-secondary" style={{ marginLeft: 4 }} onClick={() => setHpAdjust(null)}>Cancel</button>
            </div>
          )}
          {hpAdjust === 'heal' && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#252019', borderRadius: 6 }}>
              <p>Heal: add HP</p>
              <input type="number" min={0} id="hp-heal" placeholder="Amount" style={{ ...INPUT_STYLE, width: 80, marginRight: 8 }} />
              <button type="button" className="btn btn-primary" onClick={() => { const v = parseInt(document.getElementById('hp-heal')?.value, 10); if (!Number.isNaN(v)) handleHpChange(v); }}>Apply</button>
              <button type="button" className="btn btn-secondary" style={{ marginLeft: 4 }} onClick={() => setHpAdjust(null)}>Cancel</button>
            </div>
          )}
          {!editing && !hpAdjust && (
            <div style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" style={{ marginRight: 8 }} onClick={() => setHpAdjust('damage')}>Take damage</button>
              <button type="button" className="btn btn-secondary" onClick={() => setHpAdjust('heal')}>Heal</button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'combat' && (
        <div className="card">
          <h2>Combat</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Melee primary</label>
              <select
                value={character.equipped_melee_primary_id ?? ''}
                onChange={(e) => handleEquip('melee_primary', e.target.value)}
                style={INPUT_STYLE}
              >
                <option value="">— None</option>
                {weapons.map((i) => (
                  <option key={i.id} value={i.id}>{i.name || i.item_name} × {i.quantity}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Melee secondary</label>
              <select
                value={character.equipped_melee_secondary_id ?? ''}
                onChange={(e) => handleEquip('melee_secondary', e.target.value)}
                style={INPUT_STYLE}
              >
                <option value="">— None</option>
                {weapons.map((i) => (
                  <option key={i.id} value={i.id}>{i.name || i.item_name} × {i.quantity}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Ranged</label>
              <select
                value={character.equipped_ranged_id ?? ''}
                onChange={(e) => handleEquip('ranged', e.target.value)}
                style={INPUT_STYLE}
              >
                <option value="">— None</option>
                {weapons.map((i) => (
                  <option key={i.id} value={i.id}>{i.name || i.item_name} × {i.quantity}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Armor</label>
              <select
                value={character.equipped_armor_id ?? ''}
                onChange={(e) => handleEquip('armor', e.target.value)}
                style={INPUT_STYLE}
              >
                <option value="">— None</option>
                {armors.map((i) => (
                  <option key={i.id} value={i.id}>{i.name || i.item_name} × {i.quantity}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Shield</label>
              <select
                value={character.equipped_shield_id ?? ''}
                onChange={(e) => handleEquip('shield', e.target.value)}
                style={INPUT_STYLE}
              >
                <option value="">— None</option>
                {armors.map((i) => (
                  <option key={i.id} value={i.id}>{i.name || i.item_name} × {i.quantity}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <strong>AC</strong> {character.ac ?? '—'}
          </div>
          {character.abilities?.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <strong>Abilities</strong>
              <ul style={{ listStyle: 'none', marginTop: 4 }}>
                {character.abilities.map((a) => (
                  <li key={`${a.character_id}-${a.ability_id}`} style={{ color: '#b8b0a0' }}>{a.ability_description}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {activeTab === 'spellbook' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>Spellbook</h2>
            <button type="button" className="btn btn-primary" onClick={() => setSpellModal(true)}>Learn spell</button>
          </div>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((lvl) => {
            const list = spellsByLevel[lvl] || [];
            if (list.length === 0) return null;
            return (
              <div key={lvl} style={{ marginBottom: '1rem' }}>
                <h3 style={{ marginBottom: '0.5rem' }}>Level {lvl}</h3>
                <ul style={{ listStyle: 'none' }}>
                  {list.map((s) => (
                    <li key={s.spell_id} style={{ padding: '0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <strong>{s.spell_name}</strong>
                      <span style={{ color: '#8a7f72' }}>Memorized:</span>
                      <input
                        type="number"
                        min={0}
                        value={s.memorized ?? 0}
                        onChange={(e) => handleSetMemorized(s.spell_id, parseInt(e.target.value, 10) || 0)}
                        style={{ width: 48, ...INPUT_STYLE }}
                      />
                      <button type="button" className="btn btn-secondary" size="small" onClick={() => handleCastSpell(s.spell_id)} disabled={!(s.memorized > 0)}>Cast</button>
                      {s.spell_description && <span style={{ color: '#8a7f72', fontSize: '0.9rem' }}>— {s.spell_description.slice(0, 60)}…</span>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {Object.keys(spellsByLevel).length === 0 && <p style={{ color: '#8a7f72' }}>No spells learned. Use “Learn spell” to add from your class list.</p>}
          {spellModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSpellModal(false)}>
              <div className="card" style={{ maxWidth: 400, maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                <h3>Learn spell</h3>
                <p style={{ color: '#8a7f72', fontSize: '0.9rem' }}>Choose a spell to learn (class-agnostic list).</p>
                <ul style={{ listStyle: 'none', maxHeight: 300, overflow: 'auto' }}>
                  {allSpells.filter((s) => !knownSpellIds.has(s.id)).map((s) => (
                    <li key={s.id} style={{ padding: '0.25rem 0' }}>
                      <button type="button" className="btn btn-secondary" style={{ width: '100%', textAlign: 'left' }} onClick={() => handleLearnSpell(s.id)}>
                        {s.name}
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn btn-secondary" onClick={() => setSpellModal(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'inventory' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>Inventory</h2>
            <button type="button" className="btn btn-primary" onClick={() => setAddItemModal(true)}>Add item</button>
          </div>
          {character.items?.length > 0 && (
            <ul style={{ listStyle: 'none' }}>
              {character.items.map((i) => (
                <li
                  key={i.id}
                  style={{
                    padding: '0.5rem 0',
                    borderBottom: '1px solid #3d3530',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <span>{i.name || i.item_name} × {i.quantity ?? 1}</span>
                  <span style={{ color: '#8a7f72' }}>
                    {i.item_weight != null && `${i.item_weight} lb`}
                    {i.item_damage && ` · ${i.item_damage}`}
                    {i.item_ac != null && ` · AC ${i.item_ac}`}
                  </span>
                  <span>
                    <button type="button" className="btn btn-secondary" style={{ marginRight: 4 }} onClick={() => handleRemoveItem(i.id, true)}>Drop 1</button>
                    <button type="button" className="btn btn-danger" onClick={() => handleRemoveItem(i.id, false)}>Drop all</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(!character.items || character.items.length === 0) && <p style={{ color: '#8a7f72' }}>No items. Add items from the reference list.</p>}
          {addItemModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setAddItemModal(false)}>
              <div className="card" style={{ maxWidth: 400, maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                <h3>Add item</h3>
                <ul style={{ listStyle: 'none', maxHeight: 300, overflow: 'auto' }}>
                  {allItems.map((it) => (
                    <li key={it.id} style={{ padding: '0.25rem 0' }}>
                      <button type="button" className="btn btn-secondary" style={{ width: '100%', textAlign: 'left' }} onClick={() => handleAddItem(it.id)}>
                        {it.name} {it.price != null && `(${coinsDisplay(it.price)})`}
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn btn-secondary" onClick={() => setAddItemModal(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {playerMode && activeTab === 'adventuring' && (
        <div className="card">
          <h2>Adventuring notes</h2>
          <textarea
            value={form.notes || ''}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            onBlur={() => {
              if (form.notes !== character?.notes) {
                updateCharacter(id, { notes: form.notes }).then((r) => setCharacter(r.data)).catch(() => {});
              }
            }}
            rows={8}
            style={{ ...INPUT_STYLE, width: '100%' }}
            placeholder="Session notes, discoveries…"
          />
        </div>
      )}

      {playerMode && party.length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Party</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {party.filter((p) => p.id !== character?.id).map((p) => (
              <li key={p.id} style={{ padding: '0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span><strong>{p.name}</strong> ({p.user}) · HP {p.hp ?? '—'}</span>
                <button type="button" className="btn btn-secondary" onClick={() => { setSendStuffRecipient(p); setSendStuffModal(true); }}>Send stuff</button>
              </li>
            ))}
          </ul>
          {incomingTransfers.length > 0 && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #3d3530' }}>
              <strong>Incoming</strong>
              {incomingTransfers.map((t) => (
                <div key={t.id} style={{ marginTop: 4 }}>
                  From {t.from_name} ({t.from_user}): {t.gold_cp > 0 && `${t.gold_cp} cp`} {t.payload?.items?.length ? ` · ${t.payload.items.length} item(s)` : ''}
                  <button type="button" className="btn btn-primary" style={{ marginLeft: 8 }} onClick={() => updateTransfer(t.id, 'accepted').then(() => { refreshCharacter(); getCharacterTransfers(id, 'incoming').then((r) => setIncomingTransfers((r.data || []).filter((x) => x.status === 'pending'))); })}>Accept</button>
                  <button type="button" className="btn btn-secondary" style={{ marginLeft: 4 }} onClick={() => updateTransfer(t.id, 'rejected').then(() => setIncomingTransfers((prev) => prev.filter((x) => x.id !== t.id)))}>Reject</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {playerMode && sendStuffModal && sendStuffRecipient && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => { setSendStuffModal(false); setSendStuffRecipient(null); setSendStuffItems([]); setSendStuffGold(0); }}>
          <div className="card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3>Send stuff to {sendStuffRecipient.name}</h3>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: 4 }}>Gold (copper)</label>
              <input type="number" min={0} value={sendStuffGold} onChange={(e) => setSendStuffGold(parseInt(e.target.value, 10) || 0)} style={INPUT_STYLE} />
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: 4 }}>Items (add from inventory)</label>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {sendStuffItems.map((it) => (
                  <li key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {it.name || it.item_name} × {it.quantity ?? 1}
                    <button type="button" className="btn btn-secondary" onClick={() => setSendStuffItems((prev) => prev.filter((x) => x.id !== it.id))}>Remove</button>
                  </li>
                ))}
              </ul>
              <select
                style={INPUT_STYLE}
                value=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  const item = character?.items?.find((i) => `${i.id}` === val);
                  if (item && !sendStuffItems.find((i) => i.id === item.id)) setSendStuffItems((prev) => [...prev, { ...item, quantity: 1 }]);
                }}
              >
                <option value="">— Add item</option>
                {(character?.items || []).map((i) => (
                  <option key={i.id} value={i.id}>{i.name || i.item_name} × {i.quantity ?? 1}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={(sendStuffGold <= 0 && sendStuffItems.length === 0)}
                onClick={() => {
                  const gold_cp = sendStuffGold || 0;
                  const items = sendStuffItems.map((it) => ({ character_item_id: it.id, quantity: it.quantity ?? 1 }));
                  if (gold_cp <= 0 && items.length === 0) return;
                  createTransfer(id, { to_character_id: sendStuffRecipient.id, gold_cp, items })
                    .then(() => { setSendStuffModal(false); setSendStuffRecipient(null); setSendStuffItems([]); setSendStuffGold(0); })
                    .catch((err) => setError(err.response?.data?.error || err.message));
                }}
              >
                Send
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setSendStuffModal(false); setSendStuffRecipient(null); setSendStuffItems([]); setSendStuffGold(0); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
