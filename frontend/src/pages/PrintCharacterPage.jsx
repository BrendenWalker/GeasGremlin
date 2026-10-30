import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getCharacter, getClasses, getRaces, getSpells } from '../api/api';
import { useRuleset } from '../components/RulesetContext';
import { PRINT_STYLES, printSheet, resolvePrintStyle } from '../domain/printSheet.mjs';
import './printSheet.css';

const STYLE_KEY = 'geasgremlin.printStyle';

function storedStyle() {
  try {
    return window.localStorage.getItem(STYLE_KEY);
  } catch {
    return null;
  }
}

function rememberStyle(id) {
  try {
    window.localStorage.setItem(STYLE_KEY, id);
  } catch {
    /* private browsing can refuse storage; the query string still holds the choice */
  }
}

function hitPoints(current, max) {
  if (current === '' && max === '') return '';
  if (current === '') return max;
  if (max === '') return current;
  return `${current} / ${max}`;
}

function circleLabel(circle) {
  const names = [null, '1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];
  if (!circle) return 'Spells';
  return `${names[circle] || circle} Level`;
}

function SpellMarks({ count }) {
  const filled = Math.max(0, Number(count) || 0);
  const boxes = Math.max(filled, 1);
  return (
    <span className="ps-marks" aria-label={`${filled} memorized`}>
      {Array.from({ length: boxes }, (_, index) => (
        <span key={index} className={index < filled ? 'ps-mark ps-mark-on' : 'ps-mark'} />
      ))}
    </span>
  );
}

function SpellList({ spells }) {
  if (!spells.length) return <p>No spells known.</p>;
  const groups = [];
  for (const spell of spells) {
    let group = groups.find((row) => row.circle === spell.circle);
    if (!group) {
      group = { circle: spell.circle, spells: [] };
      groups.push(group);
    }
    group.spells.push(spell);
  }
  return (
    <div className="ps-spell-groups">
      {groups.map((group) => (
        <div key={group.circle} className="ps-spell-group">
          <h2>{circleLabel(group.circle)}</h2>
          <ul className="ps-spell-list">
            {group.spells.map((spell) => (
              <li key={`${group.circle}-${spell.name}`}>
                <SpellMarks count={spell.memorized} />
                {spell.name}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Sheet({ sheet }) {
  return (
    <article className="ps-sheet">
      <header className="ps-identity">
        <h1 className="ps-name">{sheet.name || 'Unnamed'}</h1>
        <dl className="ps-facts">
          <div><dt>Player</dt><dd>{sheet.player}</dd></div>
          <div><dt>Race</dt><dd>{sheet.race}</dd></div>
          <div><dt>Class</dt><dd>{sheet.className}</dd></div>
          <div><dt>Level</dt><dd>{sheet.level}</dd></div>
          <div><dt>XP</dt><dd>{sheet.xp}</dd></div>
          <div><dt>Next</dt><dd>{sheet.nextLevelXp}</dd></div>
        </dl>
      </header>

      <div className="ps-body">
        <section className="ps-abilities">
          <h2>Abilities</h2>
          <table>
            <tbody>
              {sheet.abilities.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  <td className="ps-score">{row.score}</td>
                  <td className="ps-mod">{row.mod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="ps-saves">
          <h2>Saving throws</h2>
          <table>
            <tbody>
              {sheet.saves.map((row) => (
                <tr key={row.stat}>
                  <th scope="row">{row.label}</th>
                  <td className="ps-score">{row.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="ps-combat">
          <h2>Combat</h2>
          <dl className="ps-facts ps-stack">
            <div><dt>Armor class</dt><dd>{sheet.armorClass}</dd></div>
            <div><dt>Hit points</dt><dd>{hitPoints(sheet.hpCurrent, sheet.hpMax)}</dd></div>
            <div><dt>Attack bonus</dt><dd>{sheet.attackBonus}</dd></div>
            <div><dt>Armor</dt><dd>{sheet.armor}</dd></div>
          </dl>
        </section>

        <section className="ps-weapons">
          <h2>Weapons</h2>
          <ul className="ps-weapon-list">
            {sheet.weapons.map((row) => (
              <li key={row.slot}>
                <strong>{row.slot}{row.name ? ` — ${row.name}` : ''}</strong>
                {row.attack ? <div>Attack {row.attack}</div> : null}
                {row.damage ? <div>Damage {row.damage}</div> : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="ps-coins">
          <h2>Coins</h2>
          <dl className="ps-facts ps-stack">
            <div><dt>PP</dt><dd>{sheet.coins.pp}</dd></div>
            <div><dt>GP</dt><dd>{sheet.coins.gp}</dd></div>
            <div><dt>SP</dt><dd>{sheet.coins.sp}</dd></div>
            <div><dt>CP</dt><dd>{sheet.coins.cp}</dd></div>
          </dl>
        </section>

        <section className="ps-gear">
          <h2>Gear</h2>
          {sheet.gear.length === 0 ? <p className="ps-blank" /> : (
            <ul>
              {sheet.gear.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
            </ul>
          )}
        </section>

        <section className="ps-langs">
          <h2>Languages and abilities</h2>
          <p>{sheet.languages}</p>
          {sheet.abilitiesText.length > 0 && (
            <ul>
              {sheet.abilitiesText.map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
        </section>

        <section className="ps-notes">
          <h2>Notes</h2>
          <p className="ps-note-text">{sheet.notes}</p>
        </section>
      </div>

      <section className="ps-spells">
        <h2>Known spells</h2>
        <SpellList spells={sheet.spells} />
      </section>
    </article>
  );
}

export default function PrintCharacterPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { rulesets, error: rulesetError } = useRuleset();
  const queryStyle = params.get('style');
  const style = resolvePrintStyle(queryStyle, storedStyle());
  const [character, setCharacter] = useState(null);
  const [races, setRaces] = useState([]);
  const [classes, setClasses] = useState([]);
  const [spells, setSpells] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (queryStyle === style) return;
    setParams({ style }, { replace: true });
  }, [queryStyle, style, setParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCharacter(id)
      .then((response) => response.data)
      .then((char) => Promise.all([
        getRaces(char.ruleset_id).then((response) => response.data || []),
        getClasses(char.ruleset_id).then((response) => response.data || []),
        getSpells(char.ruleset_id).then((response) => response.data || []),
      ]).then(([raceRows, classRows, spellRows]) => [char, raceRows, classRows, spellRows]))
      .then((loaded) => {
        if (cancelled || !loaded) return;
        const [char, raceRows, classRows, spellRows] = loaded;
        setCharacter(char);
        setRaces(raceRows);
        setClasses(classRows);
        setSpells(spellRows);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || err.message || 'Failed to fetch character');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  const chooseStyle = (next) => {
    rememberStyle(next);
    setParams({ style: next }, { replace: true });
  };

  let body = null;
  if (loading && !character) {
    body = <p className="ps-status">Loading…</p>;
  } else if (error && !character) {
    body = <p className="ps-status">{error}</p>;
  } else if (rulesetError) {
    body = <p className="ps-status">{rulesetError}</p>;
  } else if (!rulesets) {
    body = <p className="ps-status">Loading…</p>;
  } else if (character) {
    const ruleset = rulesets.find((row) => String(row.id) === String(character.ruleset_id));
    if (!ruleset) {
      body = <p className="ps-status">This character&apos;s ruleset is not available.</p>;
    } else {
      try {
        body = <Sheet sheet={printSheet(character, { ruleset, races, classes, spells })} />;
      } catch (err) {
        body = <p className="ps-status">{err.message}</p>;
      }
    }
  }

  return (
    <div className="print-sheet-page">
      <div className="print-toolbar">
        <label>
          Style
          <select aria-label="Style" value={style} onChange={(event) => chooseStyle(event.target.value)}>
            {PRINT_STYLES.map((row) => (
              <option key={row.id} value={row.id}>{row.label}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print</button>
      </div>
      <div className="ps" data-style={style}>
        {body}
      </div>
    </div>
  );
}
