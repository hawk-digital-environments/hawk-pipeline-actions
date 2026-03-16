const path = require('path');
const { execSync } = require('child_process');
const core = require('@actions/core');

function run() {
    const version = core.getInput('version', { required: true });
    const releaseBranch = core.getInput('release-branch', { required: true });
    const mainBranch = core.getInput('main-branch') || 'main';
    const developmentBranch = core.getInput('development-branch') || 'development';

    const workspace = process.env.GITHUB_WORKSPACE;
    const execOpts = { cwd: workspace, stdio: 'inherit' };

    execSync('git config --local user.email "action@github.com"', execOpts);
    execSync('git config --local user.name "GitHub Action"', execOpts);
    execSync('git fetch origin', execOpts);

    // ── 1. Squash-merge release branch → main ──────────────────────────────
    core.info(`Squash-merging ${releaseBranch} into ${mainBranch}...`);
    try {
        execSync(`git checkout -B ${mainBranch} origin/${mainBranch}`, execOpts);
        execSync(`git merge --squash origin/${releaseBranch}`, execOpts);
        execSync(`git commit -m "Release ${version}"`, execOpts);
    } catch (error) {
        core.setFailed(
            `Failed to squash-merge ${releaseBranch} into ${mainBranch}. ` +
            'Nothing has been pushed. Resolve any conflicts on the release branch and re-run.'
        );
        return;
    }

    const sha = execSync('git rev-parse HEAD', { cwd: workspace, stdio: 'pipe' })
        .toString()
        .trim();
    core.info(`Squash commit on ${mainBranch}: ${sha}`);

    execSync(`git push origin ${mainBranch}`, execOpts);
    core.info(`Pushed to ${mainBranch}.`);

    // ── 2. Tag the squash commit ─────────────────────────────────────────────
    core.info(`Creating tag ${version} at ${sha}...`);
    execSync(`git tag ${version} ${sha}`, execOpts);
    execSync(`git push origin ${version}`, execOpts);
    core.info(`Tag ${version} pushed.`);

    // ── 3. Squash-merge release branch → development ─────────────────────────
    core.info(`Squash-merging ${releaseBranch} into ${developmentBranch}...`);
    try {
        execSync(`git checkout -B ${developmentBranch} origin/${developmentBranch}`, execOpts);
        execSync(`git merge --squash origin/${releaseBranch}`, execOpts);
        execSync(`git commit -m "chore: Back-merge release ${version} into ${developmentBranch}"`, execOpts);
        execSync(`git push origin ${developmentBranch}`, execOpts);
        core.info(`Pushed back-merge to ${developmentBranch}.`);
    } catch (error) {
        core.error(
            `Failed to squash-merge ${releaseBranch} into ${developmentBranch}.\n` +
            `Tag ${version} has already been pushed — the release pipeline is running.\n` +
            `Please resolve the conflict manually and push the back-merge to ${developmentBranch}.`
        );
        return;
    }

    // ── 4. Delete the release branch ─────────────────────────────────────────
    core.info(`Deleting ${releaseBranch}...`);
    execSync(`git push origin --delete ${releaseBranch}`, execOpts);
    core.info(`${releaseBranch} deleted. Release ${version} is complete.`);
}

run();
