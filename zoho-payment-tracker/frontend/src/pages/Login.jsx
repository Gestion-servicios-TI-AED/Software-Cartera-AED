import { useState } from 'react';
import { login } from '../utils/api';
import logoBaiaKristal from '../assets/baia-kristal-logo.png';

export default function Login({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(password);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-aed-base">
      <form onSubmit={handleSubmit} className="card w-full max-w-[340px] p-6 flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 mb-1">
          <img src={logoBaiaKristal} alt="Baía Kristal" className="w-24 h-auto" />
          <h1 className="font-heading text-[17px] font-bold text-ink">Cartera AED</h1>
          <p className="text-[13px] text-slate-500">Ingresa la clave de acceso</p>
        </div>

        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Clave"
          className="input text-[14px] h-10"
        />

        {error && <p className="text-[13px] text-red-600 -mt-1">{error}</p>}

        <button type="submit" disabled={loading || !password} className="btn-primary text-[14px] h-10 justify-center disabled:opacity-60">
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
