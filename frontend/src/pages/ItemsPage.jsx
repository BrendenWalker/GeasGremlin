import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getItems } from '../api/api';
import FormattedText from '../components/FormattedText';

export default function ItemsPage() {
  const { rulesetId } = useParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getItems(rulesetId)
      .then((res) => {
        if (!cancelled) setItems(res.data || []);
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
      <h3 className="catalog-heading">Items</h3>
      {error && <p className="catalog-error">{error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="catalog-list">
          {items.map((item) => {
            const text = item.description || item.notes;
            return (
              <article key={item.id} className="catalog-entry">
                <h4 className="catalog-name">
                  {item.name}
                  {(item.category_name || item.type_name) && (
                    <span className="catalog-meta">
                      {' '}
                      — {[item.category_name, item.type_name].filter(Boolean).join(' / ')}
                    </span>
                  )}
                  {item.price != null && <span className="catalog-meta"> ({item.price} gp)</span>}
                </h4>
                <FormattedText text={text} />
              </article>
            );
          })}
          {items.length === 0 && <p className="muted">No items in this ruleset.</p>}
        </div>
      )}
    </section>
  );
}
