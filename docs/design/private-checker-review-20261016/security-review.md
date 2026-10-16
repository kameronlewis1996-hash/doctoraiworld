# Focused independent security review

The disabled scaffold was independently reviewed with synthetic identities and no external service calls. Initial review found two activation blockers: reviewers could read other reviewers' feedback, and a previous service worker could cache successful protected HTML at a clean site path.

Both were fixed before draft publication. Reads now require feedback author or workspace owner. Protected UI, form actions and redirect locations exclusively use `/api/checker-review/...`; there is no friendly rewrite or auto redirect. Both baseline and draft worker handlers are executed against every private path to verify bypass.

Reverse isolation uses the actual health identity function and staff handler. Failed-commit tests cover login cookies and protected HTML/JSON. The follow-up reviewer independently probed the response buffer and observed zero real response emissions before commit and no protected body after a failed commit.

The native browser journey also found that `no-referrer` produced a null Origin on form POST; the policy was changed to `same-origin`, retaining exact Origin enforcement while omitting referrers to external sources. Native login, feedback and logout then passed at 320/390/1440px. All three axe WCAG A/AA states had no listed violations.

Follow-up independent review found no remaining concrete auth/confidentiality blocker within this focused scaffold. It reran the 15-group synthetic verifier; browser checks were run by the implementation lead. Persistent encrypted/atomic storage, durable rate limiting, credential provisioning, retention/deletion and actual hosting activation remain intentionally unwired/unverified. This review does not authorise enabling access or clinical release.
