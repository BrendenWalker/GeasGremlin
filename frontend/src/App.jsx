import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
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
import VersionFooter from './components/VersionFooter';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app">
        <nav className="navbar">
          <div className="nav-container">
            <Link to="/" className="nav-logo">RPGHub</Link>
            <div className="nav-links">
              <Link to="/" className="nav-link">Home</Link>
              <Link to="/play" className="nav-link">Play</Link>
              <Link to="/campaigns" className="nav-link">Campaigns</Link>
              <Link to="/races" className="nav-link">Races</Link>
              <Link to="/classes" className="nav-link">Classes</Link>
              <Link to="/spells" className="nav-link">Spells</Link>
              <Link to="/items" className="nav-link">Items</Link>
            </div>
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
            <Route path="/races" element={<RacesPage />} />
            <Route path="/classes" element={<ClassesPage />} />
            <Route path="/spells" element={<SpellsPage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        </main>
        <VersionFooter />
      </div>
    </Router>
  );
}

export default App;
