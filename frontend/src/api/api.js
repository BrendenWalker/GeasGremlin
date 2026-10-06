import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Campaigns
export const getCampaigns = () => api.get('/campaigns');
export const getCampaign = (id) => api.get(`/campaigns/${id}`);
export const createCampaign = (data) => api.post('/campaigns', data);
export const updateCampaign = (id, data) => api.put(`/campaigns/${id}`, data);
export const deleteCampaign = (id) => api.delete(`/campaigns/${id}`);

// Characters
export const getCharacters = (campaignId) => api.get(`/campaigns/${campaignId}/characters`);
export const getCharacter = (id) => api.get(`/characters/${id}`);
export const createCharacter = (campaignId, data) => api.post(`/campaigns/${campaignId}/characters`, data);
export const updateCharacter = (id, data) => api.put(`/characters/${id}`, data);
export const deleteCharacter = (id) => api.delete(`/characters/${id}`);

// Character items (inventory)
export const addCharacterItem = (characterId, data) => api.post(`/characters/${characterId}/items`, data);
export const updateCharacterItem = (characterId, itemId, data) => api.put(`/characters/${characterId}/items/${itemId}`, data);
export const removeCharacterItem = (characterId, itemId, oneOnly = false) =>
  api.delete(`/characters/${characterId}/items/${itemId}${oneOnly ? '?quantity=1' : ''}`);

// Character spells (learn, memorized, cast)
export const learnCharacterSpell = (characterId, data) => api.post(`/characters/${characterId}/spells`, data);
export const setCharacterSpellMemorized = (characterId, spellId, memorized) =>
  api.put(`/characters/${characterId}/spells/${spellId}`, { memorized });
export const castCharacterSpell = (characterId, spellId) => api.post(`/characters/${characterId}/spells/${spellId}/cast`);

// Reference data. Pass rulesetId to limit a list to one ruleset; omit it to load every ruleset.
function rulesetParams(rulesetId) {
  if (rulesetId == null || rulesetId === '') return {};
  return { ruleset_id: rulesetId };
}

export const getRulesets = () => api.get('/rulesets');
export const getRaces = (rulesetId) => api.get('/races', { params: rulesetParams(rulesetId) });
export const getRace = (id) => api.get(`/races/${id}`);
export const getClasses = (rulesetId) => api.get('/classes', { params: rulesetParams(rulesetId) });
export const getClass = (id) => api.get(`/classes/${id}`);
export const getClassLeveling = (id) => api.get(`/classes/${id}/leveling`);
export const getAbilities = () => api.get('/abilities');
export const getSpells = (rulesetId) => api.get('/spells', { params: rulesetParams(rulesetId) });
export const getSpell = (id) => api.get(`/spells/${id}`);
export const getItems = (rulesetId) => api.get('/items', { params: rulesetParams(rulesetId) });
export const getItem = (id) => api.get(`/items/${id}`);
export const getAbilityCategories = () => api.get('/ability-categories');
export const getItemCategories = () => api.get('/item-categories');
export const getItemTypes = () => api.get('/item-types');

// Player (database-backed player/GM, replaces RabbitMQ)
export const getPlayerCharacters = (user) => api.get('/player/characters', { params: { user } });
export const getParty = (campaignId) => api.get(`/campaigns/${campaignId}/party`);
export const createCampaignCommand = (campaignId, data) => api.post(`/campaigns/${campaignId}/commands`, data);
export const getCharacterCommands = (characterId) => api.get(`/characters/${characterId}/commands`);
export const markCommandRead = (commandId) => api.patch(`/commands/${commandId}/read`);
export const createTransfer = (characterId, data) => api.post(`/characters/${characterId}/transfers`, data);
export const getCharacterTransfers = (characterId, direction) =>
  api.get(`/characters/${characterId}/transfers`, { params: direction ? { direction } : {} });
export const updateTransfer = (transferId, status) => api.patch(`/transfers/${transferId}`, { status });

export default api;
