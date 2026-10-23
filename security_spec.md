# BrandLens Security Specification & Matrix

## 1. Data Invariants
1. A draft or review cannot be published automatically. Only human Publish Owners or Brand Managers can perform the export/publish step.
2. Creators cannot approve their own high-risk claims or mark reviews as Approved.
3. Every finding dismissal MUST require a non-empty human justification string (reason) for auditability.
4. An audit event is strictly append-only; existing audit entries cannot be overwritten or deleted.
5. All workspace sub-collections (knowledgeItems, reviews, findings, versions, comments, auditEvents) require active membership in the parent `/workspaces/{workspaceId}`.
6. Evidence citations must only reference existing, valid approved facts or return "No approved evidence found" (no hallucinated sources).
7. Non-members cannot read, write, or list workspace drafts, audit trails, or governance knowledge.

## 2. The "Dirty Dozen" Threat Payloads
1. **Ghost Field Injection**: Adding `systemApproved: true` into a draft review payload.
2. **Self-Role Escalation**: Normal creator setting their own role to `admin` or `publish_owner`.
3. **Cross-Tenant Breach**: Requesting `/workspaces/org_B/reviews` as a member of `org_A`.
4. **Blanket Query Scraping**: Submitting an unbounded query without specifying the user's workspace.
5. **Dismissal Without Reason**: Updating finding `status: 'dismissed'` with an empty or omitted `dismissReason`.
6. **Immutable Audit Tampering**: Calling `deleteDoc` or `updateDoc` on `/workspaces/{id}/auditEvents/{id}`.
7. **Creator Self-Approval**: Creator transitioning review `status: 'approved'` without required reviewer role.
8. **Resource Exhaustion**: Sending 10MB text payload beyond the maximum character threshold.
9. **Timestamp Spoofing**: Supplying client-side backdated `createdAt` timestamp instead of server timestamp.
10. **ID Poisoning Attack**: Submitting special injection strings `../../users` as `{reviewId}` or `{workspaceId}`.
11. **Orphaned Finding Creation**: Creating a finding referencing a non-existent review ID.
12. **Evidence Fabrication**: Creating a finding referencing arbitrary unvetted source IDs.

## 3. RBAC Policy Matrix
- **Admin**: Full workspace configuration, member role assignment, policy settings.
- **Brand Manager**: Triage issues, manage knowledge base (facts, tone, terminology), approve regular reviews.
- **Specialist Reviewer**: Review high-severity claims, verify legal/compliance statements, request changes.
- **Creator**: Submit drafts, run preflight, view findings, apply suggested revisions, submit for review.
- **Publish Owner**: Final publication gatekeeper, export signed brand compliance certificate.
