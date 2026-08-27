# pw-grq crisis runbook

Master procedure: `bob/master-audit-and-crisis-documentation@1.0`  
Privacy-breach procedure: `Security/DATA-BREACH-AND-PRIVACY-INCIDENT-STANDARD.md`

## Stop and assign

- Incident lead: **unassigned**
- DPO/legal contact: **unassigned**
- Institutional contact: **unassigned**
- Restricted evidence location: **unassigned**
- Production pause/resume authority: **human only**
- External notification authority: **human only**

Production readiness is BLOCKED until the applicable assignments and a synthetic exercise are recorded.

## First hour

1. Open one incident ID and UTC timeline; record reporter, discovery and credible-grounds times.
2. Preserve exact revision, deployment, provider/project/region, alerts, audit IDs, safe logs and configuration names before changing systems. Hash artifacts and record collector, access and chain of custody.
3. Contain narrowly under an approved capability. Do not destroy evidence. Broad revocation, destructive action and production pause require human authority.
4. Assess affected systems, accounts, roles, keys, data categories, people/count method, duration, access/egress, encryption, harm, scale and continuing risk.
5. Bob prepares facts, deadlines and notification drafts. An authorised human decides severity/notifiability and every external communication.
6. Restore or roll back to a recorded revision; rerun health, authenticated journey, wrong-role denial, database authority and monitoring checks.
7. Record residuals, legal hold/retention, cleanup, independent verification, lessons and closure authority.

## Automation allowed

Create the incident workspace; collect allowlisted redacted evidence; checksum/index it; run deterministic scoped checks; prepare timeline/tasks/drafts; send safe internal outage/recovery notices; execute only pre-approved reversible containment and verify readback. Never automatically notify external parties, delete evidence, suppress findings or declare the incident closed.
