import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getSpells } from '../api/api';
import FormattedText from '../components/FormattedText';

export default function SpellsPage() {
  const { rulesetId } = useParams();
  const [spells, setSpells] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSpells(rulesetId)
      .then((res) => {
        if (!cancelled) setSpells(res.data || []);
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

  return (
    <section>
      <h3 className="catalog-heading">Spells</h3>
      {error && <p className="catalog-error">{error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="catalog-list">
          {spells.map((spell) => (
            <article key={spell.id} className="catalog-entry">
              <h4 className="catalog-name">{spell.name}</h4>
              {(spell.range || spell.duration) && (
                <p className="catalog-meta">
                  Range: {spell.range ?? '—'}, Duration: {spell.duration ?? '—'}
                </p>
              )}
              <FormattedText text={spell.description} />
            </article>
          ))}
          {spells.length === 0 && <p className="muted">No spells in this ruleset.</p>}
        </div>
      )}
    </section>
  );
}
