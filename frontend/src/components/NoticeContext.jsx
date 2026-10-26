import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { clearEphemeral, dismissNotice, pushNotice } from '../domain/notices.mjs';

const NoticeContext = createContext(null);

export function NoticeProvider({ children }) {
  const { pathname } = useLocation();
  const [notices, setNotices] = useState([]);
  const seq = useRef(0);

  useEffect(() => {
    setNotices((prev) => clearEphemeral(prev));
  }, [pathname]);

  const notify = useCallback(({ tone, text, source }) => {
    if (!source) return;
    setNotices((prev) => {
      if (!text) return pushNotice(prev, { source, text: '' });
      seq.current += 1;
      return pushNotice(prev, {
        id: `${source}:${seq.current}`,
        source,
        tone,
        text,
      });
    });
  }, []);

  const dismiss = useCallback((id) => {
    setNotices((prev) => dismissNotice(prev, id));
  }, []);

  return (
    <NoticeContext.Provider value={{ notices, notify, dismiss }}>
      {children}
    </NoticeContext.Provider>
  );
}

export function useNotices() {
  const ctx = useContext(NoticeContext);
  if (!ctx) throw new Error('useNotices must be used within NoticeProvider');
  return ctx;
}

const TONE_CLASS = {
  error: 'notice-error',
  warn: 'notice-warn',
  info: 'notice-info',
  success: 'notice-success',
};

export function NoticeStack() {
  const { notices, dismiss } = useNotices();
  if (notices.length === 0) return null;
  return (
    <div className="notice-stack">
      {notices.map((notice) => (
        <div key={notice.id} className={`notice ${TONE_CLASS[notice.tone] || 'notice-info'}`}>
          <p>{notice.text}</p>
          <button type="button" className="notice-dismiss" aria-label="Dismiss" onClick={() => dismiss(notice.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
