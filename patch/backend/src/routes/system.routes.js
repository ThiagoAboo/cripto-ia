const express = require('express');
const {
  loadPublicApiContract,
  buildSystemManifest,
  evaluateMaintenanceChecklist,
} = require('../services/systemManifest.service');

const router = express.Router();

router.get('/manifest', (req, res) => {
  const manifest = buildSystemManifest();
  res.json({ ok: true, data: manifest });
});

router.get('/maintenance-checklist', (req, res) => {
  const checklist = evaluateMaintenanceChecklist();
  res.json({ ok: true, data: checklist });
});

router.get('/contracts/public-api', (req, res) => {
  res.json({ ok: true, data: loadPublicApiContract() });
});

module.exports = router;
