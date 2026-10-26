import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate, useLocation, useNavigate, useParams, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthContext';
import { NoticeProvider, NoticeStack, useNotices } from './components/NoticeContext';
import NeedsYou from './components/NeedsYou';
import { getCampaign, pauseCampaign } from './api/api';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import PlayPage from './pages/PlayPage';
import AdventuringPage from './pages/AdventuringPage';
import ConfigurationPage from './pages/ConfigurationPage';
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

function editCampaignIdFromPath(pathname) {
  const match = pathname.match(/^\/campaigns\/(\d+)(?:\/|$)/);
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
  if (!session?.running || !session.role) return <Navigate to="/" replace />;
  return <Outlet />;
}

function EditSession({ session, sessionReady }) {
  const { campaignId } = useParams();
  if (!/^\d+$/.test(campaignId || '')) return <Navigate to="/campaigns" replace />;
  if (!sessionReady) return <p className="muted">Loading…</p>;
  if (!session?.role) return <Navigate to="/campaigns" replace />;
  return <Outlet />;
}

function GmOnly({ session, home }) {
  const { campaignId } = useParams();
  const to = home === 'edit' ? `/campaigns/${campaignId}/characters` : `/play/${campaignId}`;
  if (session?.role !== 'gm') return <Navigate to={to} replace />;
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
  const playCampaignId = campaignIdFromPath(pathname);
  const editCampaignId = editCampaignIdFromPath(pathname);
  const campaignId = playCampaignId || editCampaignId;
  const { notify } = useNotices();
  const [session, setSession] = useState(null);
  const [sessionFor, setSessionFor] = useState(null);
  const tagline = taglineForDate();

  useEffect(() => {
    // ponytail: title and tagline freeze until reload. Ceiling is a tab left open past local midnight; upgrade is a timer to the next local midnight.
    document.title = documentTitle();
  }, []);

  useEffect(() => {
    if (!campaignId) {
      setSession(null);
      setSessionFor(null);
      return undefined;
    }
    let cancelled = false;
    setSession(null);
    setSessionFor(null);
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
  const inCampaign = Boolean(playCampaignId && sessionReady && session?.running);
  const inEdit = Boolean(editCampaignId && sessionReady && session?.role);
  const showCampaignNav = Boolean(playCampaignId) && (!sessionReady || session?.running);
  const showEditNav = Boolean(editCampaignId) && (!sessionReady || session?.role);

  const returnToHub = () => {
    notify({ tone: 'error', text: '', source: 'pause' });
    if (playCampaignId && session?.role === 'gm') {
      pauseCampaign(playCampaignId)
        .then(() => navigate('/'))
        .catch((err) => notify({
          tone: 'error',
          text: err.response?.data?.error || err.message,
          source: 'pause',
        }));
      return;
    }
    navigate('/');
  };

  return (
      <RulesetProvider>
      <div className="app">
        <nav className="navbar">
          <div className="nav-container">
            <NavLink to={showCampaignNav ? (sessionReady && session?.role !== 'gm' ? `/play/${playCampaignId}/characters` : `/play/${playCampaignId}`) : showEditNav ? `/campaigns/${editCampaignId}/characters` : '/'} className="nav-logo" end>
              <span>GeasGremlin</span>
              <span className="nav-tagline">{tagline}</span>
            </NavLink>
            <div className="nav-links">
              {showCampaignNav ? (
                sessionReady && (
                <>
                  {session?.role === 'gm' && (
                    <NavLink to={`/play/${playCampaignId}`} end className={navClass}>My Characters</NavLink>
                  )}
                  <NavLink to={`/play/${playCampaignId}/characters`} className={navClass}>
                    {session?.role === 'gm' ? 'Campaign Roster' : 'Characters'}
                  </NavLink>
                  {session?.role === 'gm' && (
                    <>
                      <NavLink to={`/play/${playCampaignId}/adventuring`} className={navClass}>Adventuring</NavLink>
                      <NavLink to={`/play/${playCampaignId}/configuration`} className={navClass}>Configuration</NavLink>
                      <NavLink to={`/play/${playCampaignId}/reference`} className={navClass}>Reference</NavLink>
                    </>
                  )}
                </>
                )
              ) : showEditNav ? (
                <>
                  <NavLink to={`/campaigns/${editCampaignId}/characters`} className={navClass}>Characters</NavLink>
                  {session?.role === 'gm' && (
                    <NavLink to={`/campaigns/${editCampaignId}/configuration`} className={navClass}>Configuration</NavLink>
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
            {(inCampaign || inEdit) && session?.name ? (
              <p className="campaign-banner">Campaign: {session.name}</p>
            ) : null}
            <NeedsYou />
            <span className="nav-ruleset" style={{ color: '#8a7f72' }}>{user.username}</span>
            <button type="button" className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={logout}>Log out</button>
            {(inCampaign || inEdit) && (
              <button type="button" className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={returnToHub}>
                Return to Hub
              </button>
            )}
          </div>
        </nav>
        <main className="main-content">
          <NoticeStack />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/play" element={<Navigate to="/" replace />} />
            <Route path="/play/characters/:id" element={<PlayCharacterRedirect />} />
            <Route
              path="/play/:campaignId"
              element={<CampaignSession session={session} sessionReady={sessionReady} />}
            >
              <Route index element={session?.role === 'gm' ? <PlayPage /> : <Navigate to="characters" replace />} />
              <Route path="characters" element={<CharactersPage />} />
              <Route path="characters/new" element={<NewCharacterWizardPage />} />
              <Route path="characters/:id" element={<PlayerCharacterPage />} />
              <Route path="adventuring" element={<GmOnly session={session} />}>
                <Route index element={<AdventuringPage />} />
              </Route>
              <Route path="configuration" element={<GmOnly session={session} />}>
                <Route index element={<ConfigurationPage campaignName={session?.name} />} />
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
            <Route
              path="/campaigns/:campaignId"
              element={<EditSession session={session} sessionReady={sessionReady} />}
            >
              <Route index element={<Navigate to="characters" replace />} />
              <Route path="characters" element={<CharactersPage />} />
              <Route path="characters/new" element={<NewCharacterWizardPage />} />
              <Route path="configuration" element={<GmOnly session={session} home="edit" />}>
                <Route index element={<ConfigurationPage campaignName={session?.name} />} />
              </Route>
            </Route>
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
        <NoticeProvider>
          <Shell />
        </NoticeProvider>
      </Router>
    </AuthProvider>
  );
}

export default App;
