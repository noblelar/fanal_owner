# Changelog

All notable changes to Fanal Owner will be documented in this file.

The project follows Semantic Versioning 2.0.0. Released entries are immutable; corrections are published as a new version.

## [Unreleased]

## [1.3.0] - 2026-10-03

### Added

- Added the Phase 5 Release Center lifecycle for owner-only `verify-candidate` and `promote-candidate` dispatches.
- Added active-candidate status and linked deployment/verification workflow evidence without exposing editable release coordinates.
- Added stale-page, lifecycle-order, exact-manifest, duplicate-operation, CSRF, and authorization guards for candidate verification and promotion.

### Changed

- Changed stable-release discovery to preserve the latest successful promotion while independently tracking a newer deployed or verified candidate.
- Changed verification and promotion to reuse the server-validated manifest preserved by GitHub Actions instead of requiring operators to retype image digests, versions, and revisions.
- Paused new candidate composition while another candidate lifecycle is active or its trusted evidence cannot be validated.

## [1.2.0] - 2026-10-02

### Added

- Added guarded Owner Release Center dispatch for validated `deploy-candidate` operations, including owner-only authorization, CSRF protection, explicit confirmation, duplicate prevention, and workflow request correlation.
- Added server-side revalidation that reloads trusted GitHub artifacts and regenerates the immutable platform manifest before every dispatch.
- Added the coordinated Fanal platform release manifest contract and validation tooling for immutable API, Main, and Owner image combinations.

### Changed

- Updated the platform workflow and release guide for Release Center candidate deployment while preserving the protected GitHub environment approval gate.
- Changed the GitHub Catalog App requirement to Actions read-and-write access and kept production dispatch disabled by default until explicitly activated.
- Parameterized the production Owner image through `FANAL_OWNER_IMAGE` while preserving `fanalarkgroup/fanal_owner:latest` as the default.
- Changed the `master` deployment to select the exact image digest produced by its build and verify the running image, version, revision, and automatic rollback state on EC2.
- Made component-only automatic deployment an opt-in emergency path and added the manually approved platform coordinator for normal deployments.

## [1.0.0] - 2026-09-17

### Added

- Established `1.0.0` as the first formally versioned production baseline.
- Added build information that reports the Owner component version and source revision.
- Added the public `GET /api/version` diagnostics endpoint.
- Added OCI image version and revision metadata support.
- Added immutable `VERSION-sha.REVISION` image tags and digest summaries while retaining the existing SHA and `latest` tags.
- Added a manually dispatched, environment-gated workflow for approved stable releases.
- Added retry-safe promotion of the tested full-SHA image to an immutable bare version tag, annotated Git tag, and GitHub Release.
