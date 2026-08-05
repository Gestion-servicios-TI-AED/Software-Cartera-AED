const express = require('express');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const { procesarArchivoFiducia } = require('../services/fiduciaService');
const { runBackfill } = require('./negocios');
const { requireModulo } = require('../../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// POST /api/fiducia/upload — carga manual de un archivo Excel
router.post('/upload', requireModulo('encargos'), upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

    const { nombre, codigo, emailId, emailAsunto, emailFecha } = req.body;
    const result = await procesarArchivoFiducia(req.file.buffer, req.file.originalname, {
      nombre: nombre || undefined,
      codigo: codigo || undefined,
      emailId: emailId || undefined,
      emailAsunto: emailAsunto || undefined,
      emailFecha: emailFecha || undefined,
    });

    if (result.skipped) {
      return res.status(200).json({ message: 'Archivo ya importado anteriormente, omitido', encargo: result.encargo });
    }
    res.status(201).json({
      message: 'Archivo procesado correctamente',
      encargo: result.encargo,
      hojas: result.hojas,
    });
    runBackfill().catch((err) => console.error('[backfill/auto]', err.message));
  } catch (err) {
    console.error('[fiducia/upload]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fiducia/encargos — lista paginada con búsqueda
router.get('/encargos', requireModulo(['encargos', 'oportunidades']), async (req, res) => {
  try {
    const { search, proyecto, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const where = {};
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { codigo: { contains: search, mode: 'insensitive' } },
        { archivoNombre: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (proyecto) {
      where.codigo = { contains: proyecto, mode: 'insensitive' };
    }

    const [total, encargos] = await Promise.all([
      prisma.encargFiduciario.count({ where }),
      prisma.encargFiduciario.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          hojas: {
            select: { id: true, nombreHoja: true, totalFilas: true },
            orderBy: { nombreHoja: 'asc' },
          },
        },
      }),
    ]);

    // Códigos únicos para el dropdown de filtro
    const codigosRaw = await prisma.encargFiduciario.findMany({
      select: { codigo: true },
      where: { codigo: { not: null } },
      distinct: ['codigo'],
      orderBy: { codigo: 'asc' },
    });

    res.json({
      data: encargos,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
      codigos: codigosRaw.map((c) => c.codigo).filter(Boolean),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fiducia/encargos/:id — detalle del encargo con lista de hojas
router.get('/encargos/:id', requireModulo('encargos'), async (req, res) => {
  try {
    const encargo = await prisma.encargFiduciario.findUnique({
      where: { id: req.params.id },
      include: {
        hojas: {
          select: { id: true, nombreHoja: true, totalFilas: true },
          orderBy: { nombreHoja: 'asc' },
        },
      },
    });
    if (!encargo) return res.status(404).json({ error: 'Encargo no encontrado' });
    res.json(encargo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fiducia/encargos/:id/hojas/:hojaId — datos completos de una hoja (paginado)
router.get('/encargos/:id/hojas/:hojaId', requireModulo('encargos'), async (req, res) => {
  try {
    const { page = '1', limit = '200' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(500, Math.max(1, parseInt(limit)));

    const hoja = await prisma.hojaFiduciaria.findFirst({
      where: { id: req.params.hojaId, encargId: req.params.id },
    });
    if (!hoja) return res.status(404).json({ error: 'Hoja no encontrada' });

    const allFilas = Array.isArray(hoja.filas) ? hoja.filas : [];
    const start = (pageNum - 1) * limitNum;
    const paginatedFilas = allFilas.slice(start, start + limitNum);

    res.json({
      id: hoja.id,
      nombreHoja: hoja.nombreHoja,
      columnas: hoja.columnas,
      filas: paginatedFilas,
      pagination: {
        total: hoja.totalFilas,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(hoja.totalFilas / limitNum),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/fiducia/encargos/:id — actualiza nombre y/o código
router.patch('/encargos/:id', requireModulo('encargos'), async (req, res) => {
  try {
    const { nombre, codigo } = req.body;
    const updated = await prisma.encargFiduciario.update({
      where: { id: req.params.id },
      data: {
        ...(nombre !== undefined && { nombre }),
        ...(codigo !== undefined && { codigo }),
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/fiducia/encargos/:id
router.delete('/encargos/:id', requireModulo('encargos'), async (req, res) => {
  try {
    await prisma.encargFiduciario.delete({ where: { id: req.params.id } });
    res.json({ message: 'Eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/fiducia/encargos/:id — actualizar nombre o código del encargo
router.patch('/encargos/:id', requireModulo('encargos'), async (req, res) => {
  try {
    const { nombre, codigo } = req.body;
    const data = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (codigo !== undefined) data.codigo = codigo;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }

    const encargo = await prisma.encargFiduciario.update({
      where: { id: req.params.id },
      data,
    });
    res.json(encargo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fiducia/movimientos — todos los movimientos con filtros
// Params: encargId, codigo, propietario, hoja, search,
//         fechaDesde, fechaHasta (ISO: YYYY-MM-DD, filtra 'Fecha Contable' DD/MM/YYYY),
//         sortField (propietario|hoja|createdAt), sortDir (asc|desc),
//         page, limit
router.get('/movimientos', requireModulo('encargos'), async (req, res) => {
  try {
    const {
      encargId: rawEncargId, codigo, propietario, hoja, search,
      page = '1', limit = '50',
      fechaDesde, fechaHasta,
      sortField, sortDir,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Resolver encargId desde código si no viene el UUID directo
    let encargId = rawEncargId;
    if (!encargId && codigo) {
      const enc = await prisma.encargFiduciario.findFirst({
        where: { codigo: { contains: codigo, mode: 'insensitive' } },
        select: { id: true },
      });
      if (enc) encargId = enc.id;
    }

    const ALLOWED_SORT = { propietario: 'propietario', hoja: 'nombreHoja', createdAt: 'createdAt' };
    const resolvedSort = ALLOWED_SORT[sortField] || 'propietario';
    const resolvedDir = sortDir === 'desc' ? 'desc' : 'asc';

    let total, records;

    if (fechaDesde || fechaHasta) {
      // Filtro por fecha en campo JSON 'Fecha Contable' (formato DD/MM/YYYY)
      // Usa $queryRawUnsafe con parámetros posicionales para seguridad
      const sqlConds = [];
      const params = [];
      let idx = 1;

      if (encargId) {
        sqlConds.push(`m."encargId" = $${idx++}::uuid`);
        params.push(encargId);
      }
      if (hoja) {
        sqlConds.push(`m."nombreHoja" = $${idx++}`);
        params.push(hoja);
      }
      if (propietario) {
        sqlConds.push(`m.propietario ILIKE $${idx++}`);
        params.push(`%${propietario}%`);
      }
      if (search) {
        sqlConds.push(`(m.propietario ILIKE $${idx} OR m.datos::text ILIKE $${idx + 1})`);
        params.push(`%${search}%`, `%${search}%`);
        idx += 2;
      }
      if (fechaDesde) {
        sqlConds.push(
          `(m.datos->>'Fecha Contable' ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'` +
          ` AND to_date(m.datos->>'Fecha Contable', 'DD/MM/YYYY') >= $${idx++}::date)`
        );
        params.push(fechaDesde);
      }
      if (fechaHasta) {
        sqlConds.push(
          `(m.datos->>'Fecha Contable' ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'` +
          ` AND to_date(m.datos->>'Fecha Contable', 'DD/MM/YYYY') <= $${idx++}::date)`
        );
        params.push(fechaHasta);
      }

      const whereSQL = sqlConds.length ? `WHERE ${sqlConds.join(' AND ')}` : '';
      const limitIdx = idx++;
      const skipIdx = idx++;

      const [countRows, rawRecords] = await Promise.all([
        prisma.$queryRawUnsafe(
          `SELECT COUNT(*)::int AS count FROM "MovimientoFiduciario" m ${whereSQL}`,
          ...params
        ),
        prisma.$queryRawUnsafe(
          `SELECT m.id, m."encargId", m."hojaId", m."nombreHoja", m.propietario, m.datos, m."createdAt",
                  e.nombre AS encargo_nombre, e.codigo AS encargo_codigo, e."archivoNombre" AS encargo_archivo
           FROM "MovimientoFiduciario" m
           LEFT JOIN "EncargFiduciario" e ON m."encargId" = e.id
           ${whereSQL}
           ORDER BY m.propietario ASC, m."createdAt" ASC
           LIMIT $${limitIdx} OFFSET $${skipIdx}`,
          ...params, limitNum, skip
        ),
      ]);

      total = Number(countRows[0]?.count || 0);
      records = rawRecords.map((r) => ({
        id: r.id,
        encargId: r.encargId,
        hojaId: r.hojaId,
        nombreHoja: r.nombreHoja,
        propietario: r.propietario,
        datos: r.datos,
        createdAt: r.createdAt,
        encargo: { nombre: r.encargo_nombre, codigo: r.encargo_codigo, archivoNombre: r.encargo_archivo },
      }));
    } else {
      // Consulta normal con Prisma ORM
      const where = {};
      if (encargId) where.encargId = encargId;
      if (hoja) where.nombreHoja = hoja;
      if (propietario) where.propietario = { contains: propietario, mode: 'insensitive' };
      if (search) {
        where.OR = [
          { propietario: { contains: search, mode: 'insensitive' } },
          { datos: { path: [], string_contains: search } },
        ];
      }

      [total, records] = await Promise.all([
        prisma.movimientoFiduciario.count({ where }),
        prisma.movimientoFiduciario.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: [{ [resolvedSort]: resolvedDir }],
          select: {
            id: true,
            encargId: true,
            hojaId: true,
            nombreHoja: true,
            propietario: true,
            datos: true,
            encargo: { select: { nombre: true, codigo: true, archivoNombre: true } },
          },
        }),
      ]);
    }

    res.json({
      data: records,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fiducia/propietarios — lista única de propietarios con conteo
router.get('/propietarios', requireModulo('encargos'), async (req, res) => {
  try {
    const { encargId, search } = req.query;

    const where = { propietario: { not: null } };
    if (encargId) where.encargId = encargId;
    if (search) where.propietario = { contains: search, mode: 'insensitive' };

    const grouped = await prisma.movimientoFiduciario.groupBy({
      by: ['propietario'],
      where,
      _count: { id: true },
      orderBy: { propietario: 'asc' },
    });

    res.json(
      grouped.map((g) => ({ propietario: g.propietario, total: g._count.id }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fiducia/encargos/:id/nomenclaturas — lista de nomenclaturas del encargo (desde Negocio)
router.get('/encargos/:id/nomenclaturas', requireModulo('encargos'), async (req, res) => {
  try {
    const { search, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

    const encargo = await prisma.encargFiduciario.findUnique({
      where: { id: req.params.id },
      select: { id: true, nombre: true, codigo: true },
    });
    if (!encargo) {
      return res.json({ data: [], pagination: { total: 0, page: 1, limit: limitNum, totalPages: 0 } });
    }

    // Filtrar negocios por fideicomiso usando el código del encargo
    const andConds = [];
    if (encargo.codigo) {
      andConds.push({ datos: { path: ['Fideicomiso'], string_contains: encargo.codigo } });
    }
    if (search) {
      andConds.push({
        OR: [
          { datos: { path: ['Nomenclatura'], string_contains: search } },
          { datos: { path: ['Inventario'],   string_contains: search } },
          { compradores: { some: { nombre: { contains: search, mode: 'insensitive' } } } },
        ],
      });
    }

    const negocioWhere = andConds.length > 0 ? { AND: andConds } : {};

    const negocios = await prisma.negocio.findMany({
      where: negocioWhere,
      include: {
        compradores: { orderBy: { orden: 'asc' }, take: 1 },
        _count: { select: { movimientos: true } },
      },
    });

    let items = negocios
      .filter((n) => n.datos?.Nomenclatura)
      .map((n) => {
        const comp = n.compradores[0];
        const compradorPrincipal = comp?.nombre
          ? comp.nombre.replace(/^\d+\s+/, '').replace(/\s*\(\d+\.?\d*%\)\s*$/, '')
          : null;
        return {
          nomenclatura:      n.datos.Nomenclatura,
          referencia:        n.referencia,
          estado:            n.estado,
          compradorPrincipal,
          nroId:             comp?.nroId ?? null,
          saldoActual:       n.saldoActual ?? null,
          totalMovimientos:  n._count.movimientos,
          tipo:              n.datos?.['Tipo Inmueble'] ?? n.datos?.Categoria ?? null,
          inventario:        n.datos?.Inventario ?? null,
        };
      })
      .sort((a, b) => a.nomenclatura.localeCompare(b.nomenclatura, 'es-CO', { numeric: true }));

    const total     = items.length;
    const paginated = items.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.json({
      data: paginated,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error('[fiducia/nomenclaturas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fiducia/encargos/:id/negocio/:referencia — detalle de un apartamento (desde Negocio)
//
// Se identifica por Referencia (clave única de Negocio), NO por Nomenclatura:
// el número de apartamento se repite entre edificios/etapas de un mismo
// fideicomiso (ej. "6C" existe en varias torres), así que buscar solo por
// Nomenclatura + Fideicomiso podía devolver un apartamento equivocado.
router.get('/encargos/:id/negocio/:referencia', requireModulo('encargos'), async (req, res) => {
  try {
    const referencia = decodeURIComponent(req.params.referencia);

    const encargo = await prisma.encargFiduciario.findUnique({
      where: { id: req.params.id },
      select: { id: true, nombre: true, codigo: true },
    });
    if (!encargo) return res.status(404).json({ error: 'Encargo no encontrado' });

    const negocio = await prisma.negocio.findUnique({
      where: { referencia },
      include: { compradores: { orderBy: { orden: 'asc' } } },
    });

    if (!negocio) {
      return res.status(404).json({
        error: 'Negocio no encontrado para esta referencia. Ejecuta el backfill en el módulo Negocios.',
      });
    }

    const [totalMovimientos, movimientos] = await Promise.all([
      prisma.negocioMovimiento.count({ where: { negocioId: negocio.id } }),
      prisma.negocioMovimiento.findMany({
        where: { negocioId: negocio.id },
        orderBy: [{ fechaContable: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: 500,
      }),
    ]);

    res.json({
      nomenclatura: negocio.datos?.Nomenclatura ?? null,
      encargo,
      negocio: {
        id:          negocio.id,
        referencia:  negocio.referencia,
        estado:      negocio.estado,
        datos:       negocio.datos,
        saldoActual: negocio.saldoActual,
        compradores: negocio.compradores,
      },
      movimientos: movimientos.map((m) => ({
        id:            m.id,
        idMovimiento:  m.idMovimiento,
        fechaContable: m.fechaContable,
        datos:         m.datos,
      })),
      totalMovimientos,
    });
  } catch (err) {
    console.error('[fiducia/apartamento-detail]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
