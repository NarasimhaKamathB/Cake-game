'use client';
import { useState, useEffect } from 'react';

const SESSION_KEY = 'admin_auth';
// Password is set via NEXT_PUBLIC_ADMIN_PASSWORD env var.
// Falls back to 'cakegame2024' if the env var is not set.
const ADMIN_PASSWORD =
  process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? 'cakegame2024';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Check sessionStorage on mount (persists for the browser tab session)
    if (sessionStorage.getItem(SESSION_KEY) === 'true') {
      setAuthed(true);
    }
    setChecked(true);
  }, []);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (input === ADMIN_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      setAuthed(true);
      setError('');
    } else {
      setError('Incorrect password. Try again.');
      setInput('');
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(SESSION_KEY);
    setAuthed(false);
    setInput('');
  }

  // Don't flash the login screen on first render
  if (!checked) return null;

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cake-50">
        <div className="bg-white rounded-2xl shadow-sm border border-cake-100 p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🔐</div>
            <h2 className="text-2xl font-bold text-cake-700">Admin Access</h2>
            <p className="text-sm text-gray-500 mt-1">Enter the facilitator password to continue.</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Password"
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cake-400"
            />
            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}
            <button
              type="submit"
              className="w-full bg-cake-600 hover:bg-cake-700 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
            >
              Enter Admin Panel
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Logout bar */}
      <div className="flex justify-end px-6 pt-4">
        <button
          onClick={handleLogout}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          🔓 Log out of admin
        </button>
      </div>
      {children}
    </div>
  );
}
