const express = require('express');
const {
  loadPublicApiContract,
  buildSystemManifest,
  evaluateMaintenanceChecklist,
} = require('../services/systemManifest.service');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    ok: true,
    data: {
      service: 'system',
      description: 'Rotas utilitárias de manifesto, checklist de manutenção e contrato público da API.',
      routes: [
        '/api/system/manifest',
        '/api/system/maintenance-checklist',
        '/api/system/contracts/public-api',
      ],
      timestamp: new Date().toISOString(),
    },
  });
});

router.get('/manifest', (_req, res) => {
  const manifest = buildSystemManifest();
  res.json({ ok: true, data: manifest });
});

router.get('/maintenance-checklist', (_req, res) => {
  const checklist = evaluateMaintenanceChecklist();
  res.json({ ok: true, data: checklist });
});

router.get('/contracts/public-api', (_req, res) => {
  res.json({ ok: true, data: loadPublicApiContract() });
});

module.exports = router;
