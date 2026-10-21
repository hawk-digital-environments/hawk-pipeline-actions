const { execSync } = require('child_process');
const core = require('@actions/core');

// Branch and remote names are interpolated into shell commands below,
// so refuse anything outside this safe charset.
const SAFE_REF = /^[A-Za-z0-9._/-]+$/;

function run() {
    const branch = core.getInput('branch') || 'main';
    const remote = core.getInput('remote') || 'origin';
    const workspace = process.env.GITHUB_WORKSPACE;

    if (!SAFE_REF.test(branch)) {
        core.setFailed(`Invalid branch name: "${branch}"`);
        return;
    }
    if (!SAFE_REF.test(remote)) {
        core.setFailed(`Invalid remote name: "${remote}"`);
        return;
    }

    const headSha = revParseHead(workspace);
    if (!headSha) {
        return; // revParseHead already failed the run
    }

    const branchTipSha = lsRemoteBranchTip(remote, branch, workspace);

    core.info(`Checked-out HEAD: ${headSha}`);
    core.info(`Tip of ${remote}/${branch}: ${branchTipSha || 'not found'}`);

    if (!branchTipSha) {
        core.warning(
            `Could not resolve the tip of "${branch}" on remote "${remote}". ` +
            'Assuming the checkout is NOT the branch tip.'
        );
    }

    const isBranchTip = Boolean(branchTipSha) && branchTipSha === headSha;

    core.info(isBranchTip
        ? `The checkout IS the tip of ${remote}/${branch}.`
        : `The checkout is BEHIND the tip of ${remote}/${branch} (or the branch could not be found).`
    );

    core.setOutput('is-branch-tip', String(isBranchTip));
    core.setOutput('head-sha', headSha);
    core.setOutput('branch-tip-sha', branchTipSha);
}

/**
 * Full SHA of the checked-out HEAD commit. ls-remote cannot answer
 * this one: it only knows remote refs.
 */
function revParseHead(workspace) {
    try {
        return execSync('git rev-parse HEAD', { cwd: workspace, stdio: 'pipe' })
            .toString()
            .trim();
    } catch (error) {
        core.setFailed(`Could not resolve the checked-out commit: ${error.message}`);
        return null;
    }
}

/**
 * Tip SHA of the given branch on the remote, or an empty string when
 * the branch does not exist there. Uses ls-remote so it works
 * regardless of how shallow the checkout is.
 */
function lsRemoteBranchTip(remote, branch, workspace) {
    try {
        const result = execSync(
            `git ls-remote ${remote} refs/heads/${branch}`,
            { cwd: workspace, stdio: 'pipe' }
        ).toString().trim();

        return result.split(/\s+/)[0] || '';
    } catch (error) {
        core.warning(`Could not query remote "${remote}": ${error.message}`);
        return '';
    }
}

run();