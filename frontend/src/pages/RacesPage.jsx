import React, { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { getRaces } from '../api/api';
import FormattedText from '../components/FormattedText';
import CatalogTabs from '../components/CatalogTabs';
import { AbilityTable, StatList } from '../components/CatalogDetails';
import { abilityRequirements } from '../utils/formatText';

export default function RacesPage() {
  const { rulesetId, entryId } = useParams();
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadedFor, setLoadedFor] = useState(rulesetId);

  if (loadedFor !== rulesetId) {
    setLoadedFor(rulesetId);
    setRaces([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getRaces(rulesetId)
      .then((res) => {
        if (!cancelled) setRaces(res.data || []);
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

  if (!loading && !error && loadedFor === rulesetId && !entryId && races.length > 0) {
    return <Navigate to={`/rulesets/${rulesetId}/races/${races[0].id}`} replace />;
  }

  const selected = races.find((race) => String(race.id) === String(entryId));

  return (
    <section>
      {error && <p className="catalog-error">{error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : error ? null : races.length === 0 ? (
        <p className="muted">No races in this ruleset.</p>
      ) : (
        <>
          <CatalogTabs
            items={races}
            label="Races"
            to={(race) => `/rulesets/${rulesetId}/races/${race.id}`}
          />
          {selected ? (
            <article className="catalog-entry">
              <h4 className="catalog-name">{selected.name}</h4>
              <StatList
                items={[
                  { label: 'Avg height', value: selected.avgheight },
                  { label: 'Avg weight', value: selected.avgweight },
                  { label: 'Requirements', value: abilityRequirements(selected) },
                  { label: 'XP adjustment', value: selected.xpadjustment },
                  { label: 'Ranged bonus', value: selected.rangedbonus },
                  { label: 'Max HD', value: selected.max_hd },
                  { label: 'HD modifier', value: selected.hd_mod },
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
            </article>
          ) : (
            <p className="muted">That race is not in this ruleset.</p>
          )}
        </>
      )}
    </section>
  );
}
