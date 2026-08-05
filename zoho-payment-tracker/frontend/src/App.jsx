import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import RutaProtegida from './components/RutaProtegida';
import Login from './pages/Login';
import Negocios from './pages/Negocios';
import Inventario from './pages/Inventario';
import Dashboard from './pages/Dashboard';
import ReportePlanRecaudo from './pages/ReportePlanRecaudo';
import CarteraMora from './pages/CarteraMora';
import OpportunityDetail from './pages/OpportunityDetail';
import FiduciaModule from './pages/FiduciaModule';
import FiduciaDetalle from './pages/FiduciaDetalle';
import FiduciaMovimientos from './pages/FiduciaMovimientos';
import FiduciaPropietario from './pages/FiduciaPropietario';
import EncargoNomenclaturas from './pages/EncargoNomenclaturas';
import ApartamentoDetalle from './pages/ApartamentoDetalle';
import Resumen from './pages/Resumen';
import Ajustes from './pages/Ajustes';
import Alegra from './pages/Alegra';
import { MODULOS_ALEGRA } from './config/navItems';
import { cargarUsuarioActual, limpiarUsuarioActual } from './utils/usuarioActual';

export default function App() {
  const [authed, setAuthed] = useState(null); // null = verificando

  useEffect(() => {
    cargarUsuarioActual()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null;
  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar onLogout={() => { limpiarUsuarioActual(); setAuthed(false); }} />
        <div className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<RutaProtegida modulo="negocios"><Negocios /></RutaProtegida>} />
            <Route path="/inventario" element={<RutaProtegida modulo="inventario"><Inventario /></RutaProtegida>} />
            <Route path="/oportunidades" element={<RutaProtegida modulo="oportunidades"><Dashboard /></RutaProtegida>} />
            <Route path="/dashboard" element={<RutaProtegida modulo="dashboard"><ReportePlanRecaudo /></RutaProtegida>} />
            <Route path="/cartera-mora" element={<RutaProtegida modulo="cartera-mora"><CarteraMora /></RutaProtegida>} />
            <Route path="/opportunity/:id" element={<RutaProtegida modulo="oportunidades"><OpportunityDetail /></RutaProtegida>} />
            <Route path="/fiducia" element={<RutaProtegida modulo="encargos"><FiduciaModule /></RutaProtegida>} />
            <Route path="/fiducia/movimientos" element={<RutaProtegida modulo="movimientos"><FiduciaMovimientos /></RutaProtegida>} />
            <Route path="/fiducia/propietario/:nombre" element={<RutaProtegida modulo="movimientos"><FiduciaPropietario /></RutaProtegida>} />
            <Route path="/fiducia/:id/nomenclaturas" element={<RutaProtegida modulo="encargos"><EncargoNomenclaturas /></RutaProtegida>} />
            <Route path="/fiducia/:id/apartamento/:referencia" element={<RutaProtegida modulo="encargos"><ApartamentoDetalle /></RutaProtegida>} />
            <Route path="/fiducia/:id" element={<RutaProtegida modulo="encargos"><FiduciaDetalle /></RutaProtegida>} />
            <Route path="/resumen" element={<RutaProtegida modulo="resumen"><Resumen /></RutaProtegida>} />
            <Route path="/ajustes" element={<RutaProtegida soloAdmin><Ajustes /></RutaProtegida>} />
            <Route path="/alegra/*" element={<RutaProtegida modulo={MODULOS_ALEGRA}><Alegra /></RutaProtegida>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
