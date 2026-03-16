const core = require('@actions/core');

function run() {
    const refName = process.env.GITHUB_REF_NAME;

    if (!refName) {
        core.setFailed('GITHUB_REF_NAME is not set.');
        return;
    }

    const match = refName.match(/^release\/(\d+\.\d+\.\d+)$/);

    if (!match) {
        core.setFailed(
            `This workflow must be run from a release branch named "release/X.Y.Z". ` +
            `Current branch is "${refName}". ` +
            'Select the correct release branch from the "Run workflow from" dropdown.'
        );
        return;
    }

    const version = match[1];
    core.info(`Release branch validated. Version: ${version}`);
    core.setOutput('version', version);
}

run();
