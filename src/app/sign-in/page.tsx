'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignInPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push('/executive');
      router.refresh();
    } else {
      setError('Incorrect password');
      setLoading(false);
    }
  }

  return (
    <div className="sign-in-page">
      <form className="sign-in-card" onSubmit={handleSubmit}>
        <svg
          width="40"
          height="40"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <ellipse cx="10" cy="5.5" rx="5" ry="5" fill="#00E3CD" opacity=".9" />
          <rect x="9" y="9.5" width="2.2" height="8" rx="1.1" fill="#00E3CD" opacity=".7" />
        </svg>
        <h1 className="sign-in-title">Little Spoon</h1>
        <p className="sign-in-subtitle">Target Demand Intelligence</p>

        {error && <div className="sign-in-error">{error}</div>}

        <input
          type="password"
          className="sign-in-input"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        <button className="sign-in-btn" type="submit" disabled={loading || !password}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
