const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const core = require('@actions/core');
const semver = require('semver');
const marked = require('marked');

const NEXT_TEMPLATE = `# v%%VERSION%%

### What's New

[//]: # (- The main new features and changes in this version.)

### Quality of Life

[//]: # (- Improvements and enhancements that improve the user experience.)

### Bugfix

[//]: # (- List of bugs that have been fixed in this version.)

### Deprecation

[//]: # (- List of features or functionalities that have been deprecated in this version.)
`;

const NEXT_UPGRADE_TEMPLATE = `# Upgrading to version %%VERSION%%

## Overview

[//]: # (Briefly describe what makes this upgrade different from a routine update)
[//]: # (and why manual intervention is required.)

## Steps

### 1. Example step

[//]: # (Describe what the user needs to do.)

## Notes

[//]: # (Any additional warnings or tips for administrators performing the upgrade.)
`;

/**
 * Processes a markdown changelog file in two stages:
 *
 * Stage 1 — Strip template placeholder comments:
 *   marked tokenizes [//]: # (text) as { type: "def", tag: "//", href: "#", title: "text" }.
 *   We filter those tokens out before doing anything else.
 *
 * Stage 2 — Remove empty sections (iterates until stable):
 *   A heading is removed if its direct token body contains no meaningful content
 *   AND the next heading is at the same depth or shallower (not a child).
 *   Repeats so that cascading empty parents are also cleaned up.
 *
 * Stage 3 — Reconstruct markdown from the remaining tokens, preserving original formatting and replace markers.
 *
 * Markdown is reconstructed from token.raw, preserving the original formatting exactly.
 * Returns the processed body without h1, or null if nothing real remained.
 */
function processMarkdownContent(rawContent, args) {
    // Stage 1: tokenize and strip template comments
    const allTokens = marked.lexer(rawContent);
    const tokens = allTokens.filter(
        token => !(token.type === 'def' && token.tag === '//')
    );

    // Group tokens into sections: { heading: token|null, tokens: token[] }
    // Each heading starts a new section; everything until the next heading is its body.
    let sections = [];
    let currentHeading = null;
    let currentTokens = [];

    for (const token of tokens) {
        if (token.type === 'heading') {
            sections.push({ heading: currentHeading, tokens: currentTokens });
            currentHeading = token;
            currentTokens = [];
        } else {
            currentTokens.push(token);
        }
    }
    sections.push({ heading: currentHeading, tokens: currentTokens });

    // A section body has meaningful content if it contains anything other than whitespace
    const hasContent = (sectionTokens) => sectionTokens.some(t => t.type !== 'space');

    // Stage 2: iteratively drop empty sections until the list stabilises
    let changed = true;
    while (changed) {
        changed = false;
        const kept = [];

        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            const next = sections[i + 1];

            // Pre-document content (before the first heading): keep if non-empty
            if (section.heading === null) {
                if (hasContent(section.tokens)) kept.push(section);
                else changed = true;
                continue;
            }

            // Direct content present: always keep
            if (hasContent(section.tokens)) {
                kept.push(section);
                continue;
            }

            // Empty body: keep only if the next heading is a child (deeper level),
            // meaning this heading is a container whose children justify its presence
            const nextDepth = next?.heading?.depth ?? null;
            if (nextDepth !== null && nextDepth > section.heading.depth) {
                kept.push(section); // parent container — re-evaluated next iteration
            } else {
                changed = true;
            }
        }

        sections = kept;
    }

    if (sections.length === 0) return null;

    // Reconstruct markdown from token.raw — preserves original formatting exactly
    return sections
        .map(section => {
            const parts = [];
            if (section.heading) {
                parts.push(section.heading.raw.trimEnd());
            }
            const body = section.tokens.map(t => t.raw).join('').trim();
            if (body) parts.push(body);
            return parts.join('\n\n');
        })
        .join('\n\n')
        .trim()
        .replace(/%%VERSION%%/g, args.version || 'unknown-version');
}

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

    const versionMdPath = path.join(changelogDirPath, `${version}.md`);
    if (fs.existsSync(versionMdPath)) {
        core.setFailed(
            `${changelogDir}/${version}.md already exists. ` +
            'Did you already prepare this release? Remove the file if you want to start over.'
        );
        return;
    }

    execSync(`git checkout -b ${releaseBranch}`, execOpts);

    processNextMd(changelogDirPath, version);
    processNextUpgradeMd(changelogDirPath, version);

    await updateVersion(version, versionJson, versionUpdater, workspace);

    execSync('git config --local user.email "action@github.com"', execOpts);
    execSync('git config --local user.name "GitHub Action"', execOpts);
    execSync(`git add "${changelogDir}"`, execOpts);

    if (versionJson) {
        execSync(`git add "${versionJson}"`, execOpts);
    } else if (versionUpdater) {
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

    const processed = processMarkdownContent(fs.readFileSync(nextMdPath, 'utf8'), {version});

    if (!processed) {
        core.setFailed(
            'next.md contains no content beyond the template placeholders. ' +
            'Add your changes under the relevant section headings before creating a release branch.'
        );
        process.exit(1);
    }

    fs.writeFileSync(versionMdPath, `${processed}\n`);
    core.info(`Created ${version}.md.`);

    fs.writeFileSync(nextMdPath, NEXT_TEMPLATE);
    core.info('Reset next.md to template.');
}

function processNextUpgradeMd(changelogDirPath, version) {
    const nextUpgradeMdPath = path.join(changelogDirPath, 'next-upgrade.md');
    const versionUpgradeMdPath = path.join(changelogDirPath, `${version}-upgrade.md`);

    if (!fs.existsSync(nextUpgradeMdPath)) {
        core.info('No next-upgrade.md found — no upgrade guide will be included.');
        fs.writeFileSync(nextUpgradeMdPath, NEXT_UPGRADE_TEMPLATE);
        core.info('Created next-upgrade.md from template.');
        return;
    }

    const processed = processMarkdownContent(fs.readFileSync(nextUpgradeMdPath, 'utf8'), {version});

    if (!processed) {
        core.info('next-upgrade.md contains only template placeholders — no upgrade guide will be included.');
    } else {
        fs.writeFileSync(versionUpgradeMdPath, `${processed}\n`);
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
