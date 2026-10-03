# Changelog

All notable changes to Fanal Owner will be documented in this file.

The project follows Semantic Versioning 2.0.0. Released entries are immutable; corrections are published as a new version.

## [Unreleased]

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
