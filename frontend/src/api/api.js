import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

export const getMe = () => api.get('/me');
export const registerAccount = (username, password) => api.post('/register', { username, password });
export const loginAccount = (username, password) => api.post('/login', { username, password });
export const logoutAccount = () => api.post('/logout');
export const getInvites = () => api.get('/invites');
export const getInviteCandidates = () => api.get('/invite-candidates');
export const inviteToCampaign = (campaignId, characterId) => api.post(`/campaigns/${campaignId}/members`, { character_id: characterId });
export const acceptInvite = (campaignId) => api.post(`/invites/${campaignId}/accept`);
export const declineInvite = (campaignId) => api.post(`/invites/${campaignId}/decline`);

// Campaigns
export const getCampaigns = () => api.get('/campaigns');
export const getCampaign = (id) => api.get(`/campaigns/${id}`);
export const createCampaign = (data) => api.post('/campaigns', data);
export const updateCampaign = (id, data) => api.put(`/campaigns/${id}`, data);
export const deleteCampaign = (id) => api.delete(`/campaigns/${id}`);
export const startCampaign = (id) => api.post(`/campaigns/${id}/start`);
export const pauseCampaign = (id) => api.post(`/campaigns/${id}/pause`);

// Characters
export const getCharacters = (campaignId) => api.get(`/campaigns/${campaignId}/characters`);
export const getCharacter = (id) => api.get(`/characters/${id}`);
export const createCharacter = (campaignId, data) => api.post(`/campaigns/${campaignId}/characters`, data);
export const updateCharacter = (id, data) => api.put(`/characters/${id}`, data);
export const adjustCharacterHitPoints = (id, delta) => api.post(`/characters/${id}/hit-points`, { delta });
export const deleteCharacter = (id) => api.delete(`/characters/${id}`);
export const removeCampaignCharacter = (campaignId, characterId) =>
  api.delete(`/campaigns/${campaignId}/characters/${characterId}`);

// Character items (inventory)
export const addCharacterItem = (characterId, data) => api.post(`/characters/${characterId}/items`, data);
export const updateCharacterItem = (characterId, itemId, data) => api.put(`/characters/${characterId}/items/${itemId}`, data);
export const removeCharacterItem = (characterId, itemId, oneOnly = false) =>
  api.delete(`/characters/${characterId}/items/${itemId}${oneOnly ? '?quantity=1' : ''}`);

// Character spells (learn, memorized, cast)
export const learnCharacterSpell = (characterId, data) => api.post(`/characters/${characterId}/spells`, data);
export const setCharacterSpellIntend = (characterId, spellId, intend) =>
  api.put(`/characters/${characterId}/spells/${spellId}`, { intend });
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
export const getMonsters = (rulesetId) => api.get('/monsters', { params: rulesetParams(rulesetId) });
export const getItem = (id) => api.get(`/items/${id}`);
export const getAbilityCategories = () => api.get('/ability-categories');
export const getItemCategories = () => api.get('/item-categories');
export const getItemTypes = () => api.get('/item-types');

// Player (database-backed player/GM, replaces RabbitMQ)
export const getPlayerCharacters = () => api.get('/player/characters');
export const getParty = (campaignId) => api.get(`/campaigns/${campaignId}/party`);
export const createCampaignCommand = (campaignId, data) => api.post(`/campaigns/${campaignId}/commands`, data);
export const getCharacterCommands = (characterId) => api.get(`/characters/${characterId}/commands`);
export const markCommandRead = (commandId, body) => api.patch(`/commands/${commandId}/read`, body || {});
export const createTransfer = (characterId, data) => api.post(`/characters/${characterId}/transfers`, data);
export const getCharacterTransfers = (characterId, direction) =>
  api.get(`/characters/${characterId}/transfers`, { params: direction ? { direction } : {} });
export const updateTransfer = (transferId, body) => api.patch(`/transfers/${transferId}`, body);

export const getAdventuring = (campaignId) => api.get(`/campaigns/${campaignId}/adventuring`);
export const tickAdventuring = (campaignId, step) => api.post(`/campaigns/${campaignId}/adventuring/tick`, { step });
export const setAdventuringPlace = (campaignId, place) => api.post(`/campaigns/${campaignId}/adventuring/place`, { place });
export const createEncounterTable = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/tables`, body);
export const updateEncounterTable = (campaignId, tableId, body) => api.patch(`/campaigns/${campaignId}/adventuring/tables/${tableId}`, body);
export const deleteEncounterTable = (campaignId, tableId) => api.delete(`/campaigns/${campaignId}/adventuring/tables/${tableId}`);
export const createLocation = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/locations`, body);
export const updateLocation = (campaignId, locationId, body) => api.patch(`/campaigns/${campaignId}/adventuring/locations/${locationId}`, body);
export const selectLocation = (campaignId, locationId) => api.post(`/campaigns/${campaignId}/adventuring/locations/${locationId}/select`);
export const deleteLocation = (campaignId, locationId) => api.delete(`/campaigns/${campaignId}/adventuring/locations/${locationId}`);
export const createShop = (campaignId, locationId, body) => api.post(`/campaigns/${campaignId}/adventuring/locations/${locationId}/shops`, body);
export const updateShop = (campaignId, locationId, shopId, body) => api.patch(`/campaigns/${campaignId}/adventuring/locations/${locationId}/shops/${shopId}`, body);
export const deleteShop = (campaignId, locationId, shopId) => api.delete(`/campaigns/${campaignId}/adventuring/locations/${locationId}/shops/${shopId}`);
export const createCreatures = (campaignId, locationId, body) => api.post(`/campaigns/${campaignId}/adventuring/locations/${locationId}/creatures`, body);
export const deleteCreature = (campaignId, locationId, creatureId) => api.delete(`/campaigns/${campaignId}/adventuring/locations/${locationId}/creatures/${creatureId}`);
export const setLocationFlag = (campaignId, locationId, body) => api.post(`/campaigns/${campaignId}/adventuring/locations/${locationId}/flags`, body);
export const setPlayFact = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/state`, body);
export const applyRisingWater = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/preview/apply`, body);
export const rejectRisingWater = (campaignId) => api.post(`/campaigns/${campaignId}/adventuring/preview/reject`);
export const clearLocationFlag = (campaignId, locationId, flagId) => api.delete(`/campaigns/${campaignId}/adventuring/locations/${locationId}/flags/${flagId}`);
export const takeCreatures = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/creatures/take`, body);
export const getCharacterShops = (campaignId, characterId) => api.get(`/campaigns/${campaignId}/characters/${characterId}/shops`);
export const buyFromShop = (campaignId, characterId, shopId, body) => api.post(`/campaigns/${campaignId}/characters/${characterId}/shops/${shopId}/buy`, body);
export const sellToShop = (campaignId, characterId, shopId, body) => api.post(`/campaigns/${campaignId}/characters/${characterId}/shops/${shopId}/sell`, body);
export const checkoutShop = (campaignId, characterId, shopId, body) => api.post(`/campaigns/${campaignId}/characters/${characterId}/shops/${shopId}/checkout`, body);
export const giveParty = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/party`, body);
export const startEncounter = (campaignId) => api.post(`/campaigns/${campaignId}/adventuring/encounter`);
export const endEncounter = (campaignId) => api.delete(`/campaigns/${campaignId}/adventuring/encounter`);
export const addEncounterEnemy = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/enemies`, body);
export const acceptWander = (campaignId) => api.post(`/campaigns/${campaignId}/adventuring/accept`);
export const rollTreasure = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/treasure`, body);
export const rollSurprise = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/surprise`, body);
export const rollReaction = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/reaction`, body);
export const rollInitiative = (campaignId) => api.post(`/campaigns/${campaignId}/adventuring/initiative`);
export const rollMorale = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/morale`, body);
export const rollTurn = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/turn`, body);
export const rollAttack = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/attack`, body);
export const applyDamage = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/damage`, body);
export const setEnemyHitPoints = (campaignId, enemyId, body) => api.post(`/campaigns/${campaignId}/adventuring/enemies/${enemyId}/hit-points`, body);
export const tallyAward = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/award`, body);
export const applyAward = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/award/apply`, body);
export const removeEncounterEnemy = (campaignId, enemyId) => api.delete(`/campaigns/${campaignId}/adventuring/enemies/${enemyId}`);
export const fleeEncounterEnemy = (campaignId, enemyId) => api.post(`/campaigns/${campaignId}/adventuring/enemies/${enemyId}/flee`);
export const addAdventuringMark = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/marks`, body);
export const lightAdventuring = (campaignId, source) => api.post(`/campaigns/${campaignId}/adventuring/light`, { source });
export const marchAdventuring = (campaignId, rest) => api.post(`/campaigns/${campaignId}/adventuring/march`, { rest });
export const lostAdventuring = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/lost`, body);
export const weatherAdventuring = (campaignId, navigator) => api.post(`/campaigns/${campaignId}/adventuring/weather`, { navigator });
export const rollHire = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/hire/roll`, body);
export const clearHirePenalty = (campaignId, characterId) => api.post(`/campaigns/${campaignId}/adventuring/hire/clear`, { character_id: characterId });
export const addHireling = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/hire`, body);
export const checkHireling = (campaignId, hirelingId, body) => api.post(`/campaigns/${campaignId}/adventuring/hirelings/${hirelingId}/check`, body);
export const endAdventureLoyalty = (campaignId, adjustment) => api.post(`/campaigns/${campaignId}/adventuring/hire/adventure`, { adjustment });
export const removeHireling = (campaignId, hirelingId) => api.delete(`/campaigns/${campaignId}/adventuring/hirelings/${hirelingId}`);
export const getPrep = (campaignId) => api.get(`/campaigns/${campaignId}/prep`);
export const stockRoom = (campaignId) => api.post(`/campaigns/${campaignId}/prep/stock`);
export const prepDamage = (campaignId, body) => api.post(`/campaigns/${campaignId}/prep/damage`, body);
export const prepRepair = (campaignId, body) => api.post(`/campaigns/${campaignId}/prep/repair`, body);
export const settleAdventuring = (campaignId, body) => api.post(`/campaigns/${campaignId}/adventuring/body`, body);
export const removeAdventuringMark = (campaignId, markId) => api.delete(`/campaigns/${campaignId}/adventuring/marks/${markId}`);
export const postPresence = (campaignId, characterId) => api.post(`/campaigns/${campaignId}/presence`, { character_id: characterId });
export const getCampaignHere = (campaignId) => api.get(`/campaigns/${campaignId}/here`);
export const createObjective = (campaignId, body) => api.post(`/campaigns/${campaignId}/situation/objectives`, body);
export const updateObjective = (campaignId, objectiveId, body) => api.patch(`/campaigns/${campaignId}/situation/objectives/${objectiveId}`, body);
export const deleteObjective = (campaignId, objectiveId) => api.delete(`/campaigns/${campaignId}/situation/objectives/${objectiveId}`);
export const createNpc = (campaignId, body) => api.post(`/campaigns/${campaignId}/situation/npcs`, body);
export const updateNpc = (campaignId, npcId, body) => api.patch(`/campaigns/${campaignId}/situation/npcs/${npcId}`, body);
export const deleteNpc = (campaignId, npcId) => api.delete(`/campaigns/${campaignId}/situation/npcs/${npcId}`);
export const createClue = (campaignId, body) => api.post(`/campaigns/${campaignId}/situation/clues`, body);
export const updateClue = (campaignId, clueId, body) => api.patch(`/campaigns/${campaignId}/situation/clues/${clueId}`, body);
export const deleteClue = (campaignId, clueId) => api.delete(`/campaigns/${campaignId}/situation/clues/${clueId}`);
export const createPreparedEncounter = (campaignId, body) => api.post(`/campaigns/${campaignId}/situation/encounters`, body);
export const updatePreparedEncounter = (campaignId, encounterId, body) => api.patch(`/campaigns/${campaignId}/situation/encounters/${encounterId}`, body);
export const addEncounterMember = (campaignId, encounterId, body) => api.post(`/campaigns/${campaignId}/situation/encounters/${encounterId}/members`, body);
export const updateEncounterMember = (campaignId, encounterId, memberId, body) => api.patch(`/campaigns/${campaignId}/situation/encounters/${encounterId}/members/${memberId}`, body);
export const deleteEncounterMember = (campaignId, encounterId, memberId) => api.delete(`/campaigns/${campaignId}/situation/encounters/${encounterId}/members/${memberId}`);
export const openPreparedEncounter = (campaignId, encounterId) => api.post(`/campaigns/${campaignId}/situation/encounters/${encounterId}/open`);
export const resolvePreparedEncounter = (campaignId, encounterId) => api.post(`/campaigns/${campaignId}/situation/encounters/${encounterId}/resolve`);
export const deletePreparedEncounter = (campaignId, encounterId) => api.delete(`/campaigns/${campaignId}/situation/encounters/${encounterId}`);
export const createTransition = (campaignId, body) => api.post(`/campaigns/${campaignId}/situation/transitions`, body);
export const updateTransition = (campaignId, transitionId, body) => api.patch(`/campaigns/${campaignId}/situation/transitions/${transitionId}`, body);
export const deleteTransition = (campaignId, transitionId) => api.delete(`/campaigns/${campaignId}/situation/transitions/${transitionId}`);
export const arriveTransition = (campaignId, transitionId, body) => api.post(`/campaigns/${campaignId}/situation/transitions/${transitionId}/arrive`, body || {});
export const findTransition = (campaignId, transitionId) => api.post(`/campaigns/${campaignId}/situation/transitions/${transitionId}/found`);
export const setTransitionAccess = (campaignId, transitionId, blocked) => api.post(`/campaigns/${campaignId}/situation/transitions/${transitionId}/access`, { blocked });
export const addSituationLog = (campaignId, body) => api.post(`/campaigns/${campaignId}/situation/log`, body);
export const endSituationSession = (campaignId) => api.post(`/campaigns/${campaignId}/situation/end`);
export const concludeCampaign = (campaignId) => api.post(`/campaigns/${campaignId}/situation/conclude`);

export default api;
