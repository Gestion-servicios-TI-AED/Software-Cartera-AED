import { useState } from 'react';
import { login } from '../utils/api';
import logoBaiaKristal from '../assets/baia-kristal-logo.png';

// Temporalmente el modo por defecto es solo la clave compartida (ver
// APP_PASSWORD en el backend) mientras se crea la cuenta individual de cada
// persona -- da acceso a todos los módulos pero no a Ajustes. Quien ya tenga
// cuenta propia (hoy solo el admin) usa el enlace de abajo para entrar con
// correo + contraseña en su lugar. Cuando todo el mundo tenga su cuenta,
// quitar el modo "clave compartida" y dejar solo el de correo/contraseña.
export default function Login({ onSuccess }) {
  const [modoCorreo, setModoCorreo] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(modoCorreo ? email : undefined, password);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const cambiarModo = () => {
    setModoCorreo((prev) => !prev);
    setPassword('');
    setError(null);
  };

  return (
    <div className="flex items-center justify-center h-screen bg-aed-base">
      <form onSubmit={handleSubmit} className="card w-full max-w-[340px] p-6 flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 mb-1">
          <img src={logoBaiaKristal} alt="Baía Kristal" className="w-24 h-auto" />
          <h1 className="font-heading text-[17px] font-bold text-ink">Cartera AED</h1>
          <p className="text-[13px] text-slate-500">
            {modoCorreo ? 'Ingresa con tu cuenta' : 'Ingresa la clave de acceso'}
          </p>
        </div>

        {modoCorreo && (
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Correo"
            className="input text-[14px] h-10"
          />
        )}

        <input
          type="password"
          autoFocus={!modoCorreo}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={modoCorreo ? 'Contraseña' : 'Clave'}
          className="input text-[14px] h-10"
        />

        {error && <p className="text-[13px] text-red-600 -mt-1">{error}</p>}

        <button
          type="submit"
          disabled={loading || !password || (modoCorreo && !email)}
          className="btn-primary text-[14px] h-10 justify-center disabled:opacity-60"
        >
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>

        <button
          type="button"
          onClick={cambiarModo}
          className="text-[12.5px] text-slate-400 hover:text-slate-600 transition-colors -mt-1"
        >
          {modoCorreo ? '← Usar la clave de acceso' : '¿Tienes cuenta propia? Ingresa con correo'}
        </button>
      </form>
    </div>
  );
}
