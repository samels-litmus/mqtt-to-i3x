export interface TemplateCapture {
  [key: string]: string;
}

export interface CompiledTemplate {
  pattern: RegExp;
  paramNames: string[];
  original: string;
}

export function compileTopicPattern(pattern: string): CompiledTemplate {
  const paramNames: string[] = [];
  const regexParts: string[] = [];
  let lastIndex = 0;

  const paramRegex = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null;

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

export function matchTopic(
  topic: string,
  compiled: CompiledTemplate
): TemplateCapture | null {
  const match = compiled.pattern.exec(topic);
  if (!match) return null;

  const capture: TemplateCapture = {};
  for (let i = 0; i < compiled.paramNames.length; i++) {
    capture[compiled.paramNames[i]] = match[i + 1];
  }
  return capture;
}

export function renderTemplate(
  template: string,
  captures: TemplateCapture
): string {
  return template.replace(/\{([^}]+)\}/g, (_, key) => captures[key] ?? '');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
