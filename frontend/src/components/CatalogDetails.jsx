import React from 'react';
import FormattedText from './FormattedText';
import { formatAbilityText } from '../utils/formatText';

export function StatList({ items }) {
  const visible = items.filter((item) => item.value != null && item.value !== '');
  if (visible.length === 0) return null;
  return (
    <dl className="stat-list">
      {visible.map((item) => (
        <div className="stat-row" key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AbilityTable({ abilities }) {
  if (!abilities?.length) return null;
  const showLevel = abilities.some((a) => a.level != null);
  const showCategory = abilities.some((a) => a.category_name);
  const showStat = abilities.some((a) => a.stat_name);
  return (
    <div className="catalog-section">
      <h4>Abilities</h4>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {showLevel && <th scope="col">Level</th>}
              <th scope="col">Ability</th>
              {showStat && <th scope="col">Stat</th>}
              {showCategory && <th scope="col">Category</th>}
            </tr>
          </thead>
          <tbody>
            {abilities.map((ability, index) => (
              <tr key={`${ability.level ?? 'x'}-${index}`}>
                {showLevel && <td>{ability.level ?? '—'}</td>}
                <td>
                  <FormattedText
                    text={formatAbilityText(ability.description, ability.int_param, ability.str_param)}
                  />
                </td>
                {showStat && (
                  <td>
                    {ability.stat_name
                      ? ability.stat_modifier != null
                        ? `${ability.stat_name} (${ability.stat_modifier > 0 ? '+' : ''}${ability.stat_modifier})`
                        : ability.stat_name
                      : '—'}
                  </td>
                )}
                {showCategory && <td>{ability.category_name || '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LevelingTable({ rows }) {
  if (!rows?.length) return null;
  return (
    <div className="catalog-section">
      <h4>Leveling</h4>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Level</th>
              <th scope="col">XP</th>
              <th scope="col">HD</th>
              <th scope="col">HP</th>
              <th scope="col">AB</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.level}>
                <td>{row.level}</td>
                <td>{row.xp}</td>
                <td>{row.hd ?? '—'}</td>
                <td>{row.hp ?? '—'}</td>
                <td>{row.ab ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const SPELL_SLOT_COLUMNS = [
  ['level1', '1st'],
  ['level2', '2nd'],
  ['level3', '3rd'],
  ['level4', '4th'],
  ['level5', '5th'],
  ['level6', '6th'],
  ['level7', '7th'],
];

export function SpellSlotTable({ rows }) {
  if (!rows?.length) return null;
  const columns = SPELL_SLOT_COLUMNS.filter(([key]) => rows.some((row) => row[key] != null));
  return (
    <div className="catalog-section">
      <h4>Spell slots</h4>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Level</th>
              {columns.map(([key, label]) => (
                <th scope="col" key={key}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.char_level}>
                <td>{row.char_level}</td>
                {columns.map(([key]) => (
                  <td key={key}>{row[key] ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
