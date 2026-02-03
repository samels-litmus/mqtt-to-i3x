export function compileTopicPattern(pattern) {
    const paramNames = [];
    const regexParts = [];
    let lastIndex = 0;
    const paramRegex = /\{([^}]+)\}/g;
    let match;
    while ((match = paramRegex.exec(pattern)) !== null) {
        if (match.index > lastIndex) {
            regexParts.push(escapeRegex(pattern.slice(lastIndex, match.index)));
        }
        paramNames.push(match[1]);
        regexParts.push('([^/]+)');
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < pattern.length) {
        regexParts.push(escapeRegex(pattern.slice(lastIndex)));
    }
    return {
        pattern: new RegExp(`^${regexParts.join('')}$`),
        paramNames,
        original: pattern,
    };
}
export function matchTopic(topic, compiled) {
    const match = compiled.pattern.exec(topic);
    if (!match)
        return null;
    const capture = {};
    for (let i = 0; i < compiled.paramNames.length; i++) {
        capture[compiled.paramNames[i]] = match[i + 1];
    }
    return capture;
}
export function renderTemplate(template, captures) {
    return template.replace(/\{([^}]+)\}/g, (_, key) => captures[key] ?? '');
}
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
