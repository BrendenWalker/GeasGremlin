import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getCharacter,
  getRaces,
  getClasses,
  getSpells,
  getItems,
  updateCharacter,
  adjustCharacterHitPoints,
  addCharacterItem,
  removeCharacterItem,
  learnCharacterSpell,
  setCharacterSpellIntend,
  castCharacterSpell,
  getParty,
  getCharacterCommands,
  markCommandRead,
  createTransfer,
  getCharacterTransfers,
  updateTransfer,
  postPresence,
  getCampaignHere,
  getCharacterShops,
  buyFromShop,
  sellToShop,
} from '../api/api';
import { useAuth } from '../components/AuthContext';
import { useRuleset } from '../components/RulesetContext';
import { acceptTransfer, castTabs, characterHasSpellbook, circleSpellList, commandWrite, finishLevelUp, formatModifier, inventoryTabs, itemsOnTab, labelHeldItems, learnableSpells, memorizeWithinCap, openMechanic, primaryClass, savingThrowTargets } from '../domain/character.mjs';
import { commandReceipt } from '../domain/notices.mjs';
import { useNotices } from '../components/NoticeContext';
import { formatItemPrice } from '../domain/itemPrice.mjs';

const INPUT_STYLE = {
  width: '100%',
  padding: '0.5rem',
  borderRadius: 4,
  border: '1px solid #3d3530',
  background: '#1a1614',
  color: '#e8e0d5',
};

const DESC_FIELDS = [
  { key: 'gender', label: 'Sex', type: 'text' },
  { key: 'age', label: 'Age', type: 'number' },
  { key: 'height', label: 'Height', type: 'text' },
  { key: 'weight', label: 'Weight', type: 'text' },
  { key: 'hair', label: 'Hair', type: 'text' },
  { key: 'eyes', label: 'Eyes', type: 'text' },
  { key: 'languages', label: 'Languages', type: 'text' },
];

const SAVE_ROWS = [
  { stat: 'Death Ray or Poison', label: 'Death Ray or Poison' },
  { stat: 'Magic Wands', label: 'Magic Wands' },
  { stat: 'Paralysis or Petrify', label: 'Paralysis or Turn to Stone' },
  { stat: 'Dragon Breath', label: 'Dragon Breath' },
  { stat: 'Spells', label: 'Rods, Staves, and Spells' },
];

function sheetForm(char) {
  return {
    name: char.name,
    level: char.level,
    xp: char.xp,
    hp: char.hp,
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
    languages: char.languages,
  };
}

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

function percentLabel(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return '';
  return `${n > 0 ? '+' : ''}${n}%`;
}

function wholeQty(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 ? n : null;
}

function ShopVisit({ board, busy, onBuy, onSell }) {
  const [shopId, setShopId] = useState(null);
  const [categoryId, setCategoryId] = useState(null);
  const [quantity, setQuantity] = useState('1');
  if (!board) return null;
  const shops = board.shops || [];
  const shop = shops.find((row) => String(row.id) === String(shopId)) || null;
  const activeCategory = shop?.categories?.find((cat) => String(cat.id) === String(categoryId))
    || shop?.categories?.[0]
    || null;
  const items = (shop?.items || []).filter((item) => (
    !activeCategory || String(item.category_id) === String(activeCategory.id)
  ));
  const qty = wholeQty(quantity);
  const openShop = (id) => {
    const next = shops.find((row) => String(row.id) === String(id));
    setShopId(id);
    setCategoryId(next?.categories?.[0]?.id ?? null);
  };

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Shops</h2>
      {board.location_name ? <p className="muted">At {board.location_name}.</p> : null}
      {shops.length === 0 && <p className="muted">No shops here.</p>}
      {shops.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {shops.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`btn ${String(row.id) === String(shopId) ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => openShop(row.id)}
            >
              {row.name}
            </button>
          ))}
        </div>
      )}
      {shop && (
        <>
          <p className="muted">
            Buy {percentLabel(shop.buy_cost_delta)} · Sell {percentLabel(shop.sell_cost_delta)}
          </p>
          <label style={{ display: 'block', marginBottom: 8 }}>
            Quantity
            <input
              type="number"
              min={1}
              value={quantity}
              aria-label="Shop quantity"
              onChange={(e) => setQuantity(e.target.value)}
              style={{ ...INPUT_STYLE, width: 80, marginLeft: 6 }}
            />
          </label>
          {(shop.categories || []).length > 1 && (
            <div className="catalog-tabs" role="tablist" aria-label="Shop categories">
              {shop.categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={String(cat.id) === String(activeCategory?.id)}
                  className={`catalog-tab${String(cat.id) === String(activeCategory?.id) ? ' active' : ''}`}
                  onClick={() => setCategoryId(cat.id)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}
          {items.length === 0 && <p className="muted">Nothing for sale.</p>}
          {items.length > 0 && (
            <ul style={{ listStyle: 'none', maxHeight: 280, overflow: 'auto', padding: 0 }}>
              {items.map((item) => (
                <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '0.25rem 0', alignItems: 'center' }}>
                  <span>{item.name} <span className="muted">({formatItemPrice(item.buy_price)})</span></span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.2rem 0.5rem' }}
                    disabled={busy || qty == null}
                    onClick={() => onBuy(shop.id, item.id, qty)}
                  >
                    Buy
                  </button>
                </li>
              ))}
            </ul>
          )}
          <h3>Sell</h3>
          {(shop.sellable || []).length === 0 && <p className="muted">Nothing here this shop will buy.</p>}
          {(shop.sellable || []).length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {shop.sellable.map((item) => (
                <li key={item.character_item_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '0.25rem 0', alignItems: 'center' }}>
                  <span>
                    {item.name} × {item.quantity}
                    <span className="muted"> ({formatItemPrice(item.sell_price)})</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.2rem 0.5rem' }}
                    disabled={busy || qty == null}
                    onClick={() => onSell(shop.id, item.character_item_id, qty)}
                  >
                    Sell
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// ponytail: PUT /characters returns the row only. Keep lists from GET until that response includes them.
function keepLoadedLists(prev, row) {
  return {
    ...(prev || {}),
    ...row,
    items: prev?.items ?? [],
    spells: prev?.spells ?? [],
    abilities: prev?.abilities ?? [],
    effects: prev?.effects ?? [],
    spells_cast: prev?.spells_cast ?? [],
    next_level_xp: prev?.next_level_xp ?? null,
  };
}

function itemLabel(command, items) {
  if (command?.type !== 'give_item') return null;
  const row = (items || []).find((item) => String(item.id) === String(command.payload?.item_id));
  if (!row?.name) return null;
  const quantity = Number(command.payload?.quantity);
  if (Number.isInteger(quantity) && quantity > 1) return `${row.name} × ${quantity}`;
  return row.name;
}

export default function CharacterDetailPage({ playerMode = false }) {
  const { id, campaignId } = useParams();
  const { user } = useAuth();
  const { notify } = useNotices();
  const { rulesets, error: rulesetError } = useRuleset();
  const [character, setCharacter] = useState(null);
  const [races, setRaces] = useState([]);
  const [classes, setClasses] = useState([]);
  const [allSpells, setAllSpells] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [spellModal, setSpellModal] = useState(false);
  const [spellCircle, setSpellCircle] = useState(1);
  const [hideUnavailable, setHideUnavailable] = useState(false);
  const [addItemModal, setAddItemModal] = useState(false);
  const [itemTab, setItemTab] = useState(null);
  const [addItemTab, setAddItemTab] = useState(null);
  const [hpAdjust, setHpAdjust] = useState(null);
  const [party, setParty] = useState([]);
  const [sendStuffModal, setSendStuffModal] = useState(false);
  const [sendStuffRecipient, setSendStuffRecipient] = useState(null);
  const [sendStuffItems, setSendStuffItems] = useState([]);
  const [sendStuffGold, setSendStuffGold] = useState(0);
  const [incomingTransfers, setIncomingTransfers] = useState([]);
  const classesRef = useRef([]);
  const itemsRef = useRef([]);
  const notifyRef = useRef(notify);
  const applyingRef = useRef(false);
  const levelUpRef = useRef(null);
  const [levelUp, setLevelUp] = useState(null);
  const [shopBoard, setShopBoard] = useState(null);
  const [shopBusy, setShopBusy] = useState(false);
  const [here, setHere] = useState(null);
  classesRef.current = classes;
  itemsRef.current = allItems;
  notifyRef.current = notify;
  levelUpRef.current = levelUp;

  const refreshCharacter = useCallback(() => {
    return getCharacter(id)
      .then((r) => setCharacter(r.data))
      .catch((err) => setError(err.response?.data?.error || err.message));
  }, [id]);

  const shopKey = playerMode && campaignId
    ? `${character?.money ?? ''}:${(character?.items || []).map((item) => `${item.id}:${item.quantity}:${item.bonus ?? 0}:${item.value ?? 0}`).join(',')}:${character?.equipped_melee_primary_id ?? ''}:${character?.equipped_melee_secondary_id ?? ''}:${character?.equipped_ranged_id ?? ''}:${character?.equipped_armor_id ?? ''}:${character?.equipped_shield_id ?? ''}`
    : '';

  useEffect(() => {
    if (!playerMode || !campaignId || !id) return undefined;
    let stopped = false;
    getCharacterShops(campaignId, id)
      .then((r) => { if (!stopped) setShopBoard(r.data); })
      .catch((err) => { if (!stopped) setError(err.response?.data?.error || err.message); });
    return () => { stopped = true; };
  }, [playerMode, campaignId, id, shopKey]);

  const runShop = (action) => {
    setShopBusy(true);
    setError(null);
    return action()
      .then(() => getCharacter(id))
      .then((r) => {
        setCharacter(r.data);
        setForm((f) => ({ ...f, money: r.data.money }));
      })
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setShopBusy(false));
  };

  useEffect(() => {
    if (!playerMode || !character?.campaign_ids?.length) return;
    const campaignId = character.campaign_ids[0];
    getParty(campaignId)
      .then((r) => setParty(r.data || []))
      .catch(() => setParty([]));
  }, [playerMode, character?.id, character?.campaign_ids?.[0]]);

  const presenceKey = (character?.campaign_ids || []).join(',');
  useEffect(() => {
    if (!playerMode || !campaignId || !character?.id || !user?.username) return undefined;
    const owns = String(character.user || '').toLowerCase() === user.username.toLowerCase();
    const inThis = (character.campaign_ids || []).some((cid) => String(cid) === String(campaignId));
    if (!owns || !inThis) return undefined;
    const ping = () => {
      postPresence(campaignId, Number(character.id)).catch(() => {});
    };
    ping();
    const interval = setInterval(ping, 10000);
    return () => clearInterval(interval);
  }, [playerMode, campaignId, character?.id, character?.user, user?.username, presenceKey]);

  useEffect(() => {
    if (!playerMode || !campaignId) return undefined;
    let stopped = false;
    const loadHere = () => {
      getCampaignHere(campaignId)
        .then((r) => { if (!stopped) setHere(r.data); })
        .catch(() => {});
    };
    loadHere();
    const interval = setInterval(loadHere, 10000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [playerMode, campaignId]);

  useEffect(() => {
    if (!playerMode || !id) return undefined;
    let stopped = false;
    const applyOne = async (cmd) => {
      const needsSheet = cmd.type === 'give_xp' || cmd.type === 'give_gold' || cmd.type === 'give_item'
        || cmd.type === 'new_day' || cmd.type === 'new_round';
      let write = {};
      let name = null;
      if (needsSheet) {
        if (cmd.type === 'give_xp' && classesRef.current.length === 0) return false;
        const loaded = await getCharacter(id);
        name = loaded.data?.name;
        write = commandWrite(loaded.data, classesRef.current, cmd);
        if (write.error) throw new Error(write.error);
        if (write.needsRolls) {
          if (!stopped) {
            const text = commandReceipt(name, cmd, itemLabel(cmd, itemsRef.current));
            if (text) notifyRef.current({ tone: 'success', text, source: `command:${cmd.id}` });
            setLevelUp({
              commandId: cmd.id,
              write,
              character: loaded.data,
              rolls: write.needsRolls.map(() => ''),
            });
          }
          return true;
        }
      }
      await markCommandRead(cmd.id, write);
      if (!stopped) {
        const text = commandReceipt(name, cmd, itemLabel(cmd, itemsRef.current));
        if (text) notifyRef.current({ tone: 'success', text, source: `command:${cmd.id}` });
        await refreshCharacter();
      }
      return false;
    };
    const tick = async () => {
      if (applyingRef.current || levelUpRef.current) return;
      applyingRef.current = true;
      try {
        const r = await getCharacterCommands(id);
        for (const cmd of r.data || []) {
          if (stopped) return;
          const paused = await applyOne(cmd);
          if (paused) return;
        }
      } catch (err) {
        const status = err.response?.status;
        if (!stopped && status !== 404) {
          const text = err.response?.data?.error || err.message;
          setError(text);
          notifyRef.current({ tone: 'error', text, source: 'command-apply' });
        }
      } finally {
        applyingRef.current = false;
      }
    };
    const interval = setInterval(tick, 5000);
    tick();
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [playerMode, id, refreshCharacter]);

  useEffect(() => {
    if (!playerMode || !id) return;
    getCharacterTransfers(id, 'incoming')
      .then((r) => setIncomingTransfers((r.data || []).filter((t) => t.status === 'pending')))
      .catch(() => {});
  }, [playerMode, id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCharacter(id)
      .then((r) => r.data)
      .then((char) => {
        if (cancelled) return null;
        // Lists follow this character's ruleset. The header selection is for browsing and new characters.
        return Promise.all([
          getRaces(char.ruleset_id).then((r) => r.data || []),
          getClasses(char.ruleset_id).then((r) => r.data || []),
          getSpells(char.ruleset_id).then((r) => r.data || []),
          getItems(char.ruleset_id).then((r) => r.data || []),
        ]).then(([races, classes, spells, items]) => [char, races, classes, spells, items]);
      })
      .then((loaded) => {
        if (cancelled || !loaded) return;
        const [char, r, c, sp, it] = loaded;
        setCharacter(char);
        setForm(sheetForm(char));
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
        if (!cancelled) setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  const handleSave = (e) => {
    e.preventDefault();
    setSaving(true);
    updateCharacter(id, form)
      .then((r) => {
        setCharacter((prev) => keepLoadedLists(prev, r.data));
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
      .then((r) => setCharacter((prev) => keepLoadedLists(prev, r.data)))
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  const handleLearnSpell = (spellId, memorized = 0) => {
    learnCharacterSpell(id, { spell_id: spellId, memorized })
      .then(() => { setSpellModal(false); refreshCharacter(); })
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  const handleSetIntend = (spellId, intend) => {
    setCharacterSpellIntend(id, spellId, intend)
      .then(() => refreshCharacter())
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  const handleCastSpell = (spellId) => {
    castCharacterSpell(id, spellId)
      .then(() => refreshCharacter())
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  const handleAddItem = (itemId, quantity = 1) => {
    const picked = allItems.find((item) => item.id === itemId);
    addCharacterItem(id, { item_id: itemId, quantity })
      .then(() => {
        setAddItemModal(false);
        if (picked) setItemTab(picked.category == null ? 'other' : String(picked.category));
        refreshCharacter();
      })
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  const handleRemoveItem = (itemId, oneOnly) => {
    removeCharacterItem(id, itemId, oneOnly)
      .then(() => refreshCharacter())
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  const handleLevelRolls = () => {
    if (!levelUp) return;
    const rolls = levelUp.rolls.map((value) => parseInt(value, 10));
    const finished = finishLevelUp(levelUp.write, levelUp.character, rolls);
    if (finished.error) {
      setError(finished.error);
      return;
    }
    setError(null);
    markCommandRead(levelUp.commandId, finished)
      .then(() => {
        setLevelUp(null);
        return refreshCharacter();
      })
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  const handleAcceptTransfer = (transfer) => {
    getCharacter(transfer.from_character_id)
      .then((fromRes) => {
        const write = acceptTransfer(fromRes.data, character, transfer);
        if (write.error) {
          setError(write.error);
          return null;
        }
        return updateTransfer(transfer.id, { status: 'accepted', ...write });
      })
      .then((result) => {
        if (!result) return null;
        return refreshCharacter();
      })
      .then(() => getCharacterTransfers(id, 'incoming'))
      .then((r) => {
        if (r) setIncomingTransfers((r.data || []).filter((row) => row.status === 'pending'));
      })
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  const handleHpChange = (delta) => {
    adjustCharacterHitPoints(id, delta)
      .then(() => refreshCharacter())
      .then(() => setHpAdjust(null))
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

  if (rulesetError) {
    return (
      <div className="card">
        <p style={{ color: '#c95858' }}>{rulesetError}</p>
        <Link to="/campaigns" className="btn btn-secondary">Back to Campaigns</Link>
      </div>
    );
  }
  if (!rulesets) {
    return <div className="card"><p style={{ color: '#8a7f72' }}>Loading…</p></div>;
  }

  const ruleset = rulesets.find((row) => String(row.id) === String(character.ruleset_id));
  if (!ruleset) {
    return (
      <div className="card">
        <p style={{ color: '#c95858' }}>This character&apos;s ruleset is not available.</p>
        <Link to="/campaigns" className="btn btn-secondary">Back to Campaigns</Link>
      </div>
    );
  }
  let mechanic;
  try {
    mechanic = openMechanic(ruleset);
  } catch (err) {
    return (
      <div className="card">
        <p style={{ color: '#c95858' }}>{err.message}</p>
        <Link to="/campaigns" className="btn btn-secondary">Back to Campaigns</Link>
      </div>
    );
  }

  const statBlock = mechanic.attributes.map((attr) => ({
    label: attr.name,
    val: character[attr.column],
    mod: formatModifier(mechanic.abilityModifier(character[attr.column])),
    key: attr.column,
  }));
  const combat = mechanic.sheetCombat(character, classes);
  const nextLevelXp = combat.nextLevelXp ?? character.next_level_xp;
  const weapons = (character.items || []).filter(
    (i) => i.item_attackbonus != null || i.item_damage
  );
  const armors = (character.items || []).filter(
    (i) => i.item_ac != null || i.item_ac_melee != null
  );
  const knownSpellIds = new Set((character.spells || []).filter((s) => s.known).map((s) => s.spell_id));
  const spellTabs = castTabs(character.character_classes, classes);
  const activeSpellTab = spellTabs.find((tab) => tab.circle === spellCircle) || spellTabs[0] || null;
  const labeledItems = labelHeldItems(character.items, allItems);
  const heldTabs = inventoryTabs(labeledItems);
  const activeHeld = heldTabs.find((tab) => tab.key === itemTab) || heldTabs[0] || null;
  const heldItems = activeHeld ? itemsOnTab(labeledItems, activeHeld.key) : [];
  const catalogTabs = inventoryTabs(allItems);
  const activeCatalog = catalogTabs.find((tab) => tab.key === addItemTab) || catalogTabs[0] || null;
  const catalogItems = activeCatalog ? itemsOnTab(allItems, activeCatalog.key) : [];
  const circleSpells = activeSpellTab
    ? circleSpellList(allSpells, character.spells, character.character_classes, classes, activeSpellTab.circle)
    : [];
  const intendHere = circleSpells.reduce((sum, spell) => sum + spell.intend, 0);
  const shownSpells = hideUnavailable ? circleSpells.filter((spell) => spell.memorized > 0) : circleSpells;
  const castableCircles = new Set();
  for (const tab of spellTabs) {
    const rows = tab.circle === activeSpellTab?.circle
      ? circleSpells
      : circleSpellList(allSpells, character.spells, character.character_classes, classes, tab.circle);
    if (rows.some((spell) => spell.memorized > 0)) castableCircles.add(tab.circle);
  }
  const showLearn = characterHasSpellbook(character.character_classes, classes);
  const learnChoices = learnableSpells(allSpells, character.character_classes, classes)
    .filter((spell) => !knownSpellIds.has(spell.id));
  const saveStats = new Set(SAVE_ROWS.map((row) => row.stat));
  const otherAbilities = (character.abilities || []).filter((ability) => !saveStats.has(ability.stat_name));
  const sheetClass = primaryClass(character, classes);
  const sheetRace = races.find((race) => String(race.id) === String(character.race));
  const saveTargets = savingThrowTargets(sheetClass.row?.abilities, sheetRace?.abilities, sheetClass.level);
  const sheetLocked = (character.campaign_ids || []).length > 0 && character.viewer_is_gm !== true;

  return (
    <div>
      <form onSubmit={handleSave}>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <Link to={playerMode && campaignId ? `/play/${campaignId}` : (character.campaign_ids?.length ? `/campaigns/${character.campaign_ids[0]}/characters` : '/campaigns')} style={{ color: '#8a7f72', textDecoration: 'none' }}>← Back</Link>
          {editing ? (
            <input
              value={form.name ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              aria-label="Name"
              style={{ ...INPUT_STYLE, maxWidth: 240, fontSize: '1.1rem' }}
            />
          ) : (
            <h2 style={{ margin: 0 }}>{character.name}</h2>
          )}
          <span style={{ color: '#b8b0a0' }}>{character.user}</span>
          {editing ? (
            <select aria-label="Race" value={form.race ?? ''} onChange={(e) => setForm((f) => ({ ...f, race: e.target.value ? parseInt(e.target.value, 10) : null }))} style={{ ...INPUT_STYLE, maxWidth: 160 }}>
              <option value="">Race</option>
              {races.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          ) : (
            character.race_name && <span style={{ color: '#b8b0a0' }}>{character.race_name}</span>
          )}
          {editing ? (
            <select aria-label="Class" value={form.class ?? ''} onChange={(e) => setForm((f) => ({ ...f, class: e.target.value ? parseInt(e.target.value, 10) : null }))} style={{ ...INPUT_STYLE, maxWidth: 160 }}>
              <option value="">Class</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            character.class_name && <span style={{ color: '#b8b0a0' }}>{character.class_name}</span>
          )}
          {editing ? (
            <>
              <label style={{ color: '#8a7f72' }}>
                Level
                <input
                  type="number"
                  min={0}
                  value={form.level ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, level: parseInt(e.target.value, 10) || null }))}
                  style={{ ...INPUT_STYLE, width: 72, marginLeft: 6 }}
                />
              </label>
              <label style={{ color: '#8a7f72' }}>
                XP
                <input
                  type="number"
                  min={0}
                  value={form.xp ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, xp: parseInt(e.target.value, 10) || null }))}
                  style={{ ...INPUT_STYLE, width: 96, marginLeft: 6 }}
                />
              </label>
            </>
          ) : (
            <span style={{ color: '#8a7f72' }}>
              Level {character.level ?? 1} · XP {character.xp ?? 0}
              {nextLevelXp != null && ` · Next level at ${nextLevelXp} XP`}
            </span>
          )}
          <span style={{ marginLeft: 'auto' }}>
            {sheetLocked ? (
              <span style={{ color: '#8a7f72' }}>The GM edits this sheet.</span>
            ) : editing ? (
              <>
                <button key="save" type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}>Save</button>
                <button key="cancel" type="button" className="btn btn-secondary" style={{ marginLeft: '0.5rem' }} onClick={() => { setForm(sheetForm(character)); setEditing(false); }}>Cancel</button>
              </>
            ) : (
              <button key="edit" type="button" className="btn btn-secondary" onClick={(e) => { e.preventDefault(); setEditing(true); }}>Edit</button>
            )}
          </span>
        </div>
      </div>

      {error && <p style={{ color: '#c95858', marginBottom: '0.5rem' }}>{error}</p>}

      <div className="card">
        <h2>Description</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
          {DESC_FIELDS.map((field) => (
            <div key={field.key}>
              <div style={{ fontSize: '0.75rem', color: '#8a7f72', marginBottom: 2 }}>{field.label}</div>
              {editing ? (
                <input
                  aria-label={field.label}
                  type={field.type}
                  min={field.type === 'number' ? 0 : undefined}
                  value={form[field.key] ?? ''}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    [field.key]: field.key === 'age'
                      ? (e.target.value === '' ? null : (parseInt(e.target.value, 10) || null))
                      : e.target.value,
                  }))}
                  style={INPUT_STYLE}
                />
              ) : (
                <div style={{ color: '#e8e0d5' }}>{character[field.key] || '—'}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(12rem, 1.2fr) 11rem minmax(11rem, 1fr) minmax(14rem, 1fr)', gap: '1rem', alignItems: 'stretch', marginBottom: '1rem' }}>
        <div className="card" style={{ marginBottom: 0, height: '100%' }}>
          <h2>Attributes</h2>
          {statBlock.map((stat, index) => (
            <div
              key={stat.key}
              style={{
                display: 'grid',
                gridTemplateColumns: '4.5rem 4.5rem 3rem',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.4rem 0',
                borderBottom: index < statBlock.length - 1 ? '1px solid #3d3530' : 'none',
              }}
            >
              <div style={{ color: '#8a7f72' }}>{stat.label}</div>
              {editing ? (
                <input
                  type="number"
                  aria-label={stat.label}
                  value={form[stat.key] ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [stat.key]: parseInt(e.target.value, 10) || null }))}
                  style={{ ...INPUT_STYLE, width: '100%', textAlign: 'right' }}
                />
              ) : (
                <div style={{ fontSize: '1.25rem', color: '#c9a227', textAlign: 'right' }}>{stat.val ?? '—'}</div>
              )}
              <div style={{ color: '#8a7f72', textAlign: 'right' }}>
                {formatModifier(mechanic.abilityModifier(editing ? form[stat.key] : character[stat.key]))}
              </div>
            </div>
          ))}
          {(combat.melee || combat.ranged || combat.damage) && (
            <div style={{ marginTop: '0.35rem', borderTop: '1px solid #3d3530' }}>
              {combat.melee && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.4rem 0' }}>
                  <div style={{ color: '#8a7f72' }}>Melee</div>
                  <div style={{ color: '#c9a227', textAlign: 'right' }}>{combat.melee}</div>
                </div>
              )}
              {combat.damage && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.4rem 0' }}>
                  <div style={{ color: '#8a7f72' }}>Damage</div>
                  <div style={{ color: '#c9a227', textAlign: 'right' }}>{combat.damage}</div>
                </div>
              )}
              {combat.ranged && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.4rem 0' }}>
                  <div style={{ color: '#8a7f72' }}>Ranged</div>
                  <div style={{ color: '#c9a227', textAlign: 'right' }}>{combat.ranged}</div>
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignSelf: 'start' }}>
          <div className="card" style={{ marginBottom: 0, textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: '#8a7f72' }}>HP</div>
            {editing ? (
              <input
                type="number"
                min={0}
                aria-label="Maximum HP"
                value={form.hp ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, hp: parseInt(e.target.value, 10) || null }))}
                style={{ ...INPUT_STYLE, width: '100%', marginTop: '0.35rem', textAlign: 'center', fontSize: '1.5rem' }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                <button type="button" className="btn btn-secondary" aria-label="Take damage" onClick={() => setHpAdjust('damage')} style={{ padding: '0.15rem 0.55rem', fontSize: '1.25rem', lineHeight: 1 }}>−</button>
                <div style={{ fontSize: '1.75rem', lineHeight: 1.1, color: '#c9a227', margin: '0.35rem 0' }}>{character.hp == null ? '—' : `${character.current_hp ?? character.hp}/${character.hp}`}</div>
                <button type="button" className="btn btn-secondary" aria-label="Heal" onClick={() => setHpAdjust('heal')} style={{ padding: '0.15rem 0.55rem', fontSize: '1.25rem', lineHeight: 1 }}>+</button>
              </div>
            )}
            {hpAdjust === 'damage' && (
              <div style={{ marginTop: '0.5rem' }}>
                <input type="number" min={0} id="hp-damage" aria-label="Damage amount" placeholder="Amount" style={{ ...INPUT_STYLE, width: '100%', marginBottom: 6 }} />
                <button type="button" className="btn btn-primary" onClick={() => { const v = parseInt(document.getElementById('hp-damage')?.value, 10); if (!Number.isNaN(v)) handleHpChange(-v); }}>Apply</button>
                <button type="button" className="btn btn-secondary" style={{ marginLeft: 4 }} onClick={() => setHpAdjust(null)}>Cancel</button>
              </div>
            )}
            {hpAdjust === 'heal' && (
              <div style={{ marginTop: '0.5rem' }}>
                <input type="number" min={0} id="hp-heal" aria-label="Heal amount" placeholder="Amount" style={{ ...INPUT_STYLE, width: '100%', marginBottom: 6 }} />
                <button type="button" className="btn btn-primary" onClick={() => { const v = parseInt(document.getElementById('hp-heal')?.value, 10); if (!Number.isNaN(v)) handleHpChange(v); }}>Apply</button>
                <button type="button" className="btn btn-secondary" style={{ marginLeft: 4 }} onClick={() => setHpAdjust(null)}>Cancel</button>
              </div>
            )}
          </div>
          <div className="card" style={{ marginBottom: 0, textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: '#8a7f72' }}>AC</div>
            <div style={{ fontSize: '1.75rem', lineHeight: 1.1, color: '#c9a227', margin: '0.35rem 0' }}>{mechanic.formatArmorClass(mechanic.armorClass(character))}</div>
          </div>
          <div className="card" style={{ marginBottom: 0, textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: '#8a7f72' }}>AB</div>
            <div style={{ fontSize: '1.75rem', lineHeight: 1.1, color: '#c9a227', margin: '0.35rem 0' }}>{combat.baseAttackBonus == null ? '—' : formatModifier(combat.baseAttackBonus)}</div>
          </div>
        </div>
        <div className="card" style={{ marginBottom: 0, height: '100%' }}>
          <h2>Saving throws</h2>
          {SAVE_ROWS.map((row) => (
            <div key={row.stat} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.35rem 0', borderBottom: '1px solid #3d3530' }}>
              <div style={{ color: '#8a7f72', fontSize: '0.85rem' }}>{row.label}</div>
              <div style={{ color: '#c9a227', fontSize: '1.25rem' }}>{saveTargets[row.stat] ?? '—'}</div>
            </div>
          ))}
          {otherAbilities.length > 0 && (
            <ul style={{ listStyle: 'none', marginTop: '0.75rem' }}>
              {otherAbilities.map((ability) => (
                <li key={`${ability.character_id}-${ability.ability_id}`} style={{ color: '#b8b0a0' }}>
                  {ability.ability_description}
                  {ability.mod != null && ability.mod !== '' ? ` (${ability.mod})` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card" style={{ marginBottom: 0, height: '100%' }}>
          <h2>Weapons</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
        </div>
      </div>
      </form>

      {activeSpellTab && (
      <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ marginBottom: 0 }}>Spells</h2>
            {showLearn && !sheetLocked && (
              <button type="button" className="btn btn-primary" onClick={() => setSpellModal(true)}>Learn spell</button>
            )}
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', margin: '0.35rem 0 1rem', color: '#b8b0a0' }}>
            <input
              type="checkbox"
              checked={hideUnavailable}
              onChange={(e) => setHideUnavailable(e.target.checked)}
            />
            Hide unavailable spells
          </label>
          <div className="catalog-tabs" role="tablist">
            {spellTabs.map((tab) => (
              <button
                key={tab.circle}
                type="button"
                role="tab"
                aria-selected={tab.circle === activeSpellTab.circle}
                className={`catalog-tab${tab.circle === activeSpellTab.circle ? ' active' : ''}`}
                onClick={() => setSpellCircle(tab.circle)}
              >
                Level {tab.circle}{castableCircles.has(tab.circle) ? '*' : ''}
              </button>
            ))}
          </div>
          <p style={{ color: '#8a7f72', marginTop: 0 }}>
            {intendHere} / {activeSpellTab.slots} to memorize
          </p>
          {shownSpells.length === 0 && (
            <p style={{ color: '#8a7f72' }}>
              {circleSpells.length === 0
                ? (showLearn ? 'No spells learned at this level.' : 'No spells at this level.')
                : 'No spells you can cast at this level.'}
            </p>
          )}
          {shownSpells.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 6.5rem 7.5rem auto', columnGap: '0.75rem', rowGap: '0.35rem', alignItems: 'center' }}>
              <span />
              <span style={{ textAlign: 'center', color: '#8a7f72', fontSize: '0.75rem' }}>Memorized</span>
              <span style={{ textAlign: 'center', color: '#8a7f72', fontSize: '0.75rem' }}>To memorize</span>
              <span />
              {shownSpells.map((s) => (
                <React.Fragment key={s.id}>
                  <strong>{s.name}</strong>
                  <span style={{ color: '#c9a227', textAlign: 'center' }} aria-label={`${s.name} memorized`}>{s.memorized}</span>
                  <input
                    type="number"
                    min={0}
                    aria-label={`${s.name} to memorize`}
                    value={s.intend}
                    onChange={(e) => {
                      const next = parseInt(e.target.value, 10);
                      if (!Number.isInteger(next) || next < 0) return;
                      if (!memorizeWithinCap(circleSpells, s.id, next, activeSpellTab.slots)) {
                        setError(`Only ${activeSpellTab.slots} spells of this level can be memorized`);
                        return;
                      }
                      setError(null);
                      handleSetIntend(s.id, next);
                    }}
                    style={{ width: '4.5rem', justifySelf: 'center', ...INPUT_STYLE, textAlign: 'right' }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleCastSpell(s.id)}
                    disabled={!(s.memorized > 0)}
                  >
                    Cast
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
          {spellModal && showLearn && !sheetLocked && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSpellModal(false)}>
              <div className="card" style={{ maxWidth: 400, maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                <h3>Learn spell</h3>
                <p style={{ color: '#8a7f72', fontSize: '0.9rem' }}>Spells your class can cast at this level.</p>
                {learnChoices.length === 0 ? (
                  <p style={{ color: '#8a7f72' }}>Nothing you can learn at this level.</p>
                ) : (
                  <ul style={{ listStyle: 'none', maxHeight: 300, overflow: 'auto' }}>
                    {learnChoices.map((s) => (
                      <li key={s.id} style={{ padding: '0.25rem 0' }}>
                        <button type="button" className="btn btn-secondary" style={{ width: '100%', textAlign: 'left' }} onClick={() => handleLearnSpell(s.id)}>
                          {s.name} <span style={{ color: '#8a7f72' }}>· level {s.level}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => setSpellModal(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {playerMode && campaignId && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Here</h2>
          <p>{here?.location_name || 'The GM has not set a location.'}</p>
          <h3>Objectives</h3>
          {(here?.objectives || []).length === 0 && <p className="muted">None yet.</p>}
          {(here?.objectives || []).length > 0 && (
            <ul style={{ margin: 0 }}>
              {here.objectives.map((row) => (
                <li key={row.id}>
                  {row.body}
                  {row.status === 'resolved' ? <span className="muted"> · resolved</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {playerMode && campaignId && (
        <ShopVisit
          board={shopBoard}
          busy={shopBusy}
          onBuy={(openId, itemId, quantity) => runShop(() => buyFromShop(campaignId, id, openId, { item_id: itemId, quantity }))}
          onSell={(openId, characterItemId, quantity) => runShop(() => sellToShop(campaignId, id, openId, { character_item_id: characterItemId, quantity }))}
        />
      )}

      <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>Inventory</h2>
            {!sheetLocked && (
              <button type="button" className="btn btn-primary" onClick={() => setAddItemModal(true)}>Add item</button>
            )}
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#8a7f72' }}>Money</div>
            {editing ? (
              <>
                <input
                  type="number"
                  min={0}
                  aria-label="Money in copper"
                  value={form.money ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, money: parseInt(e.target.value, 10) || null }))}
                  style={{ ...INPUT_STYLE, width: 120 }}
                />
                <div style={{ fontSize: '0.75rem', color: '#8a7f72' }}>copper · {coinsDisplay(form.money)}</div>
              </>
            ) : (
              <div style={{ fontSize: '1.25rem', color: '#c9a227' }}>{coinsDisplay(character.money)}</div>
            )}
          </div>
          {heldTabs.length > 0 && (
            <div className="catalog-tabs" role="tablist" aria-label="Inventory">
              {heldTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={tab.key === activeHeld.key}
                  className={`catalog-tab${tab.key === activeHeld.key ? ' active' : ''}`}
                  onClick={() => setItemTab(tab.key)}
                >
                  {tab.name}
                </button>
              ))}
            </div>
          )}
          {heldItems.length > 0 && (
            <ul style={{ listStyle: 'none' }}>
              {heldItems.map((i) => (
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
          {(!character.items || character.items.length === 0) && (
            <p style={{ color: '#8a7f72' }}>{sheetLocked ? 'No items.' : 'No items. Add items from the reference list.'}</p>
          )}
          {addItemModal && !sheetLocked && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setAddItemModal(false)}>
              <div className="card" style={{ maxWidth: 400, maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                <h3>Add item</h3>
                {catalogTabs.length > 0 && (
                  <div className="catalog-tabs" role="tablist" aria-label="Item categories">
                    {catalogTabs.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={tab.key === activeCatalog.key}
                        className={`catalog-tab${tab.key === activeCatalog.key ? ' active' : ''}`}
                        onClick={() => setAddItemTab(tab.key)}
                      >
                        {tab.name}
                      </button>
                    ))}
                  </div>
                )}
                <ul style={{ listStyle: 'none', maxHeight: 300, overflow: 'auto' }}>
                  {catalogItems.map((it) => (
                    <li key={it.id} style={{ padding: '0.25rem 0' }}>
                      <button type="button" className="btn btn-secondary" style={{ width: '100%', textAlign: 'left' }} onClick={() => handleAddItem(it.id)}>
                        {it.name} {it.price != null && `(${formatItemPrice(it.price)})`}
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn btn-secondary" onClick={() => setAddItemModal(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

      <div className="card">
        <h2>Notes</h2>
        <textarea
          value={form.notes || ''}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          onBlur={() => {
            if ((form.notes || '') !== (character?.notes || '')) {
              updateCharacter(id, { notes: form.notes || null }).then((r) => setCharacter((prev) => keepLoadedLists(prev, r.data))).catch(() => {});
            }
          }}
          rows={6}
          style={{ ...INPUT_STYLE, width: '100%' }}
          placeholder="Session notes, discoveries…"
        />
      </div>

      {playerMode && party.length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Party</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {party.filter((p) => p.id !== character?.id).map((p) => (
              <li key={p.id} style={{ padding: '0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span><strong>{p.name}</strong> ({p.user}) · HP {p.hp == null ? '—' : `${p.current_hp ?? p.hp}/${p.hp}`}</span>
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
                  <button type="button" className="btn btn-primary" style={{ marginLeft: 8 }} onClick={() => handleAcceptTransfer(t)}>Accept</button>
                  <button type="button" className="btn btn-secondary" style={{ marginLeft: 4 }} onClick={() => updateTransfer(t.id, { status: 'rejected' }).then(() => setIncomingTransfers((prev) => prev.filter((x) => x.id !== t.id)))}>Reject</button>
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
      {levelUp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: 420 }}>
            <h3>Level up</h3>
            <p style={{ color: '#8a7f72' }}>Roll hit points for each new level. Constitution is added, and a penalty cannot reduce the gain below 1.</p>
            {levelUp.write.needsRolls.map((step, index) => (
              <div key={step.level} style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', marginBottom: 4 }}>
                  Level {step.level}{step.hitDie ? ` (1–${step.hitDie})` : ''}
                </label>
                <input
                  type="number"
                  min={1}
                  max={step.hitDie || undefined}
                  value={levelUp.rolls[index]}
                  onChange={(e) => setLevelUp((prev) => {
                    const rolls = [...prev.rolls];
                    rolls[index] = e.target.value;
                    return { ...prev, rolls };
                  })}
                  style={INPUT_STYLE}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn-primary" onClick={handleLevelRolls}>Add hit points</button>
              <button type="button" className="btn btn-secondary" onClick={() => setLevelUp(null)}>Later</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
