'use strict';

// Emergency stability patch: this legacy cleanup layer used document-wide
// MutationObservers and full-body TreeWalker scans. Those can stall the
// renderer while the panel is bootstrapping or updating tickets.
// Ticket rendering is handled by the main panel code for now.
