import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate, useLocation, useNavigate, useParams, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthContext';
import { getCampaign, pauseCampaign } from './api/api';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import PlayPage from './pages/PlayPage';
import AdventuringPage from './pages/AdventuringPage';
import PlayerCharacterPage from './pages/PlayerCharacterPage';
import CampaignsPage from './pages/CampaignsPage';
import CharactersPage from './pages/CharactersPage';
import OwnedCharactersPage from './pages/OwnedCharactersPage';
import CharacterDetailPage from './pages/CharacterDetailPage';
import NewCharacterWizardPage from './pages/NewCharacterWizardPage';
import RacesPage from './pages/RacesPage';
import ClassesPage from './pages/ClassesPage';
import SpellsPage from './pages/SpellsPage';
import ItemsPage from './pages/ItemsPage';
import RulesetLayout, { RulesetRedirect } from './components/RulesetLayout';
import { referenceTail } from './utils/rulesetSelection.mjs';
import { taglineForDate, documentTitle } from './branding.mjs';
import { RulesetProvider } from './components/RulesetContext';
import VersionFooter from './components/VersionFooter';
import './App.css';

function navClass({ isActive }) {
  return `nav-link${isActive ? ' active' : ''}`;
}

function campaignIdFromPath(pathname) {
  const match = pathname.match(/^\/play\/(\d+)(?:\/|$)/);
  return match ? match[1] : null;
}

function PlayCharacterRedirect() {
  const { id } = useParams();
  return <Navigate to={`/characters/${id}`} replace />;
}

function CampaignSession({ session, sessionReady }) {
  const { campaignId } = useParams();
  if (!/^\d+$/.test(campaignId || '')) return <Navigate to="/" replace />;
  if (!sessionReady) return <p className="muted">Loading…</p>;
  if (!session?.running) return <Navigate to="/" replace />;
  return <Outlet />;
}

function GmOnly({ session }) {
  const { campaignId } = useParams();
  if (session?.role !== 'gm') return <Navigate to={`/play/${campaignId}`} replace />;
  return <Outlet />;
}

function CampaignReference({ session }) {
  const { campaignId } = useParams();
  const { pathname } = useLocation();
  if (session?.role !== 'gm') return <Navigate to={`/play/${campaignId}`} replace />;
  const locked = session?.ruleset_id != null ? String(session.ruleset_id) : '';
  if (!locked) return <p className="muted">This campaign has no ruleset.</p>;
  const urlRuleset = (pathname.match(/\/reference\/(\d+)/) || [])[1];
  if (urlRuleset !== locked) {
    return <Navigate to={`/play/${campaignId}/reference/${locked}/${referenceTail(pathname)}`} replace />;
  }
  return <Outlet />;
}

function Shell() {
  const { user, loading, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const campaignId = campaignIdFromPath(pathname);
  const [session, setSession] = useState(null);
  const [sessionFor, setSessionFor] = useState(null);
  const [pauseError, setPauseError] = useState(null);
  const tagline = taglineForDate();

  useEffect(() => {
    // ponytail: title and tagline freeze until reload. Ceiling is a tab left open past local midnight; upgrade is a timer to the next local midnight.
    document.title = documentTitle();
  }, []);

  useEffect(() => {
    if (!campaignId) {
      setSession(null);
      setSessionFor(null);
      setPauseError(null);
      return undefined;
    }
    let cancelled = false;
    setSession(null);
    setSessionFor(null);
    setPauseError(null);
    getCampaign(campaignId)
      .then((res) => {
        if (cancelled) return;
        setSession(res.data);
        setSessionFor(campaignId);
      })
      .catch(() => {
        if (cancelled) return;
        setSession(null);
        setSessionFor(campaignId);
      });
    return () => { cancelled = true; };
  }, [campaignId]);

  if (loading) {
    return <div className="app"><main className="main-content"><p className="muted">Loading…</p></main></div>;
  }
  if (!user) return <LoginPage />;

  const sessionReady = !campaignId || sessionFor === campaignId;
  const inCampaign = Boolean(campaignId && sessionReady && session?.running);
  const showCampaignNav = Boolean(campaignId) && (!sessionReady || session?.running);

  const returnToHub = () => {
    setPauseError(null);
    if (session?.role === 'gm') {
      pauseCampaign(campaignId)
        .then(() => navigate('/'))
        .catch((err) => setPauseError(err.response?.data?.error || err.message));
      return;
    }
    navigate('/');
  };

  return (
      <RulesetProvider>
      <div className="app">
        <nav className="navbar">
          <div className="nav-container">
            <NavLink to={showCampaignNav ? `/play/${campaignId}` : '/'} className="nav-logo" end>
              <span>GeasGremlin</span>
              <span className="nav-tagline">{tagline}</span>
            </NavLink>
            <div className="nav-links">
              {showCampaignNav ? (
                <>
                  <NavLink to={`/play/${campaignId}`} end className={navClass}>Home</NavLink>
                  {session?.role === 'gm' && (
                    <>
                      <NavLink to={`/play/${campaignId}/adventuring`} className={navClass}>Adventuring</NavLink>
                      <NavLink to={`/play/${campaignId}/reference`} className={navClass}>Reference</NavLink>
                    </>
                  )}
                </>
              ) : (
                <>
                  <NavLink to="/" end className={navClass}>Home</NavLink>
                  <NavLink to="/campaigns" className={navClass}>Campaigns</NavLink>
                  <NavLink to="/characters" className={navClass}>Characters</NavLink>
                  <NavLink to="/rulesets" className={navClass}>Ruleset Reference</NavLink>
                </>
              )}
            </div>
            <span className="nav-ruleset" style={{ color: '#8a7f72' }}>{user.username}</span>
            <button type="button" className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={logout}>Log out</button>
            {inCampaign && (
              <button type="button" className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={returnToHub}>
                Return to Hub
              </button>
            )}
            {pauseError && <span style={{ color: '#c95858' }}>{pauseError}</span>}
          </div>
        </nav>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/play" element={<Navigate to="/" replace />} />
            <Route path="/play/characters/:id" element={<PlayCharacterRedirect />} />
            <Route
              path="/play/:campaignId"
              element={<CampaignSession session={session} sessionReady={sessionReady} />}
            >
              <Route index element={<PlayPage />} />
              <Route path="characters/:id" element={<PlayerCharacterPage />} />
              <Route path="adventuring" element={<GmOnly session={session} />}>
                <Route index element={<AdventuringPage campaignName={session?.name} />} />
              </Route>
              <Route path="reference" element={<CampaignReference session={session} />}>
                <Route path=":rulesetId" element={<RulesetLayout locked />}>
                  <Route index element={<Navigate to="races" replace />} />
                  <Route path="races/:entryId?" element={<RacesPage />} />
                  <Route path="classes/:entryId?" element={<ClassesPage />} />
                  <Route path="spells" element={<SpellsPage />} />
                  <Route path="items" element={<ItemsPage />} />
                  <Route path="*" element={<p className="muted">That catalog page does not exist.</p>} />
                </Route>
              </Route>
            </Route>
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/campaigns/:campaignId/characters" element={<CharactersPage />} />
            <Route path="/campaigns/:campaignId/characters/new" element={<NewCharacterWizardPage />} />
            <Route path="/characters" element={<OwnedCharactersPage />} />
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
