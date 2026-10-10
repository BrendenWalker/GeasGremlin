import React, { useEffect, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { getClasses } from '../api/api';
import FormattedText from '../components/FormattedText';
import CatalogTabs from '../components/CatalogTabs';
import { AbilityTable, LevelingTable, SpellSlotTable, StatList } from '../components/CatalogDetails';
import { abilityRequirements } from '../utils/formatText';
import { catalogBase } from '../utils/rulesetSelection.mjs';

export default function ClassesPage() {
  const { rulesetId, entryId } = useParams();
  const { pathname } = useLocation();
  const base = catalogBase(pathname, rulesetId);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadedFor, setLoadedFor] = useState(rulesetId);

  if (loadedFor !== rulesetId) {
    setLoadedFor(rulesetId);
    setClasses([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getClasses(rulesetId)
      .then((res) => {
        if (!cancelled) setClasses(res.data || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rulesetId]);

  if (!loading && !error && loadedFor === rulesetId && !entryId && classes.length > 0) {
    return <Navigate to={`${base}/classes/${classes[0].id}`} replace />;
  }

  const selected = classes.find((row) => String(row.id) === String(entryId));

  return (
    <section>
      {error && <p className="catalog-error">{error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : error ? null : classes.length === 0 ? (
        <p className="muted">No classes in this ruleset.</p>
      ) : (
        <>
          <CatalogTabs
            items={classes}
            label="Classes"
            to={(row) => `${base}/classes/${row.id}`}
          />
          {selected ? (
            <article className="catalog-entry">
              <h4 className="catalog-name">{selected.name}</h4>
              <StatList
                items={[
                  { label: 'Quasi-class', value: selected.is_quasi ? 'Yes' : null },
                  { label: 'Subclass of', value: selected.subclass_name },
                  { label: 'Requirements', value: abilityRequirements(selected) },
                  { label: 'Armor', value: selected.armor ? <FormattedText text={selected.armor} /> : null },
                  { label: 'Weapons', value: selected.weapons ? <FormattedText text={selected.weapons} /> : null },
                ]}
              />
              {selected.description && (
                <div className="catalog-section">
                  <FormattedText text={selected.description} />
                </div>
              )}
              <AbilityTable abilities={selected.abilities} />
              <LevelingTable rows={selected.leveling} />
              <SpellSlotTable rows={selected.spell_slots} />
            </article>
          ) : (
            <p className="muted">That class is not in this ruleset.</p>
          )}
        </>
      )}
    </section>
  );
}
