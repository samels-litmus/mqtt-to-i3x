export interface TemplateCapture {
    [key: string]: string;
}
export interface CompiledTemplate {
    pattern: RegExp;
    paramNames: string[];
    original: string;
}
export declare function compileTopicPattern(pattern: string): CompiledTemplate;
export declare function matchTopic(topic: string, compiled: CompiledTemplate): TemplateCapture | null;
export declare function renderTemplate(template: string, captures: TemplateCapture): string;
