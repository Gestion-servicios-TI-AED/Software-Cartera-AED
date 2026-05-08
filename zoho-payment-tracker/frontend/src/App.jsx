import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import OpportunityDetail from './pages/OpportunityDetail';
import FiduciaModule from './pages/FiduciaModule';
import FiduciaDetalle from './pages/FiduciaDetalle';
import FiduciaMovimientos from './pages/FiduciaMovimientos';
import FiduciaPropietario from './pages/FiduciaPropietario';
import EncargoNomenclaturas from './pages/EncargoNomenclaturas';
import ApartamentoDetalle from './pages/ApartamentoDetalle';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/opportunity/:id" element={<OpportunityDetail />} />
        <Route path="/fiducia" element={<FiduciaModule />} />
        <Route path="/fiducia/movimientos" element={<FiduciaMovimientos />} />
        <Route path="/fiducia/propietario/:nombre" element={<FiduciaPropietario />} />
        <Route path="/fiducia/:id/nomenclaturas" element={<EncargoNomenclaturas />} />
        <Route path="/fiducia/:id/apartamento/:nomenclatura" element={<ApartamentoDetalle />} />
        <Route path="/fiducia/:id" element={<FiduciaDetalle />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

