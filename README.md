# hawk-pipeline-actions

Reusable GitHub Actions for a GitFlow-inspired release pipeline. Handles changelog
management, release branch preparation, squash merging, version tagging, GitHub Release
creation, and Discord notifications — consistently across every repository that adopts it.

---

## How the release process works

```
development  ──►  release/vX.Y.Z  ──► main  ──► (tag) ──► Automated pipeline
                        │                                        │
                        └────────── squash back-merge ──────────►│
                                         development             ▼
                                                          Docker / GitHub Release / Discord
```

The process is split into **two manual steps** followed by **one automated step**:

| Step                         | Trigger                          | What happens                                                               |
|------------------------------|----------------------------------|----------------------------------------------------------------------------|
| **1. Create Release Branch** | Manual                           | Validates `next.md`, creates `release/vX.Y.Z`, updates the version file    |
| **2. Trigger Release**       | Manual (from the release branch) | Tests the build, squash-merges to `main` and `development`, pushes the tag |
| **Automated pipeline**       | Tag push                         | Builds and publishes artefacts, creates GitHub Release, notifies Discord   |

---

## Setup

### 1. Personal Access Token

These workflows require a PAT with `repo` scope to push branches and trigger downstream
workflows. Store it as **`WORKFLOW_TOKEN`** in your repository secrets.

> `GITHUB_TOKEN` will not work here — GitHub prevents it from triggering new workflow runs,
> so the tag push would never fire the automated release pipeline.
>
> **IMPORTANT**
> In all repositories of `hawk-digital-environments` you already have access to a organization secret called `WORKFLOW_TOKEN`, meaning you have no setup to do!

### 2. Changelog directory

Add a `_changelog` directory to your repository with these two seed files.

Lines written as [//]: # (text) are template hints — they are visible in your editor but render as nothing in markdown. When the pipeline processes a release, these lines are stripped first; any section that contains only those hints is then dropped entirely. Write your real content as normal (non-commented) lines anywhere under the appropriate heading.

**`_changelog/next.md`**

```markdown
# vX.Y.Z (header will be updated by the pipeline)

### What's New

[//]: # (- The main new features and changes in this version.)

### Quality of Life

[//]: # (- Improvements and enhancements that improve the user experience.)

### Bugfix

[//]: # (- List of bugs that have been fixed in this version.)

### Deprecation

[//]: # (- List of features or functionalities that have been deprecated in this version.)
```

**`_changelog/next-upgrade.md`**

```markdown
# Upgrade Guide (header will be updated by the pipeline)

## Overview

[//]: # (Briefly describe what makes this upgrade different from a routine update)

[//]: # (and why manual intervention is required.)

## Steps

### 1. Example step

[//]: # (Describe what the user needs to do.)

## Notes

[//]: # (Any additional warnings or tips for administrators performing the upgrade.)
```


To guide your team, you can also add the `_changelog/README.md` file with instructions on how to use the changelog files and the release process.

```
# Changelog

Welcome to the ${YOUR_APP} changelog! 🚀

Whether you're checking out what's new in the latest release or catching up after some time away, you'll find all our updates, improvements, and bug fixes organized by version in the menu on the left.

## What you'll find here

- **Version history** grouped by major releases for easy browsing
- **Upgrade instructions** right alongside each release when setup changes are needed
- **Clear descriptions** of what's changed and why it matters

Happy updating! ✨

---

## For contributors

The sections below explain how the changelog and release process work for developers contributing to ${YOUR_APP}. The release pipeline is powered by [hawk-pipeline-actions](https://github.com/hawk-digital-environments/hawk-pipeline-actions).

### Tracking changes day-to-day

There are two working files in this directory: `next.md` and `next-upgrade.md`. These are **living documents** — treat them like a running notepad for the next release.

**Every pull request to `development` that introduces a change worth communicating should update one or both of these files as part of the PR itself.** Don't save it for later; changelog entries written close to the actual change are far more accurate and useful.

> **Both files are automatically reset to a clean template after every release.** You will never need to manually clear or recreate them — just start filling in `next.md` for the next release cycle.

#### Which parts are written?

Lines written as `[//]: # (text)` are template hints — they are visible in your editor but render as nothing in markdown. When the pipeline processes a release, these lines are stripped first; any section that contains only those hints is then dropped entirely. Write your real content as normal (non-commented) lines anywhere under the appropriate heading.

#### `next.md` — the next release notes

This is the primary changelog file. Add bullet points under the appropriate section when your PR introduces something new, fixes a bug, or deprecates something.

#### `next-upgrade.md` — the next upgrade guide

This file is **optional**. Only fill it in if your change requires administrators to take manual action when upgrading (e.g. running a migration, changing a config value, updating an environment variable). If your change needs no upgrade steps, leave the file alone.

---

### Which version number to use?

Always follow [Semantic Versioning](https://semver.org/). In short:

**Patch — `x.y.Z`**
Increment for backward-compatible bug fixes only. A bug fix corrects incorrect behaviour without changing any public interface.

**Minor — `x.Y.0`**
Increment when new, backward-compatible functionality is introduced. Also increment when public API functionality is marked as deprecated, or when substantial internal improvements are made. Reset the patch version to `0`.

**Major — `X.0.0`**
Increment when backward-incompatible changes are introduced. Reset both minor and patch versions to `0`.

When in doubt, err on the side of a minor bump rather than a patch. A version number that's slightly higher than necessary causes no harm; a patch version that hides a breaking change causes real problems for people upgrading.

---

### Releasing a new version

Releases are triggered manually via two GitHub Actions workflows, run in order.
You will find both under **Actions** in the repository.

#### Step 1 — Create the release branch

1. Go to **Actions** → **[MANUAL] - 1. Create Release Branch**
2. Click **Run workflow**
3. Select the source branch from the **"Use workflow from"** dropdown:
    - `development` for a normal release
    - `main` for a hotfix (patch release on top of what's already in production)
4. Enter the version number (e.g. `2.1.0`) and run

The pipeline validates `next.md`, renames it to `2.1.0.md`, resets both working files to their templates, updates `config/hawki_version.json`, and pushes the result as a new `release/2.1.0` branch. You can review the branch, make last-minute corrections, or simply proceed.

#### Step 2 — Trigger the release

1. Go to **Actions** → **[MANUAL] - 2. Trigger Release**
2. Click **Run workflow**
3. Select **`release/v2.1.0`** from the **"Use workflow from"** dropdown — this is your release selector, there is no separate input field for the branch
4. Run the workflow

The pipeline validates the branch name, runs a Docker build test, then squash-merges the release branch into `main` and back into `development`, pushes the version tag, and deletes the release branch. This tag push automatically triggers the automated release pipeline, which builds the Docker image, creates the GitHub Release, and announces the update on Discord.

> **Hotfix?** The process is identical — the only difference is that you selected `main` as the source in Step 1 instead of `development`. The rest of the workflow is the same.

---

### Versioning convention

Git **tags** and working **branch names** do not carry a `v` prefix. The version `2.1.0` is tagged as `2.1.0` and the release branch is named `release/2.1.0`.

The only place the `v` prefix appears is in the **GitHub Release display name** (`v2.1.0`), which is cosmetic and matches GitHub's conventions for release pages.

| Thing               | Format            | Example                           |
|---------------------|-------------------|-----------------------------------|
| Git tag             | no prefix         | `2.1.0`                           |
| Release branch      | `release/` prefix | `release/2.1.0`                   |
| GitHub Release name | `v` prefix        | `v2.1.0`                          |
| Docker image tag    | no prefix         | `digitalenvironments/${YOUR_APP}:2.1.0` |

```


### 3. Pin to a release

Reference the actions by tag rather than `@main` to avoid your pipelines being
affected by updates:

```yaml
uses: hawk-digital-environments/hawk-pipeline-actions/create-release-branch@v1
```

---

## Example workflow files

Copy these into your repository's `.github/workflows/` directory. The steps marked
`# ── project-specific ──` are where you add your own build, test, or publish steps.

---

### `.github/workflows/create-release-branch.yml`

Run this first. Select `development` (or `main` for a hotfix) from the
**"Run workflow from"** dropdown.

```yaml
name: '[MANUAL] - 1. Create Release Branch'

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to release (semver, e.g. 2.1.0)'
        required: true
        type: string

permissions:
  contents: write

jobs:
  create-release-branch:
    name: Create release/v${{ inputs.version }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
          token: ${{ secrets.WORKFLOW_TOKEN }}

      - uses: hawk-digital-environments/hawk-pipeline-actions/create-release-branch@v1
        with:
          version: ${{ inputs.version }}
          # ── project-specific ──────────────────────────────────────────────
          # Option A: update the "version" key in a JSON file
          version-json: config/my-app-version.json
          # Option B: run a custom updater script for full control
          # version-updater: .github/version-updater.js
          # ──────────────────────────────────────────────────────────────────
```

---

### `.github/workflows/trigger-release.yml`

Run this second. Select the `release/vX.Y.Z` branch from the
**"Run workflow from"** dropdown — that branch IS the input.

```yaml
name: '[MANUAL] - 2. Trigger Release'

on:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  validate:
    name: Validate Release Branch
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.validate.outputs.version }}
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
          token: ${{ secrets.WORKFLOW_TOKEN }}

      - id: validate
        uses: hawk-digital-environments/hawk-pipeline-actions/validate-release-branch@v1

  # ── project-specific ──────────────────────────────────────────────────────
  # Add a build/test job here that runs before the merge is finalised.
  # If this job fails, the release is aborted — nothing is pushed.
  #
  # test-build:
  #   name: Test Build
  #   runs-on: ubuntu-latest
  #   needs: validate
  #   steps:
  #     - uses: actions/checkout@v5
  #     - name: Run your build or test suite here
  # ──────────────────────────────────────────────────────────────────────────

  release:
    name: Merge and Tag
    runs-on: ubuntu-latest
    needs: [ validate ] # add test-build here once you have one: [validate, test-build]
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
          token: ${{ secrets.WORKFLOW_TOKEN }}

      - uses: hawk-digital-environments/hawk-pipeline-actions/trigger-release@v1
        with:
          version: ${{ needs.validate.outputs.version }}
          release-branch: ${{ github.ref_name }}
          # main-branch: main         # default
          # development-branch: development  # default
```

---

### `.github/workflows/publish-version.yml`

This runs automatically when the version tag is pushed by the trigger-release workflow.
You do not run this manually.

```yaml
name: Release Pipeline

on:
  push:
    tags:
      - '[0-9]+.[0-9]+.[0-9]+'

permissions:
  contents: write

jobs:
  # ── project-specific ──────────────────────────────────────────────────────
  # Build and publish your artifacts here.
  # The example below is for a Docker image published to Docker Hub.
  build-and-publish:
    name: Build & Publish
    runs-on: ubuntu-latest
    permissions:
      packages: write
      contents: read
      attestations: write
      id-token: write
    outputs:
      version: ${{ steps.version.outputs.version }}
    steps:
      - uses: actions/checkout@v5

      - name: Read version
        id: version
        run: |
          VERSION=$(jq -r .version config/my-app-version.json)
          echo "version=$VERSION" >> $GITHUB_OUTPUT

      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push
        id: push
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: |
            your-org/your-image:latest
            your-org/your-image:${{ steps.version.outputs.version }}

      - uses: actions/attest-build-provenance@v1
        with:
          subject-name: index.docker.io/your-org/your-image
          subject-digest: ${{ steps.push.outputs.digest }}
          push-to-registry: true
  # ──────────────────────────────────────────────────────────────────────────

  github-release:
    name: Create GitHub Release
    runs-on: ubuntu-latest
    needs: build-and-publish
    permissions:
      contents: write
    outputs:
      release-name: ${{ steps.release.outputs.release-name }}
      release-body: ${{ steps.release.outputs.release-body }}
      release-url: ${{ steps.release.outputs.release-url }}
    steps:
      - uses: actions/checkout@v5

      - id: release
        uses: hawk-digital-environments/hawk-pipeline-actions/create-github-release@v1
        with:
          version: ${{ github.ref_name }}
          token: ${{ secrets.GITHUB_TOKEN }}
          # docs-base-url: https://docs.your-project.com  # optional

  notify-discord:
    name: Notify Discord
    runs-on: ubuntu-latest
    needs: [ build-and-publish, github-release ]
    if: success()
    steps:
      - uses: actions/checkout@v5

      - uses: hawk-digital-environments/hawk-pipeline-actions/send-discord-notification@v1
        with:
          webhook-url: ${{ secrets.DISCORD_UPDATE_WEBHOOK_URL }}
          release-name: ${{ needs.github-release.outputs.release-name }}
          release-body: ${{ needs.github-release.outputs.release-body }}
          release-url: ${{ needs.github-release.outputs.release-url }}
          content: '||@everyone|| Hey there! We just released **v${{ github.ref_name }}**!'
```

---

## Version management

### Option A — `version-json`

Points to any JSON file in your repository. The action updates the `"version"` key and
writes the file back. Works for `package.json`, custom config files, or anything else
that follows the `{ "version": "x.y.z" }` convention.

```yaml
- uses: hawk-digital-environments/hawk-pipeline-actions/create-release-branch@v1
  with:
    version: ${{ inputs.version }}
    version-json: package.json
```

### Option B — `version-updater`

Points to a `.js` file in your repository that exports a default function. Use this when
you need to update multiple files, use a non-JSON format, or run any other logic at
version bump time.

```yaml
- uses: hawk-digital-environments/hawk-pipeline-actions/create-release-branch@v1
  with:
    version: ${{ inputs.version }}
    version-updater: .github/version-updater.js
```

**Function signature:**

```typescript
(version: string, resolve: (path: string) => string) => void | Promise<void>
```

The `resolve` function converts a repository-relative path to an absolute path safe for
use in the runner environment. Always use it instead of `__dirname` or `process.cwd()`.

**Example `.github/version-updater.js`:**

```javascript
const fs = require('fs');

module.exports = async function (version, resolve) {
    // Update package.json
    const pkgPath = resolve('package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

    // Update a PHP constant, a Swift file, a .env — whatever you need
    const phpPath = resolve('src/Version.php');
    let php = fs.readFileSync(phpPath, 'utf8');
    php = php.replace(/VERSION = '[^']+'/, `VERSION = '${version}'`);
    fs.writeFileSync(phpPath, php);
};
```

---

## Action reference

### `create-release-branch`

| Input             | Required | Default      | Description                                                             |
|-------------------|----------|--------------|-------------------------------------------------------------------------|
| `version`         | ✅        | —            | Semver version to release (e.g. `2.1.0`)                                |
| `changelog-dir`   |          | `_changelog` | Path to the changelog directory                                         |
| `version-json`    |          | —            | Path to a JSON file whose `version` key will be updated                 |
| `version-updater` |          | —            | Path to a `.js` updater script (mutually exclusive with `version-json`) |

**Requires** a prior `actions/checkout` with `token: ${{ secrets.WORKFLOW_TOKEN }}` and `fetch-depth: 0`.

---

### `validate-release-branch`

Validates that the workflow is running from a `release/X.Y.Z` branch and parses the version from the branch name. Fails with a descriptive message if the branch does not match the expected pattern.

| Output    | Description                         |
|-----------|-------------------------------------|
| `version` | Parsed version string, e.g. `2.1.0` |

No inputs. Reads `GITHUB_REF_NAME` from the environment automatically.

---

### `trigger-release`

| Input                | Required | Default       | Description                                            |
|----------------------|----------|---------------|--------------------------------------------------------|
| `version`            | ✅        | —             | Version being released                                 |
| `release-branch`     | ✅        | —             | Full name of the release branch (e.g. `release/2.1.0`) |
| `main-branch`        |          | `main`        | Name of the production branch                          |
| `development-branch` |          | `development` | Name of the integration branch                         |

**Requires** a prior `actions/checkout` with `token: ${{ secrets.WORKFLOW_TOKEN }}` and `fetch-depth: 0`.

If the merge into `main` fails, nothing is pushed and the workflow can be safely re-run
after resolving conflicts on the release branch. If the merge into `development` fails
after the tag has already been pushed, the release pipeline is already running — the
action logs a clear message explaining what needs manual attention.

---

### `create-github-release`

| Input           | Required | Default      | Description                                                                                                              |
|-----------------|----------|--------------|--------------------------------------------------------------------------------------------------------------------------|
| `version`       | ✅        | —            | Version to release. A leading `v` is accepted and stripped for file lookup.                                              |
| `token`         | ✅        | —            | GitHub token with permission to create releases (`GITHUB_TOKEN` is sufficient)                                           |
| `changelog-dir` |          | `_changelog` | Path to the changelog directory                                                                                          |
| `docs-base-url` |          | —            | Base URL of your documentation site. When set and an upgrade guide exists, a link to it is appended to the release body. |

| Output         | Description                                  |
|----------------|----------------------------------------------|
| `release-name` | Name of the created release                  |
| `release-body` | Full body/description of the created release |
| `release-url`  | HTML URL of the created release              |

---

### `send-discord-notification`

| Input          | Required | Default | Description                                                                       |
|----------------|----------|---------|-----------------------------------------------------------------------------------|
| `webhook-url`  | ✅        | —       | Discord webhook URL                                                               |
| `release-name` | ✅        | —       | Title of the release                                                              |
| `release-body` | ✅        | —       | Release description in markdown                                                   |
| `release-url`  | ✅        | —       | URL to the release page                                                           |
| `content`      |          | —       | Optional message content sent outside the embed (useful for `@everyone` mentions) |

The action formats the release body for Discord: removes GitHub reference links,
converts `@mentions` to profile links, downsizes headings to bold text, and enforces
Discord's character limits.
