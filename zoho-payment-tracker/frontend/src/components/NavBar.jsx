import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

export default function NavBar() {
  const location = useLocation();
  const base = 'px-4 py-2 text-sm font-medium rounded-md transition-colors';
  const active = `${base} bg-blue-600 text-white`;
  const inactive = `${base} text-gray-600 hover:bg-gray-100`;

  const isFiducia = location.pathname.startsWith('/fiducia');
  const isMovimientos = location.pathname === '/fiducia/movimientos';

  return (
    <nav className="flex items-center gap-1">
      <NavLink to="/" end className={({ isActive }) => (isActive ? active : inactive)}>
        Oportunidades
      </NavLink>
      <NavLink
        to="/fiducia"
        className={isFiducia && !isMovimientos ? active : inactive}
      >
        Encargos
      </NavLink>
      <NavLink
        to="/fiducia/movimientos"
        className={isMovimientos ? active : inactive}
      >
        Movimientos
      </NavLink>
    </nav>
  );
}
