'use strict';

const express = require('express');
const donationEmbedController = require('../controllers/donationEmbed.controller');

const router = express.Router();

router.get('/channels', donationEmbedController.getDonationChannels);
router.get('/message', donationEmbedController.getMessage);
router.post('/embed', donationEmbedController.sendEmbed);
router.patch('/message', donationEmbedController.updateMessage);

module.exports = router;
