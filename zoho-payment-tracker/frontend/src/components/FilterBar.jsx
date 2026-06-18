import React from 'react';
import { Search, ListFilter } from 'lucide-react';
import HelpTip from './HelpTip';

export default function FilterBar({ search, onSearch, stage, onStage, stages }) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Buscar */}
      <div className="field flex-1">
        <label className="field-label">
          <Search size={13} className="text-brand" />
          Buscar
          <HelpTip text="Escribe el nombre del negocio, el contacto o el número de referencia para filtrar la lista." />
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Nombre, contacto o referencia…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Etapa */}
      <div className="field w-full sm:w-56">
        <label className="field-label">
          <ListFilter size={13} className="text-info" />
          Etapa del negocio
          <HelpTip text="Filtra por la fase del proceso comercial (calificación, propuesta, negociación, cerrado…)." />
        </label>
        <select
          className="input"
          value={stage}
          onChange={(e) => onStage(e.target.value)}
        >
          <option value="">Todas las etapas</option>
          {stages.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
