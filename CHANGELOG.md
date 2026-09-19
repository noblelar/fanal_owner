# Changelog

All notable changes to Fanal Owner will be documented in this file.

The project follows Semantic Versioning 2.0.0. Released entries are immutable; corrections are published as a new version.

## [Unreleased]

### Changed

- Parameterized the production Owner image through `FANAL_OWNER_IMAGE` while preserving `fanalarkgroup/fanal_owner:latest` as the default.
- Changed the `master` deployment to select the exact image digest produced by its build and verify the running image, version, revision, and automatic rollback state on EC2.

## [1.0.0] - 2026-09-17

### Added

- Established `1.0.0` as the first formally versioned production baseline.
- Added build information that reports the Owner component version and source revision.
- Added the public `GET /api/version` diagnostics endpoint.
- Added OCI image version and revision metadata support.
- Added immutable `VERSION-sha.REVISION` image tags and digest summaries while retaining the existing SHA and `latest` tags.
- Added a manually dispatched, environment-gated workflow for approved stable releases.
- Added retry-safe promotion of the tested full-SHA image to an immutable bare version tag, annotated Git tag, and GitHub Release.
