const express = require('express');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const { procesarArchivoFiducia } = require('../services/fiduciaService');

const router = express.Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// POST /api/fiducia/upload — carga manual de un archivo Excel
router.post('/upload', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

    const { nombre, codigo } = req.body;
    const result = await procesarArchivoFiducia(req.file.buffer, req.file.originalname, {
      nombre: nombre || undefined,
      codigo: codigo || undefined,
    });

    res.status(201).json({
      message: 'Archivo procesado correctamente',
      encargo: result.encargo,
      hojas: result.hojas,
    });
  } catch (err) {
    console.error('[fiducia/upload]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fiducia/encargos — lista paginada con búsqueda
router.get('/encargos', async (req, res) => {
  try {
    const { search, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const where = search
      ? {
          OR: [
            { nombre: { contains: search, mode: 'insensitive' } },
            { codigo: { contains: search, mode: 'insensitive' } },
            { archivoNombre: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

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

    res.json({
      data: encargos,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fiducia/encargos/:id — detalle del encargo con lista de hojas
router.get('/encargos/:id', async (req, res) => {
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
router.get('/encargos/:id/hojas/:hojaId', async (req, res) => {
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
router.patch('/encargos/:id', async (req, res) => {
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
router.delete('/encargos/:id', async (req, res) => {
  try {
    await prisma.encargFiduciario.delete({ where: { id: req.params.id } });
    res.json({ message: 'Eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/fiducia/encargos/:id — actualizar nombre o código del encargo
router.patch('/encargos/:id', async (req, res) => {
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
router.get('/movimientos', async (req, res) => {
  try {
    const { encargId, propietario, hoja, search, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

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

    const [total, records] = await Promise.all([
      prisma.movimientoFiduciario.count({ where }),
      prisma.movimientoFiduciario.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: [{ propietario: 'asc' }, { createdAt: 'asc' }],
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

    res.json({
      data: records,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fiducia/propietarios — lista única de propietarios con conteo
router.get('/propietarios', async (req, res) => {
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

// GET /api/fiducia/encargos/:id/nomenclaturas — lista de nomenclaturas únicas del encargo
router.get('/encargos/:id/nomenclaturas', async (req, res) => {
  try {
    const { search, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

    // Obtener todas las hojas del encargo
    const hojas = await prisma.hojaFiduciaria.findMany({
      where: { encargId: req.params.id },
    });

    if (hojas.length === 0) {
      return res.json({ data: [], nomenclaturaKey: null, pagination: { total: 0, page: 1, limit: limitNum, totalPages: 0 } });
    }

    // Detectar columnas clave en la primera hoja con datos
    // Para nomenclatura: primero buscar coincidencia exacta, luego parcial
    const NOMENCLATURA_EXACT = ['nomenclatura'];
    const NOMENCLATURA_PARTIAL = ['nomen', 'unidad', 'apartamento', 'apto'];
    const ESTADO_KEYS = ['estado'];
    const PROPIETARIO_KEYS_DET = ['propietario 1', 'propietario', 'cliente', 'comprador'];
    const TIPO_KEYS = ['tipo inmueble', 'categoria'];

    let nomenclaturaIdx = -1, estadoIdx = -1, propIdx = -1, tipoIdx = -1;
    let nomenclaturaKey = null, estadoKey = null, propKey = null, tipoKey = null;
    let targetHoja = null;

    for (const hoja of hojas) {
      const columnas = Array.isArray(hoja.columnas) ? hoja.columnas : [];

      // Paso 1: buscar coincidencia exacta de "nomenclatura"
      for (let i = 0; i < columnas.length; i++) {
        const cl = (columnas[i] || '').toLowerCase().trim();
        if (NOMENCLATURA_EXACT.some((nk) => cl === nk)) {
          nomenclaturaIdx = i;
          nomenclaturaKey = columnas[i];
          break;
        }
      }

      // Paso 2: si no hay exacta, buscar coincidencia parcial (pero no "tipo inmueble")
      if (nomenclaturaIdx === -1) {
        for (let i = 0; i < columnas.length; i++) {
          const cl = (columnas[i] || '').toLowerCase().trim();
          if (cl.includes('tipo')) continue; // Evitar "Tipo Inmueble"
          if (NOMENCLATURA_PARTIAL.some((nk) => cl.includes(nk))) {
            nomenclaturaIdx = i;
            nomenclaturaKey = columnas[i];
            break;
          }
        }
      }

      // Detectar otras columnas
      if (nomenclaturaIdx !== -1) {
        for (let i = 0; i < columnas.length; i++) {
          if (i === nomenclaturaIdx) continue;
          const cl = (columnas[i] || '').toLowerCase().trim();
          if (estadoIdx === -1 && ESTADO_KEYS.some((ek) => cl === ek)) {
            estadoIdx = i;
            estadoKey = columnas[i];
          }
          if (propIdx === -1 && PROPIETARIO_KEYS_DET.some((pk) => cl.includes(pk))) {
            propIdx = i;
            propKey = columnas[i];
          }
          if (tipoIdx === -1 && TIPO_KEYS.some((tk) => cl === tk)) {
            tipoIdx = i;
            tipoKey = columnas[i];
          }
        }
        targetHoja = hoja;
        break;
      }
    }

    if (nomenclaturaIdx === -1) {
      return res.json({ data: [], nomenclaturaKey: null, pagination: { total: 0, page: 1, limit: limitNum, totalPages: 0 } });
    }

    // Agrupar por valor de nomenclatura usando filas de la hoja
    const filas = Array.isArray(targetHoja.filas) ? targetHoja.filas : [];
    const grouped = {};

    for (const row of filas) {
      const arr = Array.isArray(row) ? row : [];
      const val = arr[nomenclaturaIdx];
      const key = val != null ? String(val).trim() : '';
      if (!key) continue;

      if (!grouped[key]) {
        grouped[key] = {
          nomenclatura: key,
          totalMovimientos: 0,
          estado: estadoIdx !== -1 ? (arr[estadoIdx] || null) : null,
          propietario: propIdx !== -1 ? (arr[propIdx] || null) : null,
          tipo: tipoIdx !== -1 ? (arr[tipoIdx] || null) : null,
        };
      }
      grouped[key].totalMovimientos++;
      // Actualizar datos si los actuales están vacíos
      if (propIdx !== -1 && !grouped[key].propietario && arr[propIdx]) {
        grouped[key].propietario = arr[propIdx];
      }
    }

    let entries = Object.values(grouped).sort((a, b) => a.nomenclatura.localeCompare(b.nomenclatura));

    // Aplicar filtro de búsqueda
    if (search) {
      const s = search.toLowerCase();
      entries = entries.filter((e) =>
        e.nomenclatura.toLowerCase().includes(s) ||
        (e.propietario && e.propietario.toLowerCase().includes(s))
      );
    }

    const total = entries.length;
    const paginated = entries.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.json({
      data: paginated,
      nomenclaturaKey,
      estadoKey,
      propietarioKey: propKey,
      tipoKey,
      hojaId: targetHoja.id,
      hojaNombre: targetHoja.nombreHoja,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error('[fiducia/nomenclaturas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fiducia/encargos/:id/nomenclaturas/:nomenclatura — detalle completo de una nomenclatura
router.get('/encargos/:id/nomenclaturas/:nomenclatura', async (req, res) => {
  try {
    const nomenclatura = decodeURIComponent(req.params.nomenclatura);

    // Obtener todas las hojas del encargo
    const hojas = await prisma.hojaFiduciaria.findMany({
      where: { encargId: req.params.id },
    });

    if (hojas.length === 0) {
      return res.status(404).json({ error: 'No se encontraron hojas' });
    }

    // Detectar columna nomenclatura — exacta primero
    const NOMENCLATURA_EXACT = ['nomenclatura'];
    const NOMENCLATURA_PARTIAL = ['nomen', 'unidad', 'apartamento', 'apto'];

    // Propiedades fijas del inmueble
    const FIXED_CANDIDATES = [
      'fideicomiso', 'inventario', 'categoria', 'tipo inmueble', 'nomenclatura',
      'area', 'estado',
    ];

    const allMatched = [];
    let nomenclaturaKey = null;
    let allColumnas = [];

    for (const hoja of hojas) {
      const columnas = Array.isArray(hoja.columnas) ? hoja.columnas : [];
      const filas = Array.isArray(hoja.filas) ? hoja.filas : [];

      // Encontrar índice de nomenclatura — exacta primero
      let nomIdx = -1;
      for (let i = 0; i < columnas.length; i++) {
        const cl = (columnas[i] || '').toLowerCase().trim();
        if (NOMENCLATURA_EXACT.some((nk) => cl === nk)) {
          nomIdx = i;
          if (!nomenclaturaKey) nomenclaturaKey = columnas[i];
          break;
        }
      }
      if (nomIdx === -1) {
        for (let i = 0; i < columnas.length; i++) {
          const cl = (columnas[i] || '').toLowerCase().trim();
          if (cl.includes('tipo')) continue;
          if (NOMENCLATURA_PARTIAL.some((nk) => cl.includes(nk))) {
            nomIdx = i;
            if (!nomenclaturaKey) nomenclaturaKey = columnas[i];
            break;
          }
        }
      }

      if (nomIdx === -1) continue;
      if (allColumnas.length === 0) allColumnas = columnas;

      // Filtrar filas que coinciden con la nomenclatura
      for (const row of filas) {
        const arr = Array.isArray(row) ? row : [];
        const val = arr[nomIdx];
        if (val != null && String(val).trim() === nomenclatura) {
          // Convertir fila de array a objeto { columna: valor }
          const datos = {};
          for (let i = 0; i < columnas.length; i++) {
            if (columnas[i]) datos[columnas[i]] = arr[i] ?? null;
          }
          allMatched.push({ datos, nombreHoja: hoja.nombreHoja });
        }
      }
    }

    if (allMatched.length === 0) {
      return res.status(404).json({ error: 'Nomenclatura no encontrada' });
    }

    // Separar propiedades fijas de movimientos variables
    const fixedProps = {};
    const movementKeys = [];

    for (const col of allColumnas) {
      if (!col) continue;
      const cl = col.toLowerCase().trim();
      const isFixed = FIXED_CANDIDATES.some((fc) => cl.includes(fc));

      if (isFixed) {
        // Tomar el primer valor no vacío y no espacio
        const val = allMatched.find((m) =>
          m.datos[col] != null && String(m.datos[col]).trim() !== ''
        )?.datos[col] || null;
        fixedProps[col] = val != null ? String(val).trim() : null;
      } else {
        movementKeys.push(col);
      }
    }

    // Construir registros de movimientos (solo columnas variables)
    let records = allMatched.map((m, idx) => {
      const row = {};
      for (const key of movementKeys) {
        row[key] = m.datos[key] ?? null;
      }
      return { id: `row-${idx}`, nombreHoja: m.nombreHoja, ...row };
    });

    // Encontrar la columna de Fecha Contable para ordenar
    let fechaContableKey = null;
    for (const key of movementKeys) {
      if (key.toLowerCase().includes('fecha contable')) {
        fechaContableKey = key;
        break;
      }
    }

    // Ordenar movimientos por fecha contable
    if (fechaContableKey) {
      records.sort((a, b) => {
        const valA = Number(a[fechaContableKey]) || 0;
        const valB = Number(b[fechaContableKey]) || 0;
        return valA - valB;
      });
    }

    // Obtener info del encargo
    const encargo = await prisma.encargFiduciario.findUnique({
      where: { id: req.params.id },
      select: { id: true, nombre: true, codigo: true },
    });

    res.json({
      nomenclatura,
      nomenclaturaKey,
      encargo,
      propiedades: fixedProps,
      movimientos: records,
      movimientoKeys: movementKeys,
      totalMovimientos: records.length,
    });
  } catch (err) {
    console.error('[fiducia/nomenclatura-detail]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
