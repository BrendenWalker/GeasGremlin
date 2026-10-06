import React, { useEffect } from 'react';
import { NavLink, Navigate, Outlet, useParams } from 'react-router-dom';
import { useRuleset } from './RulesetContext';
import { CATALOG_SECTIONS } from '../utils/rulesetSelection.mjs';

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

export default function RulesetLayout() {
  const { rulesetId: paramId } = useParams();
  const { rulesets, error, loading, setRulesetId } = useRuleset();
  const known = !loading && !error && isRulesetId(paramId)
    && rulesets.some((row) => String(row.id) === paramId);

  useEffect(() => {
    if (known) setRulesetId(paramId);
  }, [known, paramId, setRulesetId]);

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
      <nav className="subnav" aria-label="Ruleset catalog">
        {CATALOG_SECTIONS.map((item) => (
          <NavLink
            key={item.path}
            to={`/rulesets/${paramId}/${item.path}`}
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
