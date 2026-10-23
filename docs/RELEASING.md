# PocketData releases

VERSION is the only application version. Maven's local coordinate and private
frontend package version are not release versions. Runtime uses Java 21 and the
built React UI; an existing PH Redis and PH authentication are external.

## Prepare locally

1. Review the pending source changes and keep operational catalogue, inventory,
   environment files, credentials and browser artifacts out of Git.
2. Set VERSION to the requested version; move the release notes from Unreleased
   into a dated section and keep a new Unreleased section.
3. Update the dependency audit, run frontend/Java tests (including the explicitly
   isolated Redis), package and build the versioned image from these exact sources.
4. Test the exact image on a new synthetic volume: PH device login, JSON/SOAP
   population, CSV-before-Redis, Stop, restart persistence and native port change.
   Never replace working inventory or clear a shared Redis for qualification.
5. Scan that exact image and record findings, applicability, artifact identities
   and test scope in RELEASE_VERIFICATION.md and SECURITY_REVIEW.md.
6. Commit and create the matching annotated vX.Y.Z tag only with human approval.
   Local preparation does not authorize pushing, remote deployment or data moves.

## GitHub Actions / GHCR

The Container workflow validates pushes to main, tags v*, pull requests and manual
runs. It checks vendored checksums, tests React/Java using an ephemeral Redis and
runs the workspace/MCP/pacing browser regression against synthetic identity/data.
This is not a real-PH SSO test. Docker builds also run frontend and Java tests;
Redis-dependent tests run in validation, not in the isolated Docker build stages.

After validation, linux/amd64 and linux/arm64 images are built. Only push events
publish to ghcr.io/sepa79/pocketdata as latest and sha-<full-commit>. An exact
vX.Y.Z tag matching VERSION additionally publishes :vX.Y.Z. Manual and PR runs
build without publishing. Mismatched or malformed version tags fail explicitly.
Pushing main and a tag starts two serialized runs, as in PocketPlanner.

After explicit permission to publish:

```sh
git push --atomic origin main refs/tags/v0.1.0
```

That command requires the reviewed local commit/tag to exist; it does not create
them. Check the workflow result before claiming the image is published. The first
GHCR package may require its owner to set visibility to Public once; repository
visibility alone does not prove anonymous image-pull access. No GitHub Release
object or deployed environment is created by this workflow.

## Run a published image

Configure the existing PH Redis/auth endpoint and networks as in REDIS.md/AUTH.md.
PH 0.15.38 includes the pocketdata-device registration. Shared JVM/npm inputs are
bundled in the PD build; operators do not install PH libraries separately.

```sh
export POCKETDATA_IMAGE=ghcr.io/sepa79/pocketdata:v0.1.0
docker compose pull pocketdata
docker compose up -d --no-build pocketdata
```

Use the same Compose project and inventory volume for an explicitly approved
upgrade. Never use down -v. One non-root replica owns /data; PH owns Redis and
identity. Remote operators need a reachable public PH issuer, not localhost on
someone else's machine. Use HTTPS; remote HTTP needs explicit opt-in.
