import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType } from 'docx';
import { marked } from 'marked';

// Define specific token types for better type checking
type HeadingToken = {
    type: 'heading';
    depth: number;
    text: string;
    tokens?: any[];
    raw: string;
};

type ParagraphToken = {
    type: 'paragraph';
    text?: string;
    tokens?: any[];
    raw: string;
};

type ListToken = {
    type: 'list';
    ordered: boolean;
    start: number | '';
    items: ListItemToken[];
    raw: string;
};

type ListItemToken = {
    type: 'list_item';
    text?: string;
    tokens?: any[];
    raw: string;
};

type CodeToken = {
    type: 'code';
    text: string;
    lang?: string;
    raw: string;
};

type BlockquoteToken = {
    type: 'blockquote';
    tokens: any[];
    raw: string;
};

// Table token structure in marked v4+
// header and rows contain TableCell objects with text and tokens
type TableCellContent = {
    text: string;
    tokens?: any[];
};

type TableToken = {
    type: 'table';
    header: TableCellContent[];
    align: Array<'center' | 'left' | 'right' | null>;
    rows: TableCellContent[][];
    // Legacy property (marked v3 and earlier)
    cells?: string[][];
    raw: string;
};

type TextToken = {
    type: 'text';
    text: string;
    raw: string;
};

type StrongToken = {
    type: 'strong';
    text: string;
    tokens?: any[];
    raw: string;
};

type EmToken = {
    type: 'em';
    text: string;
    tokens?: any[];
    raw: string;
};

type Token = 
    | HeadingToken
    | ParagraphToken
    | ListToken
    | ListItemToken
    | CodeToken
    | BlockquoteToken
    | TableToken
    | TextToken
    | StrongToken
    | EmToken
    | { type: string; raw: string; [key: string]: any };

type TokensList = Token[];

/**
 * Preprocess markdown content to normalize formatting before parsing
 * This fixes common issues that cause marked to not parse correctly
 */
function preprocessMarkdown(content: string): string {
    let processed = content;

    // Normalize line endings
    processed = processed.replace(/\r\n/g, '\n');

    // Fix bold markers that have spaces inside: ** text ** -> **text**
    processed = processed.replace(/\*\*\s+([^*]+?)\s+\*\*/g, '**$1**');

    // Fix italic markers that have spaces inside: * text * -> *text*
    processed = processed.replace(/(?<!\*)\*\s+([^*]+?)\s+\*(?!\*)/g, '*$1*');

    // Fix unclosed bold at end of line - close them
    processed = processed.replace(/\*\*([^*\n]+)$/gm, (match, innerContent) => {
        // Only fix if there's content and no closing
        if (innerContent && !innerContent.includes('**')) {
            return `**${innerContent}**`;
        }
        return match;
    });

    // Fix tables: ensure table rows have proper formatting
    // Sometimes LLM generates tables with inconsistent pipes
    const lines = processed.split('\n');
    const fixedLines: string[] = [];
    let inTable = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Detect table separator line (|---|---|)
        if (/^\|?[-:|\s]+\|?$/.test(trimmed) && trimmed.includes('|')) {
            inTable = true;
            // Ensure separator line is properly formatted
            const cells = trimmed.split('|').filter(c => c.trim());
            if (cells.length > 0) {
                const formattedSep = '| ' + cells.map(c => '---').join(' | ') + ' |';
                fixedLines.push(formattedSep);
                continue;
            }
        }

        // If we're in a table, check if this line is a table row
        if (inTable) {
            if (trimmed.startsWith('|') || (fixedLines.length > 0 && /^\|/.test(fixedLines[fixedLines.length - 1]))) {
                // Check if this line looks like a table row
                if (trimmed.includes('|')) {
                    // Ensure proper pipe formatting
                    let cleanRow = trimmed;
                    if (!cleanRow.startsWith('|')) cleanRow = '| ' + cleanRow;
                    if (!cleanRow.endsWith('|')) cleanRow = cleanRow + ' |';
                    fixedLines.push(cleanRow);
                    continue;
                } else if (trimmed === '') {
                    // Empty line ends table
                    inTable = false;
                }
            } else {
                inTable = false;
            }
        }

        fixedLines.push(line);
    }

    processed = fixedLines.join('\n');

    // Ensure proper paragraph spacing (double newline between paragraphs)
    processed = processed.replace(/\n{3,}/g, '\n\n');

    return processed;
}

/**
 * Creates a DOCX document from Markdown content string
 * This is the preferred entry point as it includes preprocessing
 */
export async function createDocxFromContent(title: string, date: string, content: string): Promise<Blob> {
    // Preprocess the markdown
    const preprocessedContent = preprocessMarkdown(content);

    // Parse with marked
    const tokens = marked.lexer(preprocessedContent);

    return createDocxFromMarkdown(title, date, tokens);
}

/**
 * Creates a DOCX document from Markdown tokens
 */
export async function createDocxFromMarkdown(title: string, date: string, tokens: TokensList): Promise<Blob> {
    // Create document with title and date
    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    text: cleanMarkdownSyntax(title),
                    heading: HeadingLevel.TITLE,
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 },
                }),
                new Paragraph({
                    text: `Generado el ${date}`,
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 400 },
                }),
                ...processTokens(tokens),
            ],
        }],
    });

    // Generate DOCX blob
    return await Packer.toBlob(doc);
}

/**
 * Process Markdown tokens into DOCX paragraphs
 */
function processTokens(tokens: TokensList): (Paragraph | Table)[] {
    const elements: (Paragraph | Table)[] = [];
    
    for (const token of tokens) {
        switch (token.type) {
            case 'heading':
                elements.push(createHeading(token as HeadingToken));
                break;
            
            case 'paragraph':
                elements.push(processParagraph(token as ParagraphToken));
                break;
            
            case 'list':
                elements.push(...createList(token as ListToken));
                break;
            
            case 'blockquote':
                elements.push(...createBlockquote(token as BlockquoteToken));
                break;
            
            case 'hr':
                elements.push(createHorizontalRule());
                break;
            
            case 'table':
                elements.push(createTable(token as TableToken));
                break;
            
            case 'space':
                elements.push(new Paragraph({ text: '' }));
                break;
            
            case 'code':
                elements.push(createCodeBlock(token as CodeToken));
                break;
            
            default:
                // For any other token type, try to create a paragraph
                try {
                    if ('text' in token && token.text) {
                        elements.push(new Paragraph({ text: cleanMarkdownSyntax(token.text) }));
                    } else if ('raw' in token && token.raw) {
                        elements.push(new Paragraph({ text: cleanMarkdownSyntax(token.raw) }));
                    } else if ('tokens' in token && Array.isArray(token.tokens)) {
                        // If the token has nested tokens, process them
                        const runs: TextRun[] = [];
                        processInlineTokens(token.tokens, runs);
                        elements.push(new Paragraph({ children: runs }));
                    }
                } catch (error) {
                    console.error('Error processing token:', error);
                    elements.push(new Paragraph({ text: '[Error al procesar contenido]' }));
                }
        }
    }
    
    return elements;
}

/**
 * Extract raw text from a token, regardless of its type
 */
function getTokenText(token: any): string {
    if (!token) return '';
    
    // If token has a text property, use it
    if (token.text) return token.text;
    
    // If token has raw property, use it
    if (token.raw) return token.raw;
    
    // If token has tokens array, recursively get text from all tokens
    if (token.tokens && Array.isArray(token.tokens)) {
        return token.tokens.map((t: any) => getTokenText(t)).join('');
    }
    
    // Default to empty string
    return '';
}

/**
 * Process a paragraph token
 */
function processParagraph(token: ParagraphToken): Paragraph {
    const runs: TextRun[] = [];
    
    // Process inline tokens if available
    if (token.tokens && token.tokens.length > 0) {
        processInlineTokens(token.tokens, runs);
    } else if (token.text) {
        // If no tokens but has text, create a simple text run
        runs.push(new TextRun({
            text: cleanMarkdownSyntax(token.text),
        }));
    }
    
    // Create paragraph with the collected runs
    return new Paragraph({
        children: runs.length > 0 ? runs : [new TextRun({ text: '' })],
        spacing: {
            before: 120,
            after: 120,
        },
    });
}

/**
 * Process inline tokens for text formatting
 */
function processInlineTokens(tokens: any[], runs: TextRun[], options: { bold?: boolean; italics?: boolean } = {}) {
    if (!tokens || !Array.isArray(tokens)) return;

    for (const token of tokens) {
        if (!token) continue;

        switch (token.type) {
            case 'text':
                // Ensure we clean any markdown syntax that might be in the text
                const cleanedText = cleanMarkdownSyntax(token.text || '');
                if (cleanedText) {
                    runs.push(new TextRun({
                        text: cleanedText,
                        bold: options.bold,
                        italics: options.italics,
                    }));
                }
                break;

            case 'strong':
                // Handle bold text - merge bold state with any inherited formatting
                if (token.tokens && token.tokens.length > 0) {
                    processInlineTokens(token.tokens, runs, { ...options, bold: true });
                } else if (token.text) {
                    runs.push(new TextRun({
                        text: cleanMarkdownSyntax(token.text),
                        bold: true,
                        italics: options.italics,
                    }));
                }
                break;

            case 'em':
                // Handle italic text - merge italic state with any inherited formatting
                if (token.tokens && token.tokens.length > 0) {
                    processInlineTokens(token.tokens, runs, { ...options, italics: true });
                } else if (token.text) {
                    runs.push(new TextRun({
                        text: cleanMarkdownSyntax(token.text),
                        bold: options.bold,
                        italics: true,
                    }));
                }
                break;

            case 'codespan':
                runs.push(new TextRun({
                    text: token.text || '',
                    font: "Courier New",
                    color: "666666",
                    bold: options.bold,
                    italics: options.italics,
                }));
                break;

            case 'link':
                // Process link text recursively if it has tokens
                if (token.tokens && token.tokens.length > 0) {
                    processInlineTokens(token.tokens, runs, { ...options });
                } else {
                    runs.push(new TextRun({
                        text: token.text || token.href || '',
                        color: "0000FF",
                        underline: {},
                        bold: options.bold,
                        italics: options.italics,
                    }));
                }
                break;

            case 'image':
                runs.push(new TextRun({
                    text: `[Imagen: ${token.alt || token.text || 'Sin descripción'}]`,
                    italics: true,
                }));
                break;

            case 'br':
            case 'softbreak':
            case 'hardbreak':
                // Line breaks
                runs.push(new TextRun({
                    text: '',
                    break: 1,
                }));
                break;

            case 'escape':
                // Escaped character
                runs.push(new TextRun({
                    text: token.text || '',
                    bold: options.bold,
                    italics: options.italics,
                }));
                break;

            case 'del':
                // Strikethrough
                if (token.tokens && token.tokens.length > 0) {
                    // Process with strikethrough - note: docx library uses 'strike' not 'strikethrough'
                    for (const subToken of token.tokens) {
                        const text = getTokenText(subToken);
                        if (text) {
                            runs.push(new TextRun({
                                text: cleanMarkdownSyntax(text),
                                strike: true,
                                bold: options.bold,
                                italics: options.italics,
                            }));
                        }
                    }
                } else if (token.text) {
                    runs.push(new TextRun({
                        text: cleanMarkdownSyntax(token.text),
                        strike: true,
                        bold: options.bold,
                        italics: options.italics,
                    }));
                }
                break;

            default:
                if ('tokens' in token && Array.isArray(token.tokens)) {
                    // Process nested tokens maintaining current formatting
                    processInlineTokens(token.tokens, runs, options);
                } else {
                    // Extract text from the token and add it
                    const tokenText = getTokenText(token);
                    if (tokenText) {
                        runs.push(new TextRun({
                            text: cleanMarkdownSyntax(tokenText),
                            bold: options.bold,
                            italics: options.italics,
                        }));
                    }
                }
        }
    }
}

/**
 * Process tokens inside a strong (bold) context
 * @deprecated Use processInlineTokens with options.bold = true instead
 */
function processStrongTokens(tokens: any[], runs: TextRun[]) {
    processInlineTokens(tokens, runs, { bold: true });
}

/**
 * Process tokens inside an em (italic) context
 * @deprecated Use processInlineTokens with options.italics = true instead
 */
function processEmTokens(tokens: any[], runs: TextRun[]) {
    processInlineTokens(tokens, runs, { italics: true });
}

/**
 * Create a heading paragraph
 */
function createHeading(token: HeadingToken): Paragraph {
    // Map Markdown heading levels to DOCX heading levels
    let headingLevel;
    switch (token.depth) {
        case 1: headingLevel = HeadingLevel.HEADING_1; break;
        case 2: headingLevel = HeadingLevel.HEADING_2; break;
        case 3: headingLevel = HeadingLevel.HEADING_3; break;
        case 4: headingLevel = HeadingLevel.HEADING_4; break;
        case 5: headingLevel = HeadingLevel.HEADING_5; break;
        case 6: headingLevel = HeadingLevel.HEADING_6; break;
        default: headingLevel = undefined;
    }

    // Process heading tokens if available (for inline formatting in headings)
    if (token.tokens && token.tokens.length > 0) {
        const runs: TextRun[] = [];
        processInlineTokens(token.tokens, runs);

        return new Paragraph({
            children: runs,
            heading: headingLevel,
            spacing: {
                before: 240,
                after: 120,
            },
        });
    }

    return new Paragraph({
        text: cleanMarkdownSyntax(token.text || ''),
        heading: headingLevel,
        spacing: {
            before: 240,
            after: 120,
        },
    });
}

/**
 * Create list items
 */
function createList(token: ListToken): Paragraph[] {
    const elements: Paragraph[] = [];
    
    for (let i = 0; i < token.items.length; i++) {
        const item = token.items[i];
        const prefix = token.ordered ? `${i + 1}. ` : '• ';
        
        // Process item text with formatting
        const runs: TextRun[] = [];
        
        if (item.tokens) {
            // First collect all text while preserving formatting
            processListItemTokens(item.tokens, runs, prefix);
        } else {
            runs.push(new TextRun({
                text: prefix + cleanMarkdownSyntax(item.text || ''),
            }));
        }
        
        elements.push(new Paragraph({
            children: runs,
            indent: {
                left: 720, // 0.5 inches = 720 twips
            },
            spacing: {
                after: 60,
            },
        }));
    }
    
    return elements;
}

/**
 * Process tokens in a list item
 */
function processListItemTokens(tokens: any[], runs: TextRun[], prefix: string = '') {
    // Add prefix as first element
    if (prefix) {
        runs.push(new TextRun({ text: prefix }));
    }

    for (const token of tokens) {
        if (!token) continue;

        switch (token.type) {
            case 'text':
                const cleanText = cleanMarkdownSyntax(token.text || '');
                if (cleanText) {
                    runs.push(new TextRun({ text: cleanText }));
                }
                break;

            case 'strong':
                if (token.tokens && token.tokens.length > 0) {
                    processInlineTokens(token.tokens, runs, { bold: true });
                } else if (token.text) {
                    runs.push(new TextRun({
                        text: cleanMarkdownSyntax(token.text),
                        bold: true,
                    }));
                }
                break;

            case 'em':
                if (token.tokens && token.tokens.length > 0) {
                    processInlineTokens(token.tokens, runs, { italics: true });
                } else if (token.text) {
                    runs.push(new TextRun({
                        text: cleanMarkdownSyntax(token.text),
                        italics: true,
                    }));
                }
                break;

            case 'paragraph':
                // For paragraphs within lists, process their content
                if (token.tokens && token.tokens.length > 0) {
                    processInlineTokens(token.tokens, runs);
                }
                break;

            default:
                if ('tokens' in token && Array.isArray(token.tokens)) {
                    processInlineTokens(token.tokens, runs);
                } else {
                    const tokenText = getTokenText(token);
                    if (tokenText) {
                        runs.push(new TextRun({
                            text: cleanMarkdownSyntax(tokenText),
                        }));
                    }
                }
        }
    }
}

/**
 * Create a code block
 */
function createCodeBlock(token: CodeToken): Paragraph {
    return new Paragraph({
        children: [
            new TextRun({
                text: token.text,
                font: "Courier New",
                size: 20, // 10pt
            })
        ],
        border: {
            top: { color: "auto", space: 1, style: BorderStyle.SINGLE, size: 1 },
            bottom: { color: "auto", space: 1, style: BorderStyle.SINGLE, size: 1 },
            left: { color: "auto", space: 1, style: BorderStyle.SINGLE, size: 1 },
            right: { color: "auto", space: 1, style: BorderStyle.SINGLE, size: 1 },
        },
        shading: {
            type: "clear",
            fill: "F5F5F5",
        },
        indent: {
            left: 720,
        },
        spacing: {
            before: 120,
            after: 120,
        },
    });
}

/**
 * Create a blockquote
 */
function createBlockquote(token: BlockquoteToken): Paragraph[] {
    if (!token.tokens || token.tokens.length === 0) {
        return [new Paragraph({
            text: '',
            spacing: { after: 120 },
        })];
    }
    
    const elements: Paragraph[] = [];
    const runs: TextRun[] = [];
    processBlockquoteTokens(token.tokens, runs);
    
    elements.push(new Paragraph({
        children: runs,
        indent: {
            left: 720,
        },
        border: {
            left: {
                color: "#CCCCCC",
                space: 10,
                style: BorderStyle.SINGLE,
                size: 10,
            },
        },
        spacing: {
            before: 120,
            after: 120,
        },
    }));
    
    return elements;
}

/**
 * Process tokens in a blockquote
 */
function processBlockquoteTokens(tokens: any[], runs: TextRun[]) {
    for (const token of tokens) {
        if (!token) continue;

        if (token.type === 'paragraph' && 'tokens' in token) {
            // Process paragraph content within blockquote (all text inherits italic)
            processInlineTokens(token.tokens, runs, { italics: true });
            // Add line break after paragraph in blockquote
            runs.push(new TextRun({ text: '', break: 1 }));
        } else if (token.type === 'text') {
            runs.push(new TextRun({
                text: cleanMarkdownSyntax(token.text || ''),
                italics: true,
            }));
        } else if (token.type === 'strong') {
            if (token.tokens && token.tokens.length > 0) {
                processInlineTokens(token.tokens, runs, { bold: true, italics: true });
            } else if (token.text) {
                runs.push(new TextRun({
                    text: cleanMarkdownSyntax(token.text),
                    bold: true,
                    italics: true,
                }));
            }
        } else if (token.type === 'em') {
            if (token.tokens && token.tokens.length > 0) {
                processInlineTokens(token.tokens, runs, { italics: true });
            } else if (token.text) {
                runs.push(new TextRun({
                    text: cleanMarkdownSyntax(token.text),
                    italics: true,
                }));
            }
        } else if ('tokens' in token && Array.isArray(token.tokens)) {
            processBlockquoteTokens(token.tokens, runs);
        } else {
            const tokenText = getTokenText(token);
            if (tokenText) {
                runs.push(new TextRun({
                    text: cleanMarkdownSyntax(tokenText),
                    italics: true,
                }));
            }
        }
    }
}

/**
 * Create a horizontal rule as a subtle divider line
 */
function createHorizontalRule(): Paragraph {
    return new Paragraph({
        children: [],
        border: {
            bottom: {
                color: "CCCCCC",
                space: 1,
                style: BorderStyle.SINGLE,
                size: 6,
            },
        },
        spacing: {
            before: 200,
            after: 200,
        },
    });
}

/**
 * Create a paragraph from cell content, handling markdown formatting
 * Handles multiple input formats:
 * - string: raw text (legacy marked or simple content)
 * - { text, tokens }: marked v4+ table cell format
 */
function createTableCellParagraph(cellContent: string | { tokens?: any[]; text?: string } | null | undefined, isBold: boolean = false): Paragraph {
    const runs: TextRun[] = [];

    if (!cellContent) {
        runs.push(new TextRun({ text: '', bold: isBold }));
        return new Paragraph({ children: runs });
    }

    if (typeof cellContent === 'string') {
        // Simple string - clean and add
        const cleanedText = cleanMarkdownSyntax(cellContent);
        if (cleanedText) {
            runs.push(new TextRun({
                text: cleanedText,
                bold: isBold,
            }));
        }
    } else if (cellContent.tokens && cellContent.tokens.length > 0) {
        // marked v4+ format with parsed tokens - process them for formatting
        processInlineTokens(cellContent.tokens, runs, { bold: isBold });
    } else if (cellContent.text) {
        // Has text but no tokens - clean and add
        const cleanedText = cleanMarkdownSyntax(cellContent.text);
        if (cleanedText) {
            runs.push(new TextRun({
                text: cleanedText,
                bold: isBold,
            }));
        }
    }

    // Ensure we have at least an empty run
    if (runs.length === 0) {
        runs.push(new TextRun({ text: '', bold: isBold }));
    }

    return new Paragraph({ children: runs });
}

/**
 * Create a table
 */
function createTable(token: TableToken): Paragraph | Table {
    // Debug: log table structure to help diagnose issues
    if (typeof window !== 'undefined' && (window as any).__DOCX_DEBUG__) {
        console.log('Table token structure:', JSON.stringify(token, null, 2));
    }

    // Get rows - marked v4+ uses 'rows', older versions use 'cells'
    const dataRows = token.rows || token.cells || [];

    // Validate header exists
    if (!token.header || !Array.isArray(token.header) || token.header.length === 0) {
        console.warn('Table has no valid header:', token);
        return new Paragraph({
            children: [
                new TextRun({
                    text: "[Tabla sin encabezado]",
                    italics: true,
                })
            ],
            spacing: {
                before: 120,
                after: 120,
            },
        });
    }

    try {
        // Create table rows for header
        const headerCells = token.header.map((cell: any) => {
            return new TableCell({
                children: [createTableCellParagraph(cell, true)],
                shading: {
                    fill: "F2F2F2",
                },
            });
        });

        const headerRow = new TableRow({
            tableHeader: true,
            children: headerCells,
        });

        // Create table rows for data
        const rows: TableRow[] = [];

        for (const row of dataRows) {
            if (!Array.isArray(row)) {
                console.warn('Invalid table row:', row);
                continue;
            }

            // Ensure each row has the same number of cells as header
            const rowCells: TableCell[] = [];
            for (let i = 0; i < token.header.length; i++) {
                const cell = row[i];
                rowCells.push(new TableCell({
                    children: [createTableCellParagraph(cell, false)],
                }));
            }

            rows.push(new TableRow({ children: rowCells }));
        }

        // Create and return the table
        return new Table({
            width: {
                size: 100,
                type: WidthType.PERCENTAGE,
            },
            rows: [headerRow, ...rows],
            margins: {
                top: 100,
                bottom: 100,
                left: 100,
                right: 100,
            },
        });
    } catch (error) {
        console.error("Error creating table:", error, "Token:", token);
        return new Paragraph({
            children: [
                new TextRun({
                    text: "[Error al procesar tabla]",
                    italics: true,
                })
            ],
            spacing: {
                before: 120,
                after: 120,
            },
        });
    }
}

/**
 * Clean Markdown syntax from text - robust version
 * Handles edge cases like unclosed markers, nested syntax, and various markdown patterns
 * IMPORTANT: Preserves leading/trailing spaces as they may be significant for inline formatting
 */
function cleanMarkdownSyntax(text: string): string {
    if (!text) return '';

    let cleanedText = text;

    // First, handle complete pairs (matched opening and closing)
    // Bold: **text** or __text__
    cleanedText = cleanedText.replace(/\*\*([^*]+)\*\*/g, '$1');
    cleanedText = cleanedText.replace(/__([^_]+)__/g, '$1');

    // Italic: *text* or _text_ (single markers)
    // Be careful not to match ** or __ which should have been processed above
    cleanedText = cleanedText.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');
    cleanedText = cleanedText.replace(/(?<!_)_([^_]+)_(?!_)/g, '$1');

    // Bold + Italic: ***text*** or ___text___
    cleanedText = cleanedText.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
    cleanedText = cleanedText.replace(/___([^_]+)___/g, '$1');

    // Strikethrough: ~~text~~
    cleanedText = cleanedText.replace(/~~([^~]+)~~/g, '$1');

    // Remove Markdown link syntax: [text](url)
    cleanedText = cleanedText.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

    // Remove reference-style links: [text][ref]
    cleanedText = cleanedText.replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1');

    // Remove inline code: `code`
    cleanedText = cleanedText.replace(/`([^`]*)`/g, '$1');

    // Remove HTML tags
    cleanedText = cleanedText.replace(/<[^>]*>/g, '');

    // Second pass: remove any remaining orphan markers
    // Remove double asterisks that weren't matched
    cleanedText = cleanedText.replace(/\*\*/g, '');

    // Remove double underscores that weren't matched
    cleanedText = cleanedText.replace(/__/g, '');

    // Remove tildes from incomplete strikethrough
    cleanedText = cleanedText.replace(/~~/g, '');

    // Remove orphan single asterisks (only at word boundaries, preserving spaces)
    // Match asterisk preceded by space and followed by non-space: " *word" -> " word"
    cleanedText = cleanedText.replace(/(\s)\*(\S)/g, '$1$2');
    // Match asterisk preceded by non-space and followed by space: "word* " -> "word "
    cleanedText = cleanedText.replace(/(\S)\*(\s)/g, '$1$2');
    // Match asterisk at start followed by non-space
    cleanedText = cleanedText.replace(/^\*(\S)/g, '$1');
    // Match asterisk at end preceded by non-space
    cleanedText = cleanedText.replace(/(\S)\*$/g, '$1');

    // Same for underscores
    cleanedText = cleanedText.replace(/(\s)_(\S)/g, '$1$2');
    cleanedText = cleanedText.replace(/(\S)_(\s)/g, '$1$2');
    cleanedText = cleanedText.replace(/^_(\S)/g, '$1');
    cleanedText = cleanedText.replace(/(\S)_$/g, '$1');

    // Clean up multiple consecutive spaces (but preserve single spaces)
    cleanedText = cleanedText.replace(/  +/g, ' ');

    // DO NOT trim - preserve leading/trailing spaces for inline token concatenation

    return cleanedText;
}
