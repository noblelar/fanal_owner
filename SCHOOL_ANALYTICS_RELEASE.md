# Owner school analytics release runbook

This runbook covers the owner-only analytics panel on a school's Overview page and its dedicated API endpoint. It does not change or release the school-admin dashboard.

## Release scope

The release contains three compatible layers:

1. An additive API database migration, `20260920113128_AddUserProfileLastLoginAtUtc`, which adds the nullable `LastLoginAtUtc` column and the `IX_AspNetUsers_SchoolId_LastLoginAtUtc` index.
2. API login tracking and `GET /api/platform/schools/{schoolId}/analytics`, protected by the platform owner/admin policy.
3. The Owner console analytics data integration and responsive Overview interface.

Login history is not reconstructed. A school with no successful user login after this release correctly shows that no login has been recorded yet.

## Current schema prerequisite

Final verification found an older model/snapshot mismatch that predates this feature: the application model contains `UserType.ADMINISTRATOR`, while the committed PostgreSQL `user_type` enum snapshot ends at `student`. As a result, `dotnet ef migrations has-pending-model-changes` correctly remains red even though the generated analytics migration contains only the intended login column and index.

Do not hide that mismatch inside `AddUserProfileLastLoginAtUtc`. Before production release, inspect the target database's `user_type` values and reconcile `administrator` through a separate reviewed, forward-safe migration. Re-run the pending-model check and require it to pass before applying the analytics migration. This is a release prerequisite, not an analytics runtime change.

## Pre-release gates

Run these checks against the exact API and Owner revisions selected for release:

```powershell
# fanalAPI
dotnet test main.Tests\main.Tests.csproj --no-restore
dotnet ef migrations has-pending-model-changes --project fanal_DataAccess\fanal_DataAccess.csproj --startup-project main\main.csproj --no-build

# fanal_owner
npm run typecheck
npm run lint
npm run build
npx playwright test --config=playwright.config.mjs
```

Before changing the database:

- Record the release owner, API revision, Owner revision, migration identifier, deployment time, and rollback decision-maker.
- Confirm a current database backup or provider-managed recovery point exists.
- Review the generated migration SQL for only the nullable login column and its school/time index.
- Resolve the documented `UserType.ADMINISTRATOR` model/snapshot mismatch through its own reviewed migration and require the pending-model check to pass.
- Confirm the target database's migration history and apply all pending migrations in their committed order.
- Confirm no school-admin frontend artifact is part of this release.

## Deployment order

1. Apply `20260920113128_AddUserProfileLastLoginAtUtc` through the normal controlled migration process.
2. Deploy the API revision containing the matching model, authentication writes, and dedicated platform endpoint.
3. Verify the API before releasing the Owner interface.
4. Deploy or promote the coordinated Owner candidate using the immutable platform release workflow.
5. Keep Fanal Main on its selected coordinated revision; this feature requires no school-admin release change.

The migration is backward compatible because the new timestamp is nullable and older API revisions ignore it. Do not release the new Owner interface against an API revision that does not expose the dedicated analytics endpoint.

## API smoke checks

Use test accounts and two known test schools; never use production personal data in release evidence.

- An unauthenticated request is rejected.
- A school-side token cannot access the endpoint.
- A platform owner or platform admin can retrieve one requested school's analytics.
- The response `schoolId` matches the route identifier.
- Staff totals equal the sum of the role breakdown.
- Only students with `ENROLLED` status contribute to the enrolled total.
- Parent, pending application-group, and latest-login values contain no records from the comparison school.
- Completed and rejected application groups do not contribute to the pending total.
- The latest-login object exposes no email address, IP address, or device data.
- An unknown school returns `404` without exposing internal exception details.

## Owner console smoke checks

- Open a school's Overview page and confirm all four headline figures appear.
- Confirm every returned staff role appears once with the correct count.
- Confirm the latest successful login shows only display name, role, and time.
- Use **Refresh data** and confirm the generated time advances without leaving the page.
- Verify a school with zero values shows the staff and login empty states.
- Simulate an analytics API failure and confirm the school preview and governance tabs remain usable.
- Use **Try again** after recovery and confirm the analytics panel returns.
- Check the Overview at mobile and desktop widths for clipping or page-level horizontal overflow.

## Monitoring

After release, monitor API error logs for the dedicated route and authentication persistence failures. Validate that successful school-user logins begin populating timestamps and that refresh-token calls do not advance them. A large initial population of null timestamps is expected and is not a migration fault.

Do not log the analytics payload, user identifiers, access tokens, or application details solely for monitoring this feature.

## Rollback

If only the Owner presentation is faulty, roll back the Owner image first. The API endpoint and nullable database column may remain in place.

If the API behavior is faulty, roll back the Owner image before rolling back the API so the active Owner interface never depends on a missing endpoint. Retain the additive column and index during an application rollback; do not run the migration `Down` operation as an automatic rollback step. Existing login timestamps are safe to preserve for a corrected forward deployment.

After rollback, repeat the platform health checks, verify school governance remains available, and record the exact revisions and decision. Database removal requires a separate reviewed maintenance decision and a confirmed recovery plan.

## Completion record

The release is complete only when:

- The target schema includes the committed migration.
- API authorization and two-school isolation checks pass.
- The Owner normal, zero-data, refresh, failure, retry, and responsive states pass.
- The deployed API and Owner revisions match the approved immutable references.
- Monitoring shows no unexpected login-write or analytics-route failures.
- The release record includes the migration result and rollback owner.
