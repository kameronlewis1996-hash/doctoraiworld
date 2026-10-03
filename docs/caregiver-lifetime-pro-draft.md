# DRAFT — lifetime complimentary Pro for caregivers

The owner requested lifetime complimentary Pro, after proof, for parents or legal guardians of children with disabilities. Lifetime means no annual renewal and no expiry when the child turns 18. No household cap or narrower disability category has been inferred.

## Reviewable implementation in this branch

The Family & loved ones preview explains the planned program and states that proof submission is not available. `scripts/drafts/caregiver-lifetime-pro.cjs` implements a pure, synthetic workflow model: pending manual review, approved/declined/more-information decisions, and a separate lifetime grant with `expiresAt:null`. Self assertion cannot grant Pro. A trusted reviewer decision must match the request's account; repeated identical decisions are idempotent. No names, DOB, diagnosis, proof file, medical report, evidence URL or free-text explanation is accepted by the model. Request planning does not require Pro or a paid child profile; the entry is visible to Free users. Live application submission remains inactive pending the review decisions. The minimal record contains an opaque account/request ID, status, reviewer/reference ID and timestamps.

The model is excluded from deployment with `scripts/`. It has no API route, storage writer, email, upload, AI call, Stripe call or live entitlement integration. Existing 30-day staff grants and paid subscriptions are unchanged. Its trusted reviewer argument is a future server-only integration boundary, not an authentication implementation.

## Bounded activation plan, after decisions and authorization

1. Agree eligibility and acceptable proof with the owner and qualified privacy reviewer. Offer a minimal redacted confirmation or sighting where suitable; never request a full medical history by default. Decide how guardianship and disability eligibility are verified without defining narrower categories implicitly.
2. Design a private, restricted proof-review channel separate from health documents and AI. Confirm which existing authorized staff can review, how delegated access/audits work, and how sensitive material is kept out of ordinary logs and support tools. Do not ask applicants to email or upload evidence until this route is approved.
3. Separate short-lived proof from a minimal permanent verification decision record for the lifetime benefit. Decide the proof deletion deadline (no arbitrary period is selected here), justified fields and access for the ongoing decision record, withdrawal, incorrect decisions, appeal/reapplication, and any exceptional revocation criteria. Do not implement periodic re-verification, annual renewal, age-18 expiry or household caps without an explicit owner decision.
4. Connect a separate encrypted complimentary-grant namespace to durable Pro resolution. Stripe subscription events must update only subscription state, so cancellation/expiry cannot erase the lifetime grant. Keep payment/customer identifiers for the account's existing subscription and do not automatically cancel billing or change charges. Define the UI and owner-authorized handling for already-paying applicants.
5. Resolve reviewer authority from the existing authenticated server session; clients must not supply a reviewer role or grant status. Add atomic request/decision idempotency, ownership checks, rate limits and minimal audit records. No new persistent admin access is authorized in this task.
6. Verify with synthetic applicants/reviewers on an existing physically isolated Preview allocation: unauthorized approval, account-ID forgery, retries, conflicting decisions, declined/incomplete cases, subscription cancellation alongside an active lifetime grant, and years-later access. Then request separate authorization for policy publication and production activation.

## Exact unresolved decisions

- Eligibility/proof: accepted evidence or sighting, how authority is verified, geographical scope, and handling shared or changing guardianship. The broad owner intent is preserved; no narrower eligibility category or single-household limit is assumed.
- Review/access: authorized existing reviewers, applicant status/review process, review timeframe, appeal/reapplication, and controls on sensitive proof access.
- Retention: short proof retention/deletion deadline, minimal permanent verification decision-record contents/access, backups/deletion verification, withdrawal and exceptional revocation policy. Lifetime does not mean evidence must be retained for life.
- Billing: treatment of an approved applicant who already pays, and what explicit action they must authorize. Current subscriptions and charges remain unchanged.
- Child-data policy: approve parent/guardian authority wording and child-data/AI controls for relevant jurisdictions before production. No child login is introduced and no actual child health data or proof was collected.

No live benefit has been granted. This draft is a concrete review artifact, not an available proof-review service or legal-compliance claim.
