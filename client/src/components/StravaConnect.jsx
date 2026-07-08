import React, { useState } from "react";
import { api } from "../api";

export default function StravaConnect({ status, profile, onSynced, onStatusChange }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  if (!status) return null;

  // Not configured on the server (no client id/secret) — show a hint.
  if (!status.configured) {
    return (
      <div className="strava-box strava-box--muted">
        <div className="strava-box__head">
          <span className="strava-logo">Strava</span>
          <span className="strava-status">Not set up</span>
        </div>
        <p className="strava-hint">
          Add <code>STRAVA_CLIENT_ID</code> and <code>STRAVA_CLIENT_SECRET</code> to
          your <code>.env</code> to enable auto-sync. Manual entry works meanwhile.
        </p>
      </div>
    );
  }

  function connect() {
    // Full-page navigation into the OAuth flow (redirects to Strava).
    window.location.href = "/api/strava/authorize";
  }

  async function sync() {
    setBusy(true);
    setNote(null);
    try {
      const res = await api.syncStrava(profile);
      onSynced(res.activity);
      setNote(
        `Synced your latest activity (${res.weekCount} in the last 7 days).`
      );
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await api.disconnectStrava();
      onStatusChange({ ...status, connected: false, athlete: null });
      setNote("Disconnected from Strava.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="strava-box">
      <div className="strava-box__head">
        <span className="strava-logo">Strava</span>
        <span className={`strava-status ${status.connected ? "is-on" : ""}`}>
          {status.connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {status.connected ? (
        <>
          <div className="strava-actions">
            <button className="btn-strava" onClick={sync} disabled={busy}>
              {busy ? "Syncing…" : "Sync latest activity"}
            </button>
            <button className="btn-ghost" onClick={disconnect} disabled={busy}>
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <button className="btn-strava" onClick={connect}>
          Connect Strava
        </button>
      )}

      {note && <p className="strava-note">{note}</p>}
    </div>
  );
}
