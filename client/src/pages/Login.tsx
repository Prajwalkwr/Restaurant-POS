import { useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getDashboardPath, useAuth } from '../lib/auth';
import loginBackground from '../assets/hero-nepal.webp';

interface LoginProps {
  onClose?: () => void;
}

export default function Login({ onClose }: LoginProps) {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (user) nav(getDashboardPath(user.role), { replace: true });
  }, [user, nav]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (onClose) onClose();
        else nav('/', { replace: true });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, nav]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setErr('');
    try {
      const authenticatedUser = await login(email.trim(), password);
    nav(getDashboardPath(authenticatedUser.role), { replace: true });
    } catch (error: unknown) {
      if (axios.isAxiosError<{ error?: string }>(error)) {
        if (!error.response) {
          setErr('Cannot reach the login service. Check that the server is running, then try again.');
        } else if (error.response.status >= 500) {
          setErr('The login service is unavailable. Check the server and database, then try again.');
        } else {
          setErr(error.response.data?.error || 'Unable to sign in. Check your email and password.');
        }
      } else {
        setErr(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="login-overlay fixed inset-0 z-[100] flex justify-center overflow-y-auto p-4"
      style={{ backgroundImage: `linear-gradient(rgba(20, 31, 27, .34), rgba(20, 31, 27, .48)), url("${loginBackground}")` }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          if (onClose) onClose();
          else nav('/', { replace: true });
        }
      }}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        className="login-form relative w-full"
      >
        <button
          type="button"
          onClick={() => onClose ? onClose() : nav('/', { replace: true })}
          aria-label="Close login and return to home"
          className="login-close"
        >
          ×
        </button>
        <div className="login-brand-row">
          <button type="button" onClick={() => onClose ? onClose() : nav('/', { replace: true })} className="login-brand transition-opacity hover:opacity-80" aria-label="RestoPOS home">
            <svg aria-hidden="true" viewBox="0 0 48 48" fill="none">
              <path d="M7 38h34M11 34h26M14 32V24h20v8M9 23h30L24 15 9 23Zm5-5 10-9 10 9M18 27h4m4 0h4M24 9V5m-3 0h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>RestoPOS</span>
          </button>
        </div>
        <div className="login-heading">
          <h1 id="login-title">Welcome back</h1>
          <p>Sign in to open your restaurant dashboard.</p>
        </div>
        {err && <div role="alert" className="login-error">{err}</div>}
        <div className="login-field">
          <label htmlFor="email">Email</label>
          <div className="login-input-wrap">
            <Mail aria-hidden="true" />
            <input id="email" name="email" type="email" autoComplete="username" autoFocus required value={email} onChange={e => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="login-field">
          <label htmlFor="password">Password</label>
          <div className="login-input-wrap">
            <LockKeyhole aria-hidden="true" />
            <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
            <button type="button" className="login-password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading} className="login-submit">
          {loading ? 'Signing in…' : <>Sign in <ArrowRight aria-hidden="true" /></>}
        </button>
        <div className="login-ornament" aria-hidden="true">
          <span />
          <svg viewBox="0 0 32 24" fill="none"><path d="M16 20c-5-5-8-9-8-12 0-2 2-3 4-2l4 4 4-4c2-1 4 0 4 2 0 3-3 7-8 12Zm0-11v11m-8-8 8 8m8-8-8 8M4 20h24" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span />
        </div>
      </form>
    </div>
  );
}
