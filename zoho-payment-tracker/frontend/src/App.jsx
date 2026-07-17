import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
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
import { checkAuth } from './utils/api';

export default function App() {
  const [authed, setAuthed] = useState(null); // null = verificando

  useEffect(() => {
    checkAuth()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null;
  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar onLogout={() => setAuthed(false)} />
        <div className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Negocios />} />
            <Route path="/inventario" element={<Inventario />} />
            <Route path="/oportunidades" element={<Dashboard />} />
            <Route path="/dashboard" element={<ReportePlanRecaudo />} />
            <Route path="/cartera-mora" element={<CarteraMora />} />
            <Route path="/opportunity/:id" element={<OpportunityDetail />} />
            <Route path="/fiducia" element={<FiduciaModule />} />
            <Route path="/fiducia/movimientos" element={<FiduciaMovimientos />} />
            <Route path="/fiducia/propietario/:nombre" element={<FiduciaPropietario />} />
            <Route path="/fiducia/:id/nomenclaturas" element={<EncargoNomenclaturas />} />
            <Route path="/fiducia/:id/apartamento/:referencia" element={<ApartamentoDetalle />} />
            <Route path="/fiducia/:id" element={<FiduciaDetalle />} />
            <Route path="/resumen" element={<Resumen />} />
            <Route path="/ajustes" element={<Ajustes />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
