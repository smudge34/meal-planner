'use client';

import { useState, useEffect } from 'react';

const AUTH_KEY = 'meal-planner-auth';

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  // null = not yet checked localStorage
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setAuthed(localStorage.getItem(AUTH_KEY) === 'true');
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        localStorage.setItem(AUTH_KEY, 'true');
        setAuthed(true);
      } else {
        setError('Incorrect password');
        setPassword('');
      }
    } catch {
      setError('Something went wrong — try again');
    } finally {
      setChecking(false);
    }
  }

  // Still checking localStorage
  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 w-full max-w-sm shadow-sm">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🍽</div>
            <h1 className="text-lg font-bold text-gray-900">Meal Planner</h1>
            <p className="text-sm text-gray-400 mt-1">Enter password to continue</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-emerald-400 bg-white"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={checking || !password}
              className="w-full py-3 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {checking ? 'Checking…' : 'Enter'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
