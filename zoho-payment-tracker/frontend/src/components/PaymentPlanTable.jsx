import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { getOpportunities, getStages } from '../utils/api';
import { formatCOP, formatDate, formatDateTime } from '../utils/format';
import FilterBar from './FilterBar';
import StageBadge from './StageBadge';

const columnHelper = createColumnHelper();

const columns = [
  columnHelper.accessor('dealName', {
    header: 'Oportunidad',
    cell: (info) => (
      <span className="font-medium text-gray-900">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor('contactName', {
    header: 'Contacto',
    cell: (info) => info.getValue() || <span className="text-gray-400">—</span>,
  }),
  columnHelper.accessor('stage', {
    header: 'Etapa',
    cell: (info) => <StageBadge stage={info.getValue()} />,
  }),
  columnHelper.accessor('pagoSeparacion', {
    header: 'Pago Separación',
    cell: (info) => (
      <span className="font-mono text-sm">{formatDate(info.getValue())}</span>
    ),
  }),
  columnHelper.accessor('camposFinancieros', {
    header: 'Valor Total',
    cell: (info) => {
      const campos = info.getValue();
      const amount = campos?.Amount ?? info.row.original.Amount;
      return (
        <span className="font-mono text-sm">{formatCOP(amount)}</span>
      );
    },
  }),
  columnHelper.accessor('referenciaRecaudo', {
    header: 'Ref. Recaudo',
    cell: (info) =>
      info.getValue() ? (
        <span className="font-mono text-xs bg-amber-50 text-amber-800 px-2 py-0.5 rounded">
          {info.getValue()}
        </span>
      ) : (
        <span className="text-gray-400">—</span>
      ),
  }),
  columnHelper.accessor('lastSyncedAt', {
    header: 'Última Sync',
    cell: (info) => (
      <span className="text-xs text-gray-500">{formatDateTime(info.getValue())}</span>
    ),
  }),
];

export default function PaymentPlanTable() {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [stages, setStages] = useState([]);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getOpportunities({ search, stage, page, limit: 20 });
      setData(result.data);
      setPagination(result.pagination);
    } catch (err) {
      console.error('Error cargando oportunidades:', err);
    } finally {
      setLoading(false);
    }
  }, [search, stage, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getStages()
      .then(setStages)
      .catch(() => {});
  }, []);

  // Reset a página 1 cuando cambian filtros
  useEffect(() => {
    setPage(1);
  }, [search, stage]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: pagination.totalPages,
  });

  return (
    <div className="space-y-4">
      <FilterBar
        search={search}
        onSearch={setSearch}
        stage={stage}
        onStage={setStage}
        stages={stages}
      />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-gray-200 bg-gray-50">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-400">
                    <div className="flex justify-center items-center gap-2">
                      <svg className="w-5 h-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Cargando...
                    </div>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-400">
                    No se encontraron oportunidades
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => navigate(`/opportunity/${row.original.id}`)}
                    className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {pagination.total} registros · Página {pagination.page} de {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                ← Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
