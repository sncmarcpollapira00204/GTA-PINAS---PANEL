'use strict';

const express = require('express');
const donationEmbedController = require('../controllers/donationEmbed.controller');

const router = express.Router();

router.get('/channels', donationEmbedController.getDonationChannels);
router.post('/embed', donationEmbedController.sendEmbed);

module.exports = router;
