const core = require('@actions/core');

const removeCarriageReturn = (text) => text.replace(/\r/g, '');
const removeHTMLComments = (text) => text.replace(/<!--.*?-->/gs, '');

const reduceNewlines = (text) => text.replace(/\n\s*\n/g, (ws) => {
    const nlCount = (ws.match(/\n/g) || []).length;
    return nlCount >= 2 ? '\n\n' : '\n';
});

const convertMentionsToLinks = (text) => text.replace(
    /(?<![/@\w])@((?!-)(?!.*?--)[a-zA-Z0-9](?:-?[a-zA-Z0-9]){0,37})(?![.\w/-])(?!.*\])/g,
    (match, name) => `[@${name}](https://github.com/${name})`
);

const removeGithubReferenceLinks = (text) => text
    .replace(/\[[^\]]*\]\(https:\/\/github\.com\/[^(\s)]+\/pull\/\d+\)/g, '')
    .replace(/\[[^\]]*\]\(https:\/\/github\.com\/[^(\s)]+\/commit\/\w+\)/g, '')
    .replace(/\[[^\]]*\]\(https:\/\/github\.com\/[^(\s)]+\/issues\/\d+\)/g, '')
    .replace(/https:\/\/github\.com\/[^(\s)]+\/pull\/\d+/g, '')
    .replace(/https:\/\/github\.com\/[^(\s)]+\/commit\/\w+/g, '')
    .replace(/https:\/\/github\.com\/[^(\s)]+\/issues\/\d+/g, '')
    .replace(/\(\s*\)/g, '');

const reduceHeadings = (text) => text
    .replace(/^######\s+(.+)$/gm, '_$1_')
    .replace(/^#####\s+(.+)$/gm, '_$1_')
    .replace(/^####\s+(.+)$/gm, '_$1_')
    .replace(/^###\s+(.+)$/gm, '**_$1_**')
    .replace(/^##\s+(.+)$/gm, '**$1**');

const convertLinksToMarkdown = (text) => {
    const markdownLinks = [];
    const withoutLinks = text.replace(/\[.*?\]\(.*?\)/g, (link) => {
        markdownLinks.push(link);
        return `__LINK_${markdownLinks.length - 1}__`;
    });

    const processed = withoutLinks
        .replace(/https:\/\/github\.com\/([\w-]+)\/([\w-]+)\/pull\/(\d+)/g,
            (match, _, __, n) => `[PR #${n}](${match})`)
        .replace(/https:\/\/github\.com\/([\w-]+)\/([\w-]+)\/issues\/(\d+)/g,
            (match, _, __, n) => `[Issue #${n}](${match})`)
        .replace(/https:\/\/github\.com\/([\w-]+)\/([\w-]+)\/compare\/([v\w.-]+)\.\.\.([v\w.-]+)/g,
            (match, _, __, from, to) => `[${from}...${to}](${match})`);

    return processed.replace(/__LINK_(\d+)__/g, (_, i) => markdownLinks[parseInt(i, 10)]);
};

const limitString = (str, max) => str.length <= max ? str : str.substring(0, max - 1) + '…';

const formatDescription = (description) => {
    let text = removeCarriageReturn(description);
    text = removeHTMLComments(text);
    text = reduceNewlines(text);
    text = removeGithubReferenceLinks(text);
    text = convertMentionsToLinks(text);
    text = convertLinksToMarkdown(text);
    text = text.trim();
    text = reduceHeadings(text);
    return text;
};

async function run() {
    const webhookUrl = core.getInput('webhook-url', { required: true });
    const name = core.getInput('release-name', { required: true });
    const body = core.getInput('release-body', { required: true });
    const url = core.getInput('release-url', { required: true });
    const content = core.getInput('content');

    const embed = {
        title: limitString(name, 256),
        url,
        description: limitString(formatDescription(body), 4096),
        footer: {}
    };

    const payload = {
        embeds: [embed],
        ...(content && { content })
    };

    const response = await fetch(`${webhookUrl}?wait=true`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        core.setFailed(`Discord webhook returned an error: ${JSON.stringify(data)}`);
    }
}

run().catch(error => {
    core.setFailed(error.message);
});
