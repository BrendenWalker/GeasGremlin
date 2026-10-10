import React, { useEffect } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useRuleset } from './RulesetContext';
import { CATALOG_SECTIONS, catalogBase, catalogSection } from '../utils/rulesetSelection.mjs';

function isRulesetId(value) {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

export function RulesetRedirect({ section = 'races' }) {
  const { rulesets, rulesetId, error, loading } = useRuleset();

  if (error) {
    return (
      <div className="card">
        <h2>Ruleset</h2>
        <p className="catalog-error">{error}</p>
      </div>
    );
  }
  if (loading || !rulesets) {
    return (
      <div className="card">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (rulesets.length === 0 || !rulesetId) {
    return (
      <div className="card">
        <h2>Ruleset</h2>
        <p className="muted">No rulesets in database.</p>
      </div>
    );
  }
  return <Navigate to={`/rulesets/${rulesetId}/${section}`} replace />;
}

export default function RulesetLayout({ locked = false }) {
  const { rulesetId: paramId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { rulesets, error, loading, setRulesetId } = useRuleset();
  const known = !loading && !error && isRulesetId(paramId)
    && rulesets.some((row) => String(row.id) === paramId);
  const rulesetName = known ? rulesets.find((row) => String(row.id) === paramId)?.name : '';
  const base = catalogBase(location.pathname, paramId);

  useEffect(() => {
    if (known && !locked) setRulesetId(paramId);
  }, [known, locked, paramId, setRulesetId]);

  if (error) {
    return (
      <div className="card">
        <h2>Ruleset</h2>
        <p className="catalog-error">{error}</p>
      </div>
    );
  }
  if (loading || !rulesets) {
    return (
      <div className="card">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (!known) {
    return (
      <div className="card">
        <h2>Ruleset</h2>
        <p className="muted">Ruleset not found.</p>
      </div>
    );
  }

  return (
    <div className="card ruleset-page">
      {locked ? (
        <p className="ruleset-picker">
          <span>Ruleset</span>
          <strong>{rulesetName}</strong>
        </p>
      ) : (
        <label className="ruleset-picker">
          <span>Ruleset</span>
          <select
            value={paramId}
            onChange={(event) => {
              navigate(`/rulesets/${event.target.value}/${catalogSection(location.pathname)}`);
            }}
            className="ruleset-select"
            aria-label="Ruleset"
          >
            {rulesets.map((row) => (
              <option key={row.id} value={String(row.id)}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <nav className="subnav" aria-label="Ruleset catalog">
        {CATALOG_SECTIONS.map((item) => (
          <NavLink
            key={item.path}
            to={`${base}/${item.path}`}
            className={({ isActive }) => `subnav-link${isActive ? ' active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
