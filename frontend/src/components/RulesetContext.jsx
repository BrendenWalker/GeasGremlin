import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getRulesets } from '../api/api';
import { RULESET_STORAGE_KEY, resolveRulesetId } from '../utils/rulesetSelection.mjs';

const RulesetContext = createContext(null);

function readStoredId() {
  return localStorage.getItem(RULESET_STORAGE_KEY) || localStorage.getItem('rpghub_ruleset_id') || '';
}

export function RulesetProvider({ children }) {
  const [rulesets, setRulesets] = useState(null);
  const [error, setError] = useState(null);
  const [storedId, setStoredId] = useState(readStoredId);
  const loading = rulesets == null && !error;
  const rulesetId = rulesets ? resolveRulesetId(rulesets, storedId) : '';

  useEffect(() => {
    getRulesets()
      .then((res) => setRulesets(res.data || []))
      .catch((err) => setError(err.response?.data?.error || err.message));
  }, []);

  const setRulesetId = useCallback((id) => {
    const next = String(id);
    setStoredId(next);
    localStorage.setItem(RULESET_STORAGE_KEY, next);
  }, []);

  return (
    <RulesetContext.Provider value={{ rulesets, rulesetId, setRulesetId, error, loading }}>
      {children}
    </RulesetContext.Provider>
  );
}

export function useRuleset() {
  const ctx = useContext(RulesetContext);
  if (!ctx) throw new Error('useRuleset must be used inside RulesetProvider');
  return ctx;
}
