import React from 'react';

export default function FilterBar({ search, onSearch, stage, onStage, stages }) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          className="input pl-9"
          placeholder="Buscar por nombre, contacto o referencia..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <select
        className="input w-full sm:w-56"
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
  );
}
