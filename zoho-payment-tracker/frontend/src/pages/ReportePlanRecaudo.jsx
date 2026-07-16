import { useState, useEffect, useCallback, useMemo } from 'react';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getDashboardRecaudo } from '../utils/api';
import { formatCOP } from '../utils/format';

const columnHelper = createColumnHelper();

function formatMesLabel(mes) {
  const [anio, mesNum] = mes.split('-');
  const fecha = new Date(Date.UTC(Number(anio), Number(mesNum) - 1, 1));
  const etiqueta = fecha.toLocaleDateString('es-CO', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
}

const COLUMNAS_FIJAS = [
  columnHelper.accessor('etapa', {
    header: 'Etapa',
    cell: (info) => info.getValue() ?? <span className="text-slate-300">—</span>,
  }),
  columnHelper.accessor('frente', {
    header: 'Frente',
    cell: (info) => info.getValue() ?? <span className="text-slate-300">—</span>,
  }),
  columnHelper.accessor('torre', {
    header: 'Torre',
    cell: (info) => info.getValue() ?? <span className="text-slate-300">—</span>,
  }),
  columnHelper.accessor('nomenclatura', {
    header: 'Nomenclatura',
    cell: (info) => <span className="font-mono text-[13px]">{info.getValue() ?? '—'}</span>,
  }),
];

function construirColumnasMeses(meses) {
  return meses.map((mes) =>
    columnHelper.group({
      id: `mes-${mes}`,
      header: formatMesLabel(mes),
      columns: [
        columnHelper.accessor((row) => row.porMes[mes]?.esperado, {
          id: `${mes}-esperado`,
          header: 'Esperado',
          cell: (info) => {
            const v = info.getValue();
            return v == null ? <span className="text-slate-200">—</span> : <span className="font-mono text-[13px]">{formatCOP(v)}</span>;
          },
        }),
        columnHelper.accessor((row) => row.porMes[mes]?.recaudado, {
          id: `${mes}-recaudado`,
          header: 'Recaudado',
          cell: (info) => {
            const v = info.getValue();
            return v == null ? <span className="text-slate-200">—</span> : <span className="font-mono text-[13px] text-emerald-700">{formatCOP(v)}</span>;
          },
        }),
      ],
    })
  );
}

export default function ReportePlanRecaudo() {
  const [filas, setFilas] = useState([]);
  const [meses, setMeses] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDashboardRecaudo({ page, limit: 50 });
      setFilas(res.data);
      setMeses(res.meses);
      setPagination(res.pagination);
    } catch (err) {
      console.error('Error cargando dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const columns = useMemo(() => [...COLUMNAS_FIJAS, ...construirColumnasMeses(meses)], [meses]);

  const table = useReactTable({
    data: filas,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: pagination.totalPages,
  });

  return (
    <div className="p-5 flex flex-col gap-3">
      <h1 className="text-[19px] font-bold text-slate-800">Dashboard: Plan de pagos vs. Recaudo</h1>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-aed-border bg-aed-base">
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} colSpan={header.colSpan} className="section-label px-3 py-2 text-left whitespace-nowrap">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-400">Cargando…</td>
                </tr>
              ) : filas.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-400">Sin resultados.</td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-aed-border">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-aed-border flex items-center justify-between">
            <p className="text-[14px] text-slate-400">
              {pagination.total} inmuebles · Página {pagination.page} de {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary px-3 py-1.5 text-[14px] flex items-center gap-1">
                <ChevronLeft size={13} /> Anterior
              </button>
              <button onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages} className="btn-secondary px-3 py-1.5 text-[14px] flex items-center gap-1">
                Siguiente <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
