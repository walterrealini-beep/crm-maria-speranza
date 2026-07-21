import React, { useState, useEffect } from 'react';
import { auth } from './firebase.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import App from './App.jsx';

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, sans-serif; background: #F5F4F0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .login-wrap { width: 100%; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: #F5F4F0; }
  .login-card { background: #fff; border: 1px solid #E3E0D8; border-radius: 16px; padding: 40px 36px; width: 100%; max-width: 400px; box-shadow: 0 8px 32px rgba(0,0,0,0.08); }
  .login-logo { display: flex; justify-content: center; margin-bottom: 20px; }
  .login-seal { width: 56px; height: 56px; border-radius: 50%; background: #2F5D62; color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'Fraunces', serif; font-weight: 700; font-size: 18px; }
  .login-title { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 600; text-align: center; color: #20242B; margin-bottom: 4px; }
  .login-sub { text-align: center; color: #767D87; font-size: 13.5px; margin-bottom: 28px; }
  .login-form { display: flex; flex-direction: column; gap: 14px; }
  .field { display: flex; flex-direction: column; gap: 5px; }
  .field-label { font-size: 12px; font-weight: 600; color: #4B5159; }
  .input { border: 1px solid #E3E0D8; border-radius: 8px; padding: 10px 12px; font-size: 14px; font-family: inherit; background: #FBFAF7; color: #20242B; width: 100%; transition: outline 0.15s; }
  .input:focus { outline: 2px solid #2F5D62; outline-offset: 1px; background: #fff; }
  .btn-login { background: #2F5D62; color: #fff; border: none; border-radius: 8px; padding: 11px; font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; width: 100%; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .btn-login:hover { background: #264c50; }
  .btn-login:disabled { opacity: 0.6; cursor: not-allowed; }
  .login-error { background: #FAE6E8; color: #B23A48; font-size: 12.5px; padding: 8px 12px; border-radius: 8px; text-align: center; }
  .forgot-link { text-align: center; font-size: 12.5px; color: #767D87; cursor: pointer; text-decoration: underline; margin-top: 4px; }
  .forgot-link:hover { color: #2F5D62; }
  .reset-msg { background: #E6F0E8; color: #3F7D58; font-size: 12.5px; padding: 8px 12px; border-radius: 8px; text-align: center; }
  .spin { animation: spin 0.9s linear infinite; display: inline-block; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

function Spinner() {
  return (
    <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  );
}

export default function Root() {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  // Cargando estado de auth
  if (user === undefined) {
    return (
      <>
        <style>{CSS}</style>
        <div className="login-wrap">
          <div className="login-card" style={{ textAlign: 'center' }}>
            <Spinner /> <span style={{ marginLeft: 8, color: '#767D87' }}>Verificando sesión…</span>
          </div>
        </div>
      </>
    );
  }

  // Usuario autenticado → mostrar CRM
  if (user) return <App user={user} onLogout={() => signOut(auth)} />;

  // Login
  async function handleLogin() {
    setError(''); setResetSent(false);
    if (!email.trim() || !password) return setError('Completá email y contraseña.');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      const msgs = {
        'auth/user-not-found': 'No existe una cuenta con ese email.',
        'auth/wrong-password': 'Contraseña incorrecta.',
        'auth/invalid-email': 'El email no es válido.',
        'auth/invalid-credential': 'Email o contraseña incorrectos.',
        'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos.',
      };
      setError(msgs[e.code] || 'Error al iniciar sesión. Intentá de nuevo.');
    }
    setLoading(false);
  }

  async function handleReset() {
    if (!email.trim()) return setError('Ingresá tu email arriba para resetear la contraseña.');
    setError('');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
    } catch {
      setError('No se pudo enviar el email. Verificá la dirección.');
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">
            <div className="login-seal">MS</div>
          </div>
          <h1 className="login-title">Maria Speranza</h1>
          <p className="login-sub">Ingresá con tu cuenta del equipo</p>

          <div className="login-form">
            <div className="field">
              <span className="field-label">Email</span>
              <input
                className="input" type="email" placeholder="tu@email.com"
                value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                autoFocus
              />
            </div>
            <div className="field">
              <span className="field-label">Contraseña</span>
              <input
                className="input" type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>

            {error && <p className="login-error">{error}</p>}
            {resetSent && <p className="reset-msg">✓ Te enviamos un email para resetear la contraseña.</p>}

            <button className="btn-login" onClick={handleLogin} disabled={loading}>
              {loading ? <><Spinner /> Ingresando…</> : 'Ingresar'}
            </button>

            <p className="forgot-link" onClick={handleReset}>
              Olvidé mi contraseña
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
