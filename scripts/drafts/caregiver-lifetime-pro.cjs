'use strict';
// DRAFT pure workflow model. scripts/ is excluded from deployment. No routes,
// network, persistence, proof uploads, entitlement writes or billing changes.
// A future server integration must resolve reviewer authority from its session;
// never accept the trustedReviewer argument from a browser request.
const PROGRAM = 'caregiver-disabled-child-lifetime';
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value);
const keys = (value, allowed) => value && !Array.isArray(value) && typeof value === 'object' && Object.keys(value).every(key => allowed.includes(key));
const time = value => Number.isSafeInteger(value) && value > 0;

function draftRequest(input, now) {
  if (!keys(input, ['requestId', 'accountId', 'parentOrGuardianConfirmed', 'childDisabilityEligibilityConfirmed']) || !id(input.requestId) || !id(input.accountId) || !time(now) || input.parentOrGuardianConfirmed !== true || input.childDisabilityEligibilityConfirmed !== true) throw new Error('A minimal account-bound eligibility assertion is required. Proof intake is not available.');
  return { schema: 1, program: PROGRAM, requestId: input.requestId, accountId: input.accountId, status: 'pending_manual_review', submittedAt: now };
}

function draftReview(request, decision, trustedReviewer, now) {
  if (trustedReviewer?.authorizedPrograms?.includes(PROGRAM) !== true || !id(trustedReviewer.reviewerId)) throw new Error('An existing authorized reviewer must be resolved by the server.');
  if (!keys(decision, ['requestId', 'accountId', 'outcome', 'reviewReference']) || decision.requestId !== request.requestId || decision.accountId !== request.accountId || !id(decision.reviewReference) || !['approved', 'declined', 'more_information'].includes(decision.outcome) || !time(now) || request.program !== PROGRAM) throw new Error('Invalid or mismatched manual review.');
  if (request.decision) {
    if (request.decision.outcome === decision.outcome && request.decision.reviewReference === decision.reviewReference) return request;
    throw new Error('A recorded decision cannot be silently replaced.');
  }
  if (request.status !== 'pending_manual_review') throw new Error('This request is not awaiting review.');
  const reviewed = { ...request, status: decision.outcome === 'approved' ? 'verified' : decision.outcome,
    decision: { outcome: decision.outcome, reviewReference: decision.reviewReference, reviewerId: trustedReviewer.reviewerId, reviewedAt: now } };
  if (decision.outcome === 'approved') reviewed.grant = {
    schema: 1, grantId: `lifetime-${request.requestId}`, accountId: request.accountId,
    tier: 'pro', source: PROGRAM, lifetime: true, expiresAt: null, grantedAt: now,
    reviewReference: decision.reviewReference, revokedAt: null
  };
  return reviewed;
}

function draftProAccess(accountId, subscription, grant, now) {
  if (!id(accountId) || !time(now)) throw new Error('An account and time are required.');
  const complimentary = grant?.accountId === accountId && grant.source === PROGRAM && grant.tier === 'pro' && grant.lifetime === true && grant.expiresAt === null && !grant.revokedAt && id(grant.reviewReference);
  const paid = subscription?.accountId === accountId && subscription.tier === 'pro' && Number(subscription.expiresAt) > now && !subscription.revokedAt;
  // The records coexist. This calculation never cancels, overwrites or updates
  // a subscription, and never derives an expiry from a child's age.
  return { active: Boolean(complimentary || paid), complimentary: Boolean(complimentary), subscription: Boolean(paid) };
}

module.exports = { PROGRAM, draftRequest, draftReview, draftProAccess };
