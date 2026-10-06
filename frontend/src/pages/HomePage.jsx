import React from 'react';
import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div className="card">
      <h1 style={{ fontSize: '1.75rem', marginBottom: '1rem' }}>RPGHub</h1>
      <p style={{ marginBottom: '1.5rem', color: '#b8b0a0' }}>
        Manage campaigns and characters for tabletop RPGs. The same data model supports
        multiple game systems (D&D, Pathfinder, Basic Fantasy, etc.) — only the reference
        data (races, classes, spells, items) changes.
      </p>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <Link to="/campaigns" className="btn btn-primary">Campaigns</Link>
        <Link to="/rulesets" className="btn btn-secondary">Ruleset</Link>
      </div>
    </div>
  );
}
