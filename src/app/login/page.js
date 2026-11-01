"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import './login.css';
import ThemeSwitcher from '../../components/ThemeSwitcher';

export default function LoginPage() {
  const router = useRouter();
  const [panel, setPanel] = useState('login'); // 'login' or 'register'
  
  // Login Form States
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Register Form States
  const [regName, setRegName] = useState('');
  const [regAcademyName, setRegAcademyName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);

  useEffect(() => {
    // If already logged in, redirect immediately
    const token = localStorage.getItem('ams_token');
    const user = JSON.parse(localStorage.getItem('ams_user') || 'null');
    if (token && user) {
      redirectByRole(user.role);
    }
  }, []);

  const redirectByRole = (role) => {
    if (role === 'SUPER_ADMIN') {
      router.replace('/super-admin');
    } else {
      router.replace('/dashboard');
    }
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setLoginError('');
    if (!loginEmail || !loginPassword) {
      setLoginError('Please enter email and password.');
      return;
    }
    setLoginLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Login failed.');
        return;
      }
      localStorage.setItem('ams_token', data.token);
      localStorage.setItem('ams_user', JSON.stringify(data.user));
      redirectByRole(data.user.role);
    } catch (err) {
      setLoginError('Cannot connect to server. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e) => {
    if (e) e.preventDefault();
    setRegError('');
    setRegSuccess('');
    if (!regName || !regEmail || !regPassword) {
      setRegError('Name, email, and password are required.');
      return;
    }
    if (regPassword.length < 6) {
      setRegError('Password must be at least 6 characters.');
      return;
    }
    setRegLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName,
          email: regEmail,
          password: regPassword,
          academyName: regAcademyName
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setRegError(data.error || 'Registration failed.');
        return;
      }
      // No token is issued on register anymore — account is pending Super
      // Admin approval. Show the message and drop them back on the login
      // form instead of redirecting into the app.
      setRegSuccess(data.message || 'Registration successful. Please wait for Super Admin approval.');
      setRegName('');
      setRegAcademyName('');
      setRegEmail('');
      setRegPassword('');
    } catch (err) {
      setRegError('Cannot connect to server. Please try again.');
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div className="login-body">
      <link
        href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      <div className="mesh"></div>
      <a className="back-home" href="/landing">&larr; Back to home</a>
      <div className="login-theme-switcher"><ThemeSwitcher /></div>
      <div className="login-card">
        <div className="logo">Academy<span> Manager</span></div>
        <div className="logo-sub">Academy Management System</div>

        {panel === 'login' ? (
          <div>
            <h2>Welcome back</h2>
            <p className="sub-text">Sign in to your academy dashboard.</p>

            {loginError && <div className="error-box">{loginError}</div>}

            <form onSubmit={handleLogin}>
              <label htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
                type="email"
                placeholder="coach@academy.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                autoComplete="email"
              />

              <label htmlFor="login-password">Password</label>
              <div className="password-field">
                <input
                  id="login-password"
                  type={showLoginPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowLoginPassword(v => !v)}
                  aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showLoginPassword ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>

              <button className="btn-login" disabled={loginLoading} type="submit">
                {loginLoading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <div className="register-link">
              Don't have an account?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setPanel('register'); setLoginError(''); }}>
                Register
              </a>
            </div>
          </div>
        ) : (
          <div>
            <h2>Create Account</h2>
            <p className="sub-text">Set up your academy on the Pro or Enterprise plan.</p>

            {regError && <div className="error-box">{regError}</div>}
            {regSuccess && <div className="success-box">{regSuccess}</div>}

            <form onSubmit={handleRegister}>
              <label htmlFor="reg-name">Your Name</label>
              <input
                id="reg-name"
                type="text"
                placeholder="Coach / Manager name"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
              />

              <label htmlFor="reg-academy">Academy Name</label>
              <input
                id="reg-academy"
                type="text"
                placeholder="Vibrant FC Academy"
                value={regAcademyName}
                onChange={(e) => setRegAcademyName(e.target.value)}
              />

              <label htmlFor="reg-email">Email Address</label>
              <input
                id="reg-email"
                type="email"
                placeholder="coach@academy.com"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
              />

              <label htmlFor="reg-password">Password</label>
              <div className="password-field">
                <input
                  id="reg-password"
                  type={showRegPassword ? 'text' : 'password'}
                  placeholder="Min 6 characters"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowRegPassword(v => !v)}
                  aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showRegPassword ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>

              <button className="btn-login" disabled={regLoading} type="submit">
                {regLoading ? 'Creating account…' : 'Create Account'}
              </button>
            </form>

            <div className="register-link">
              Already have an account?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setPanel('login'); setRegError(''); }}>
                Sign in
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
