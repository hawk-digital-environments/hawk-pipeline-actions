const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const core = require('@actions/core');
const semver = require('semver');

const TEMPLATE_MARKER = '[[DELETE_ME_TO_INCLUDE_THIS_FILE]]';

const NEXT_TEMPLATE = `# vX.Y.Z (header will be updated by pipeline)

> ${TEMPLATE_MARKER}
> Fill in the sections below and remove this marker to enable the next release.
> In order to trigger "create-release-branch", the marker MUST be removed.

### What's New

- The main new features and changes in this version.

### Quality of Life

- Improvements and enhancements that improve the user experience.

### Bugfix

- List of bugs that have been fixed in this version.

### Deprecation

- List of features or functionalities that have been deprecated in this version.
`;

const NEXT_UPGRADE_TEMPLATE = `# Upgrade Guide (header will be updated by pipeline)

> ${TEMPLATE_MARKER}
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
`;

async function run() {
    const version = core.getInput('version', { required: true });
    const changelogDir = core.getInput('changelog-dir') || '_changelog';
    const versionJson = core.getInput('version-json');
    const versionUpdater = core.getInput('version-updater');

    if (versionJson && versionUpdater) {
        core.setFailed(
            'Inputs "version-json" and "version-updater" are mutually exclusive. Please set only one.'
        );
        return;
    }

    if (!semver.valid(version)) {
        core.setFailed(
            `"${version}" is not a valid semver version. ` +
            'Please provide a version in the format X.Y.Z (e.g. 2.1.0).'
        );
        return;
    }

    const workspace = process.env.GITHUB_WORKSPACE;
    const sourceBranch = process.env.GITHUB_REF_NAME;
    const changelogDirPath = path.join(workspace, changelogDir);
    const releaseBranch = `release/${version}`;
    const execOpts = { cwd: workspace, stdio: 'inherit' };

    core.info(`Creating "${releaseBranch}" from "${sourceBranch}".`);

    // Ensure the release branch does not already exist remotely
    try {
        execSync(`git ls-remote --exit-code origin refs/heads/${releaseBranch}`, {
            cwd: workspace,
            stdio: 'pipe'
        });
        core.setFailed(
            `Branch "${releaseBranch}" already exists on the remote. ` +
            'Delete it first, or choose a different version.'
        );
        return;
    } catch {
        core.info(`No existing "${releaseBranch}" found — proceeding.`);
    }

    // Ensure we are not overwriting an existing version changelog
    const versionMdPath = path.join(changelogDirPath, `${version}.md`);
    if (fs.existsSync(versionMdPath)) {
        core.setFailed(
            `${changelogDir}/${version}.md already exists. ` +
            'Did you already prepare this release? Remove the file if you want to start over.'
        );
        return;
    }

    // Create the release branch from the current HEAD
    execSync(`git checkout -b ${releaseBranch}`, execOpts);

    // Process changelog files — these throw on fatal errors
    processNextMd(changelogDirPath, version);
    processNextUpgradeMd(changelogDirPath, version);

    // Handle version file update
    await updateVersion(version, versionJson, versionUpdater, workspace);

    // Commit and push
    execSync('git config --local user.email "action@github.com"', execOpts);
    execSync('git config --local user.name "GitHub Action"', execOpts);

    // Stage changelog dir (covers both new files and modifications)
    execSync(`git add "${changelogDir}"`, execOpts);

    if (versionJson) {
        execSync(`git add "${versionJson}"`, execOpts);
    } else if (versionUpdater) {
        // Stage any tracked files modified by the updater script
        execSync('git add -u', execOpts);
    }

    execSync(`git commit -m "chore: Prepare release v${version}"`, execOpts);
    execSync(`git push origin ${releaseBranch}`, execOpts);

    core.info(`Branch "${releaseBranch}" created and pushed. Ready for trigger-release.`);
}

function processNextMd(changelogDirPath, version) {
    const nextMdPath = path.join(changelogDirPath, 'next.md');
    const versionMdPath = path.join(changelogDirPath, `${version}.md`);

    if (!fs.existsSync(nextMdPath)) {
        core.setFailed(
            'No next.md found in the changelog directory. ' +
            'Please write the changelog entry before creating a release branch.'
        );
        process.exit(1);
    }

    const content = fs.readFileSync(nextMdPath, 'utf8');

    if (content.includes(TEMPLATE_MARKER)) {
        core.setFailed(
            `next.md still contains the ${TEMPLATE_MARKER} marker. ` +
            'Fill in the changelog entry and remove the marker before creating a release branch.'
        );
        process.exit(1);
    }

    const lines = content.split('\n');
    lines[0] = `# v${version}`;

    fs.writeFileSync(versionMdPath, lines.join('\n'));
    core.info(`Created ${version}.md.`);

    fs.writeFileSync(nextMdPath, NEXT_TEMPLATE);
    core.info('Reset next.md to template.');
}

function processNextUpgradeMd(changelogDirPath, version) {
    const nextUpgradeMdPath = path.join(changelogDirPath, 'next-upgrade.md');
    const versionUpgradeMdPath = path.join(changelogDirPath, `${version}-upgrade.md`);
    let shouldProcess = false;
    let content = '';

    if (!fs.existsSync(nextUpgradeMdPath)) {
        core.info('No next-upgrade.md found — no upgrade guide will be included.');
    } else {
        content = fs.readFileSync(nextUpgradeMdPath, 'utf8');
        if (content.includes(TEMPLATE_MARKER)) {
            core.info(`next-upgrade.md contains the ${TEMPLATE_MARKER} marker — skipping.`);
        } else {
            shouldProcess = true;
        }
    }

    if (shouldProcess) {
        const lines = content.split('\n');
        lines[0] = `# Upgrading to v${version}`;
        fs.writeFileSync(versionUpgradeMdPath, lines.join('\n'));
        core.info(`Created ${version}-upgrade.md.`);
    }

    fs.writeFileSync(nextUpgradeMdPath, NEXT_UPGRADE_TEMPLATE);
    core.info('Reset next-upgrade.md to template.');
}

async function updateVersion(version, versionJson, versionUpdater, workspace) {
    if (!versionJson && !versionUpdater) {
        core.info('No version file configuration provided — skipping version update.');
        return;
    }

    if (versionJson) {
        const filePath = path.resolve(workspace, versionJson);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        data.version = version;
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
        core.info(`Updated "version" to "${version}" in ${versionJson}.`);
        return;
    }

    if (versionUpdater) {
        const scriptPath = path.resolve(workspace, versionUpdater);

        if (!fs.existsSync(scriptPath)) {
            core.setFailed(`Version updater script not found at: ${versionUpdater}`);
            process.exit(1);
        }

        const mod = require(scriptPath);
        const updateFn = typeof mod === 'function' ? mod : mod.default;

        if (typeof updateFn !== 'function') {
            core.setFailed(
                `The version updater at "${versionUpdater}" must export a function as its default export.`
            );
            process.exit(1);
        }

        const resolve = (filePath) =>
            path.isAbsolute(filePath) ? filePath : path.join(workspace, filePath);

        await updateFn(version, resolve);
        core.info(`Version updater at "${versionUpdater}" executed successfully.`);
    }
}

run().catch(error => {
    core.setFailed(error.message);
});
