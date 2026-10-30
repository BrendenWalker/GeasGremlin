import React from 'react';
import { NavLink } from 'react-router-dom';

export default function CatalogTabs({ items, label, to }) {
  return (
    <nav className="catalog-tabs" aria-label={label}>
      {items.map((item) => (
        <NavLink
          key={item.id}
          to={to(item)}
          end
          className={({ isActive }) => `catalog-tab${isActive ? ' active' : ''}`}
        >
          {item.name}
        </NavLink>
      ))}
    </nav>
  );
}
