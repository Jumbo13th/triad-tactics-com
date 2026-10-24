# Dependency updates

`renovate.json` defines the update policy for the hosted
[Renovate GitHub App](https://github.com/apps/renovate). The bot runs outside the
VPS, so it does not consume production disk space or CPU. Configuration in Git
does not install the app: an account owner must grant it access to
`Jumbo13th/triad-tactics-com`.

## Activate Renovate without a monitoring gap

1. Merge this configuration and install the app for this repository only.
2. Check its Dependency Dashboard and first update PR. Confirm that npm packages,
   GitHub Actions, the Trivy scanner version, `.nvmrc`, the Dockerfile,
   and Compose images are discovered,
   lockfiles regenerate successfully, and CI runs on the bot's PRs.
3. Confirm that the app has access to GitHub vulnerability alerts and that its
   logs show successful vulnerability-alert retrieval. If there is an open
   fixable alert, verify that Renovate proposes its fix.
4. Then remove `.github/dependabot.yml` in a follow-up PR and disable **Dependabot
   security updates** in repository settings. These are the two PR-producing
   features being replaced. Until that handoff is verified, keep Dependabot
   enabled; temporary duplicate PRs are preferable to losing update coverage.
5. Keep **Dependency graph**, **Dependabot alerts**, **CodeQL**, **secret
   scanning**, and **push protection** enabled. Alerts and code scanning are
   independent of which bot opens dependency PRs.

Do not disable Dependabot alerts: Renovate's security-fix workflow reads them.
See [Renovate's vulnerability alert integration](https://docs.renovatebot.com/configuration-options/#vulnerabilityalerts).

## Update policy

| Change | Handling |
| --- | --- |
| Routine updates | Monday, 04:00–10:00 Europe/Volgograd; releases wait at least three days where release-age checks apply. |
| PR volume | At most five routine open PRs and two new routine PRs per hour. |
| npm patches | Grouped, with separate groups for Next.js, React, and Node. |
| Minor updates | Related packages grouped; unrelated packages remain separate for review. |
| Container images | Pin image digests and propose digest refreshes when a tag is rebuilt, including base OS patches. |
| Major updates | Require approval in the Dependency Dashboard before a PR is opened. |
| Known vulnerability fixes | Requested as soon as Renovate processes the alert, without the weekly window, release delay, or dashboard approval. |
| Lockfile maintenance | Weekly refresh of transitive dependencies within declared ranges. |
| Merging | Manual for every update, including security fixes; required checks and repository review rules still apply. |

Scheduling controls when Renovate may start work; it is not a guarantee that the
hosted service runs at an exact time. Existing PRs can be refreshed outside the
window. Security detection is also not instantaneous and does not cover every
possible vulnerability.

Release age is enforced for supported update types with available release
timestamps. Pinning and lockfile maintenance do not receive the same cooldown;
review their diffs and CI results. Inspect the dashboard if missing registry
timestamps prevent an otherwise expected update. See
[release-age behavior](https://docs.renovatebot.com/key-concepts/minimum-release-age/).

## Runtime compatibility

Node stays on major 24 until a maintainer reviews a migration. Renovate groups
Node updates across `.nvmrc`, `package.json` engines, and Docker stages, with
`@types/node` limited to the same major. Node type package minor/patch versions
need not equal the runtime version. CI verifies that Docker and `.nvmrc` agree
and that the runtime satisfies the engine constraints. The minimum supported
version in `engines.node` may remain lower than the pinned runtime patch.

Next.js and `eslint-config-next` are grouped; React, React DOM, and their types
are grouped separately. The npm engine stays on major 11. TypeScript stays below
6.1 while the current lint toolchain requires that range. Revisit these limits
when updating the toolchain, and review Node support dates regularly; a version
limit is a temporary compatibility decision, not a security exception.

Security PRs can be split by vulnerability instead of the usual routine groups.
Review the paired framework packages when necessary. If a fix requires crossing
a compatibility limit, investigate and make a coordinated migration manually;
do not ignore the alert or assume that the bot can resolve it within the limit.
See [Renovate's Node support](https://docs.renovatebot.com/node/).

## Review, deploy, and maintain

Review the release notes and diff, then require the application, dependency
audit, runtime consistency, and container checks to pass before merging. Keep
human review initially. Consider narrowly scoped automatic patch merging only
after the checks and rollback process have proven reliable; this configuration
does not enable it or bypass required approvals.

Use the deployment and backup procedure in [DEPLOYMENT.md](../DEPLOYMENT.md).
A merged package update reaches users only after the new image is deployed and
its health checks pass. Retain only the latest ten completed backups on the VPS,
preserve the active and rollback images, and prune obsolete images and build
cache with the repository's maintenance procedure. Off-server backup copies are
independent of the VPS retention limit.

Review failed scheduled audits and image scans, stalled bot PRs, and the
Dependency Dashboard at least weekly. Container base-image updates and rescans
cover image packages; host OS patching and any required reboot remain separate
maintenance work.

Validate changes to the bot configuration without adding it to application
dependencies:

```sh
npx --yes --package=renovate renovate-config-validator --strict renovate.json
```
