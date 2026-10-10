import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthContext';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import PlayPage from './pages/PlayPage';
import PlayerCharacterPage from './pages/PlayerCharacterPage';
import CampaignsPage from './pages/CampaignsPage';
import CharactersPage from './pages/CharactersPage';
import CharacterDetailPage from './pages/CharacterDetailPage';
import NewCharacterWizardPage from './pages/NewCharacterWizardPage';
import RacesPage from './pages/RacesPage';
import ClassesPage from './pages/ClassesPage';
import SpellsPage from './pages/SpellsPage';
import ItemsPage from './pages/ItemsPage';
import RulesetLayout, { RulesetRedirect } from './components/RulesetLayout';
import { RulesetProvider, useRuleset } from './components/RulesetContext';
import { catalogSection } from './utils/rulesetSelection.mjs';
import VersionFooter from './components/VersionFooter';
import './App.css';

function navClass({ isActive }) {
  return `nav-link${isActive ? ' active' : ''}`;
}

function RulesetSelect() {
  const { rulesets, rulesetId, setRulesetId, error, loading } = useRuleset();
  const location = useLocation();
  const navigate = useNavigate();
  const nested = useMatch('/rulesets/:rulesetId/*');
  const exact = useMatch('/rulesets/:rulesetId');
  const match = nested || exact;

  if (error) return <span className="nav-ruleset-error">Rulesets unavailable</span>;
  if (loading || !rulesets) return null;
  if (rulesets.length === 0) return null;

  const urlId = match?.params.rulesetId;
  const urlKnown = urlId && rulesets.some((row) => String(row.id) === String(urlId));
  const selected = urlKnown ? String(urlId) : rulesetId;

  function onChange(event) {
    const nextId = event.target.value;
    setRulesetId(nextId);
    if (!match) return;
    navigate(`/rulesets/${nextId}/${catalogSection(location.pathname)}`);
  }

  return (
    <label className="ruleset-picker nav-ruleset">
      <span>Ruleset</span>
      <select value={selected} onChange={onChange} className="ruleset-select" aria-label="Ruleset">
        {rulesets.map((row) => (
          <option key={row.id} value={String(row.id)}>
            {row.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Shell() {
  const { user, loading, logout } = useAuth();
  if (loading) {
    return <div className="app"><main className="main-content"><p className="muted">Loading…</p></main></div>;
  }
  if (!user) return <LoginPage />;
  return (
      <RulesetProvider>
      <div className="app">
        <nav className="navbar">
          <div className="nav-container">
            <NavLink to="/" className="nav-logo" end>RPGHub</NavLink>
            <div className="nav-links">
              <NavLink to="/" end className={navClass}>Home</NavLink>
              <NavLink to="/play" className={navClass}>Play</NavLink>
              <NavLink to="/campaigns" className={navClass}>Campaigns</NavLink>
              <NavLink to="/rulesets" className={navClass}>Ruleset</NavLink>
            </div>
            <span className="nav-ruleset" style={{ color: '#8a7f72' }}>{user.username}</span>
            <button type="button" className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={logout}>Log out</button>
            <RulesetSelect />
          </div>
        </nav>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/play" element={<PlayPage />} />
            <Route path="/play/characters/:id" element={<PlayerCharacterPage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/campaigns/:campaignId/characters" element={<CharactersPage />} />
            <Route path="/campaigns/:campaignId/characters/new" element={<NewCharacterWizardPage />} />
            <Route path="/characters/:id" element={<CharacterDetailPage />} />
            <Route path="/rulesets" element={<RulesetRedirect />} />
            <Route path="/rulesets/:rulesetId" element={<RulesetLayout />}>
              <Route index element={<Navigate to="races" replace />} />
              <Route path="races/:entryId?" element={<RacesPage />} />
              <Route path="classes/:entryId?" element={<ClassesPage />} />
              <Route path="spells" element={<SpellsPage />} />
              <Route path="items" element={<ItemsPage />} />
              <Route path="*" element={<p className="muted">That catalog page does not exist.</p>} />
            </Route>
            <Route path="/races" element={<RulesetRedirect section="races" />} />
            <Route path="/classes" element={<RulesetRedirect section="classes" />} />
            <Route path="/spells" element={<RulesetRedirect section="spells" />} />
            <Route path="/items" element={<RulesetRedirect section="items" />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        </main>
        <VersionFooter />
      </div>
      </RulesetProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Shell />
      </Router>
    </AuthProvider>
  );
}

export default App;
