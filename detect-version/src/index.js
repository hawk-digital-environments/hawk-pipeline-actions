const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const core = require('@actions/core');
const semver = require('semver');

const STRATEGIES = ['tag', 'static', 'version-json', 'changelog'];

function run() {
    const strategy = core.getInput('strategy') || 'tag';
    const workspace = process.env.GITHUB_WORKSPACE;

    if (!STRATEGIES.includes(strategy)) {
        core.setFailed(
            `Unknown strategy "${strategy}". Valid options are: ${STRATEGIES.map(s => `"${s}"`).join(', ')}.`
        );
        return;
    }

    const version = detectVersion(strategy, workspace);

    if (version !== null) {
        core.info(`Detected version: ${version}`);
        core.setOutput('version', version);
    }
}

function detectVersion(strategy, workspace) {
    switch (strategy) {
        case 'tag':          return fromTag(workspace);
        case 'static':       return fromStatic();
        case 'version-json': return fromVersionJson(workspace);
        case 'changelog':    return fromChangelog(workspace);
    }
}

// ── Strategies ───────────────────────────────────────────────────────────────

function fromTag(workspace) {
    let raw;
    try {
        raw = execSync('git tag --points-at HEAD', { cwd: workspace, stdio: 'pipe' })
            .toString()
            .trim();
    } catch (error) {
        core.setFailed(`Failed to read git tags: ${error.message}`);
        return null;
    }

    const tags = raw ? raw.split('\n').filter(Boolean) : [];

    if (tags.length === 0) {
        core.setFailed(
            'No git tag found at the current commit. ' +
            'Make sure the workflow is triggered by a tag push, ' +
            'or choose a different strategy.'
        );
        return null;
    }

    const semverTags = tags
        .map(tag => ({ raw: tag, clean: semver.clean(tag) }))
        .filter(t => t.clean !== null);

    if (semverTags.length === 0) {
        core.setFailed(
            `Found tag(s) at the current commit (${tags.join(', ')}) ` +
            'but none match semver. Expected a version like "2.1.0" or "v2.1.0".'
        );
        return null;
    }

    if (semverTags.length > 1) {
        semverTags.sort((a, b) => semver.rcompare(a.clean, b.clean));
        core.warning(
            `Multiple semver tags at current commit: ${semverTags.map(t => t.raw).join(', ')}. ` +
            `Using the highest: ${semverTags[0].raw}.`
        );
    }

    return semverTags[0].clean;
}

function fromStatic() {
    const input = core.getInput('version');

    if (!input) {
        core.setFailed('The "static" strategy requires the "version" input to be set.');
        return null;
    }

    const clean = semver.clean(input);
    if (!clean) {
        core.setFailed(
            `"${input}" is not a valid semver version. ` +
            'Expected a version like "2.1.0" or "v2.1.0".'
        );
        return null;
    }

    return clean;
}

function fromVersionJson(workspace) {
    const input = core.getInput('version-json');

    if (!input) {
        core.setFailed('The "version-json" strategy requires the "version-json" input to be set.');
        return null;
    }

    const filePath = path.resolve(workspace, input);

    if (!fs.existsSync(filePath)) {
        core.setFailed(`Version JSON file not found at: ${input}`);
        return null;
    }

    let data;
    try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        core.setFailed(`Failed to parse "${input}" as JSON: ${error.message}`);
        return null;
    }

    if (!data.version) {
        core.setFailed(`No "version" property found in "${input}".`);
        return null;
    }

    const clean = semver.clean(data.version);
    if (!clean) {
        core.setFailed(
            `The "version" property in "${input}" ("${data.version}") is not a valid semver version.`
        );
        return null;
    }

    return clean;
}

function fromChangelog(workspace) {
    const changelogDir = core.getInput('changelog-dir') || '_changelog';
    const dirPath = path.join(workspace, changelogDir);

    if (!fs.existsSync(dirPath)) {
        core.setFailed(`Changelog directory not found at: ${changelogDir}`);
        return null;
    }

    let files;
    try {
        files = fs.readdirSync(dirPath);
    } catch (error) {
        core.setFailed(`Failed to read changelog directory "${changelogDir}": ${error.message}`);
        return null;
    }

    const EXCLUDED = new Set(['next', 'next-upgrade', 'README', 'index']);

    const versions = files
        .filter(f => f.endsWith('.md'))
        .map(f => f.slice(0, -3))                          // strip .md
        .filter(name => !EXCLUDED.has(name))
        .filter(name => !name.endsWith('-upgrade'))        // skip X.Y.Z-upgrade.md
        .map(name => ({ name, clean: semver.clean(name) }))
        .filter(entry => entry.clean !== null)
        .sort((a, b) => semver.rcompare(a.clean, b.clean));

    if (versions.length === 0) {
        core.setFailed(
            `No semver-versioned changelog files found in "${changelogDir}". ` +
            'Expected files named like "2.1.0.md".'
        );
        return null;
    }

    const latest = versions[0];
    core.info(`Found ${versions.length} versioned changelog file(s). Latest: ${latest.name}.md`);

    return latest.clean;
}

run();
