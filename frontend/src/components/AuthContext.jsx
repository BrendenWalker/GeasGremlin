import React, { createContext, useContext, useEffect, useState } from 'react';
import { getMe, loginAccount, logoutAccount, registerAccount } from '../api/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = (username, password) => loginAccount(username, password).then((res) => {
    setUser(res.data);
    return res.data;
  });

  const register = (username, password) => registerAccount(username, password).then((res) => {
    setUser(res.data);
    return res.data;
  });

  const logout = () => logoutAccount().finally(() => setUser(null));

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
