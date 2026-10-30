import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  acceptInvite,
  declineInvite,
  getCharacter,
  getCharacterCommands,
  getCharacterTransfers,
  getClasses,
  getInvites,
  getPlayerCharacters,
} from '../api/api';
import { levelUpCommands, orderWaiting, sheetPath, transferText } from '../domain/notices.mjs';
import { useNotices } from './NoticeContext';

function rowFromTransfer(character, transfer) {
  if (transfer.status !== 'pending') return null;
  const text = transferText(transfer.from_name, character.name, transfer);
  if (!text) return null;
  return {
    key: `transfer:${transfer.id}`,
    at: transfer.created_at || '',
    kind: 'transfer',
    title: `Incoming · ${transfer.from_name} to ${character.name}`,
    detail: text,
    character,
  };
}

export default function NeedsYou() {
  const { pathname } = useLocation();
  const { notify } = useNotices();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const rootRef = useRef(null);
  const loadGen = useRef(0);

  const load = useCallback(async () => {
    const gen = loadGen.current + 1;
    loadGen.current = gen;
    const [invitesRes, charactersRes] = await Promise.all([
      getInvites(),
      getPlayerCharacters(),
    ]);
    const characters = charactersRes.data || [];
    const next = (invitesRes.data || []).map((invite) => ({
      key: `invite:${invite.id}`,
      at: '',
      kind: 'invite',
      campaignId: invite.id,
      title: `Invite · ${invite.name}`,
    }));
    const packs = await Promise.all(characters.map(async (character) => {
      const [transfers, commands] = await Promise.all([
        getCharacterTransfers(character.id, 'incoming').then((res) => res.data || []).catch(() => []),
        getCharacterCommands(character.id).then((res) => res.data || []).catch(() => []),
      ]);
      return { character, transfers, commands };
    }));
    for (const pack of packs) {
      for (const transfer of pack.transfers) {
        const row = rowFromTransfer(pack.character, transfer);
        if (row) next.push(row);
      }
      const xp = pack.commands.filter((command) => command.type === 'give_xp');
      if (xp.length === 0) continue;
      try {
        const sheet = await getCharacter(pack.character.id);
        const classes = await getClasses(sheet.data?.ruleset_id);
        for (const command of levelUpCommands(sheet.data, classes.data || [], xp)) {
          next.push({
            key: `level:${pack.character.id}:${command.id}`,
            at: command.created_at || '',
            kind: 'level',
            title: `Level up · ${pack.character.name}`,
            detail: 'The GM gave enough XP. Roll hit points on the sheet.',
            character: pack.character,
          });
        }
      } catch {
        /* the open sheet reports an apply failure on its own poll */
      }
    }
    if (gen !== loadGen.current) return;
    setRows(orderWaiting(next));
  }, []);

  useEffect(() => {
    load().catch(() => {});
    const interval = setInterval(() => { load().catch(() => {}); }, 10000);
    return () => {
      loadGen.current += 1;
      clearInterval(interval);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const fail = (err) => {
    notify({
      tone: 'error',
      text: err.response?.data?.error || err.message,
      source: 'needs-you',
    });
  };

  const act = (key, action) => {
    setBusyKey(key);
    action()
      .then(() => load())
      .catch(fail)
      .finally(() => setBusyKey(null));
  };

  return (
    <div className="needs-you" ref={rootRef}>
      <button
        type="button"
        className="btn btn-secondary needs-you-button"
        aria-expanded={open}
        onClick={() => {
          const willOpen = !open;
          setOpen(willOpen);
          if (willOpen) load().catch(fail);
        }}
      >
        {rows.length > 0 ? `Needs you ${rows.length}` : 'Needs you'}
      </button>
      {open && (
        <div className="needs-you-menu">
          {rows.length === 0 ? (
            <p className="muted">Nothing waiting.</p>
          ) : rows.map((row) => {
            const href = row.character ? sheetPath(row.character, pathname) : null;
            return (
              <div key={row.key} className="needs-you-row">
                <div>
                  <p className="needs-you-title">{row.title}</p>
                  {row.detail ? <p className="muted">{row.detail}</p> : null}
                </div>
                {row.kind === 'invite' ? (
                  <div className="needs-you-actions">
                    <button type="button" className="btn btn-primary" disabled={busyKey === row.key} onClick={() => act(row.key, () => acceptInvite(row.campaignId))}>Accept</button>
                    <button type="button" className="btn btn-secondary" disabled={busyKey === row.key} onClick={() => act(row.key, () => declineInvite(row.campaignId))}>Decline</button>
                  </div>
                ) : (
                  <Link to={href} className="btn btn-primary" onClick={() => setOpen(false)}>Open sheet</Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
