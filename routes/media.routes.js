'use strict';

const express = require('express');
const mediaController = require('../controllers/media.controller');

const router = express.Router();

router.get('/config', mediaController.getPublicConfig);
router.get('/content/:slot', mediaController.getContent);

module.exports = router;
