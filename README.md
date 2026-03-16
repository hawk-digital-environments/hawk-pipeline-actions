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
The `[[DELETE_ME_TO_INCLUDE_THIS_FILE]]` marker tells the action whether a file has been
filled in. As long as the marker is present, the file is ignored. Both files are
automatically reset to these templates after every release.

**`_changelog/next.md`**

```markdown
# vX.Y.Z

> [[DELETE_ME_TO_INCLUDE_THIS_FILE]]
> Fill in the sections below and remove this marker to include this file in the next release.

### What's New

- The main new features and changes in this version.

### Quality of Life

- Improvements and enhancements that improve the user experience.

### Bugfix

- List of bugs that have been fixed in this version.

### Deprecation

- List of features or functionalities that have been deprecated in this version.
```

**`_changelog/next-upgrade.md`**

```markdown
# Upgrade Guide

> [[DELETE_ME_TO_INCLUDE_THIS_FILE]]
> Fill in the sections below and remove this marker to include this upgrade guide in the next release.
> If this version requires no special upgrade steps, leave this file exactly as-is.

## Overview

Briefly describe what makes this upgrade different from a routine update
and why manual intervention is required.

## Steps

### 1. Example step

Describe what the user needs to do.

## Notes

Any additional warnings or tips for administrators performing the upgrade.
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
      - uses: actions/checkout@v4
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
      - uses: actions/checkout@v4
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
  #     - uses: actions/checkout@v4
  #     - name: Run your build or test suite here
  # ──────────────────────────────────────────────────────────────────────────

  release:
    name: Merge and Tag
    runs-on: ubuntu-latest
    needs: [ validate ] # add test-build here once you have one: [validate, test-build]
    steps:
      - uses: actions/checkout@v4
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
      - uses: actions/checkout@v4

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
      - uses: actions/checkout@v4

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
      - uses: actions/checkout@v4

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
