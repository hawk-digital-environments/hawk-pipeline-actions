const fs = require('fs');
const path = require('path');
const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
    const rawVersion = core.getInput('version', { required: true });
    const token = core.getInput('token', { required: true });
    const changelogDir = core.getInput('changelog-dir') || '_changelog';
    const docsBaseUrl = core.getInput('docs-base-url');

    // Strip a leading 'v' so both "2.1.0" and "v2.1.0" are accepted
    const version = rawVersion.replace(/^v/, '');

    const workspace = process.env.GITHUB_WORKSPACE;
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
    const octokit = github.getOctokit(token);

    // Read the changelog file
    const changelogPath = path.join(workspace, changelogDir, `${version}.md`);
    let content;
    try {
        content = fs.readFileSync(changelogPath, 'utf8');
    } catch {
        core.setFailed(
            `Could not read changelog file at ${changelogDir}/${version}.md. ` +
            'Make sure the release branch was prepared before triggering this workflow.'
        );
        return;
    }

    // Strip the top-level heading
    const headingRegex = new RegExp(`^#\\s*v?${version}\\s*\\n?`);
    content = content.replace(headingRegex, '').trim();

    if (!content.replace(/\s+/g, '')) {
        core.setFailed(`Changelog content for version ${version} is empty after removing the heading.`);
        return;
    }

    // Append upgrade guide reference if one exists
    const upgradePath = path.join(workspace, changelogDir, `${version}-upgrade.md`);
    if (fs.existsSync(upgradePath)) {
        if (docsBaseUrl) {
            const upgradeUrl = `${docsBaseUrl.replace(/\/$/, '')}/changelog/${version}-upgrade`;
            content += `\n\n## Upgrade Guide\n\nThis release requires manual upgrade steps. ` +
                `Please see the [upgrade guide](${upgradeUrl}) before upgrading.`;
        } else {
            content += `\n\n## Upgrade Guide\n\nThis release requires manual upgrade steps. ` +
                `Please refer to the upgrade guide included in the repository changelog.`;
        }
    }

    // Create the GitHub release (tag must already exist)
    try {
        const release = await octokit.rest.repos.createRelease({
            owner,
            repo,
            tag_name: version,
            name: `v${version}`,
            body: content,
            draft: false,
            prerelease: false
        });

        core.info(`Created release v${version}: ${release.data.html_url}`);
        core.setOutput('release-name', release.data.name);
        core.setOutput('release-body', release.data.body);
        core.setOutput('release-url', release.data.html_url);
    } catch (error) {
        core.setFailed(`Failed to create GitHub release: ${error.message}`);
    }
}

run().catch(error => {
    core.setFailed(error.message);
});
