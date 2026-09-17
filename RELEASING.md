# Releasing Fanal Owner

## Version source

The root `package.json` is the authoritative source for the Owner application Semantic Version. The root entry in `package-lock.json`, Git tags, Docker labels, and release notes must match it.

## Version policy

- PATCH: backward-compatible bug, security, or performance fixes.
- MINOR: backward-compatible owner-console pages, workflows, and governance features.
- MAJOR: incompatible route, session, configuration, API requirement, or documented workflow changes.

## Build tags during the migration

Each `master` build currently publishes the existing full-commit and `latest` tags plus an immutable `VERSION-sha.REVISION` tag, for example `1.0.0-sha.abc123def456`. The bare `1.0.0` image tag is reserved for the later approved-release workflow so normal branch builds cannot overwrite a stable release.

## Release preparation

1. Select the next version from the documented application-contract change.
2. Update `package.json` and synchronize `package-lock.json` without creating a Git tag.
3. Move relevant `CHANGELOG.md` entries from `Unreleased` into a dated version section.
4. Run linting, type checking, tests, and the production build.
5. Build the container with `APP_VERSION` equal to the package version and `GIT_SHA` equal to the full source commit.
6. Verify `GET /api/version` reports the expected values.
7. Create the immutable annotated Git tag `vX.Y.Z` only after the release candidate is approved.

The current production deployment process remains authoritative until the later pipeline migration phases are completed.
