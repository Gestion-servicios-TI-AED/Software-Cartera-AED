const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/fields/metadata — lista de campos con sus labels
router.get('/metadata', async (req, res) => {
  try {
    const fields = await prisma.zohoFieldMetadata.findMany({
      orderBy: { fieldLabel: 'asc' },
    });
    res.json(fields);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
