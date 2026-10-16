'use strict';
const {createReviewHandler}=require('../../server-src/checker-review/portal.cjs');
// DRAFT: disabled, with no credentials, grants, private store or activation env switch.
// A durable atomic store and explicit action-time approval are required before wiring.
module.exports=createReviewHandler();
