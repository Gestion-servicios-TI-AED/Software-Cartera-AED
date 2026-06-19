import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Negocios from './pages/Negocios';
import Dashboard from './pages/Dashboard';
import OpportunityDetail from './pages/OpportunityDetail';
import FiduciaModule from './pages/FiduciaModule';
import FiduciaDetalle from './pages/FiduciaDetalle';
import FiduciaMovimientos from './pages/FiduciaMovimientos';
import FiduciaPropietario from './pages/FiduciaPropietario';
import EncargoNomenclaturas from './pages/EncargoNomenclaturas';
import ApartamentoDetalle from './pages/ApartamentoDetalle';
import Resumen from './pages/Resumen';
import Ajustes from './pages/Ajustes';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Negocios />} />
            <Route path="/oportunidades" element={<Dashboard />} />
            <Route path="/opportunity/:id" element={<OpportunityDetail />} />
            <Route path="/fiducia" element={<FiduciaModule />} />
            <Route path="/fiducia/movimientos" element={<FiduciaMovimientos />} />
            <Route path="/fiducia/propietario/:nombre" element={<FiduciaPropietario />} />
            <Route path="/fiducia/:id/nomenclaturas" element={<EncargoNomenclaturas />} />
            <Route path="/fiducia/:id/apartamento/:nomenclatura" element={<ApartamentoDetalle />} />
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
