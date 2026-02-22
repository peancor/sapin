/**
 * Document Processing Service
 * Handles parsing of PDF and DOCX files and splitting into chunks for RAG
 */

// DOCX parsing using docx library
import * as mammoth from 'mammoth';

/**
 * Chunk of text with metadata
 */
export interface DocumentChunk {
    id: string;
    content: string;
    metadata: {
        source: string;
        chunkIndex: number;
        totalChunks: number;
        pageNumber?: number;
        section?: string;
    };
}

/**
 * Parsed document result
 */
export interface ParsedDocument {
    text: string;
    chunks: DocumentChunk[];
    metadata: {
        filename: string;
        fileType: 'pdf' | 'docx' | 'txt';
        totalCharacters: number;
        totalChunks: number;
    };
}

type SupportedDocumentType = 'pdf' | 'docx' | 'txt';

function normalizeFileTypeHint(raw: string | null | undefined): SupportedDocumentType | null {
    if (!raw) return null;
    const value = raw.trim().toLowerCase();
    if (!value) return null;

    const withoutDot = value.startsWith('.') ? value.slice(1) : value;
    if (withoutDot === 'pdf' || withoutDot === 'application/pdf') return 'pdf';
    if (
        withoutDot === 'docx' ||
        withoutDot === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) return 'docx';
    if (withoutDot === 'txt' || withoutDot === 'text/plain' || withoutDot.startsWith('text/')) return 'txt';

    return null;
}

function detectTypeFromFilename(filename: string): SupportedDocumentType | null {
    const extension = filename.toLowerCase().split('.').pop();
    return normalizeFileTypeHint(extension ?? null);
}

function looksLikePdf(buffer: ArrayBuffer): boolean {
    const bytes = new Uint8Array(buffer);
    return bytes.length >= 4
        && bytes[0] === 0x25 // %
        && bytes[1] === 0x50 // P
        && bytes[2] === 0x44 // D
        && bytes[3] === 0x46; // F
}

/**
 * Parse a DOCX file and extract text
 */
export async function parseDocx(buffer: ArrayBuffer): Promise<string> {
    try {
        // Convert ArrayBuffer to Buffer for mammoth
        const nodeBuffer = Buffer.from(buffer);
        const result = await mammoth.extractRawText({ buffer: nodeBuffer });
        return result.value;
    } catch (error) {
        throw new Error(`Error parsing DOCX file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Parse a PDF file and extract text
 * Uses pdf-parse v2.x which exports PDFParse class
 */
export async function parsePdf(buffer: ArrayBuffer): Promise<string> {
    try {
        // pdf-parse v2.x uses PDFParse class
        const { PDFParse } = await import('pdf-parse');
        const pdfBuffer = Buffer.from(buffer);
        
        // Create parser with the PDF data
        const pdfParser = new PDFParse({ data: pdfBuffer, verbosity: 0 });
        const result = await pdfParser.getText();
        
        return result.text;
    } catch (error) {
        throw new Error(`Error parsing PDF file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Split text into chunks with overlap
 */
export function splitIntoChunks(
    text: string,
    filename: string,
    chunkSize: number = 1000,
    chunkOverlap: number = 200
): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];

    const safeChunkSize = Math.max(50, Math.floor(chunkSize));
    const safeChunkOverlap = Math.max(0, Math.min(Math.floor(chunkOverlap), safeChunkSize - 1));

    // Clean up text
    const cleanedText = text
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (cleanedText.length === 0) {
        return [];
    }

    function hardSplitUnit(unit: string): string[] {
        const parts: string[] = [];
        let start = 0;
        while (start < unit.length) {
            const end = Math.min(start + safeChunkSize, unit.length);
            const piece = unit.slice(start, end).trim();
            if (piece) parts.push(piece);
            if (end === unit.length) break;
            start = end;
        }
        return parts;
    }

    function splitParagraphIntoUnits(paragraph: string): string[] {
        const normalized = paragraph.replace(/\s+/g, ' ').trim();
        if (!normalized) return [];

        // Prefer sentence boundaries; fallback to hard split for long spans.
        const sentenceCandidates = normalized.split(/(?<=[.!?])\s+/);
        const units: string[] = [];
        for (const candidate of sentenceCandidates) {
            const trimmed = candidate.trim();
            if (!trimmed) continue;
            if (trimmed.length > safeChunkSize) {
                units.push(...hardSplitUnit(trimmed));
            } else {
                units.push(trimmed);
            }
        }
        return units;
    }

    function pushChunk(content: string) {
        chunks.push({
            id: `${filename}-chunk-${chunks.length}`,
            content: content.trim(),
            metadata: {
                source: filename,
                chunkIndex: chunks.length,
                totalChunks: 0
            }
        });
    }

    function computeOverlapSeed(content: string): string {
        if (safeChunkOverlap <= 0 || content.length <= safeChunkOverlap) return '';
        const tail = content.slice(-safeChunkOverlap);
        const firstSpace = tail.indexOf(' ');
        if (firstSpace <= 0) return tail;
        return tail.slice(firstSpace + 1).trim();
    }

    const paragraphs = cleanedText.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    let currentChunk = '';

    for (const paragraph of paragraphs) {
        const units = splitParagraphIntoUnits(paragraph);
        for (const unit of units) {
            const candidate = currentChunk ? `${currentChunk} ${unit}` : unit;
            if (candidate.length <= safeChunkSize) {
                currentChunk = candidate;
                continue;
            }

            if (currentChunk) {
                pushChunk(currentChunk);
                const overlapSeed = computeOverlapSeed(currentChunk);
                currentChunk = overlapSeed ? `${overlapSeed} ${unit}` : unit;
            } else {
                // Defensive fallback; should be handled by splitParagraphIntoUnits
                const hardParts = hardSplitUnit(unit);
                for (let i = 0; i < hardParts.length - 1; i += 1) {
                    pushChunk(hardParts[i]);
                }
                currentChunk = hardParts[hardParts.length - 1] ?? '';
            }

            while (currentChunk.length > safeChunkSize) {
                const hardParts = hardSplitUnit(currentChunk);
                if (hardParts.length === 0) break;
                pushChunk(hardParts[0]);
                const rest = hardParts.slice(1).join(' ');
                currentChunk = rest;
            }
        }
    }

    if (currentChunk.trim()) {
        pushChunk(currentChunk);
    }

    // Update totalChunks in all metadata
    const totalChunks = chunks.length;
    for (const chunk of chunks) {
        chunk.metadata.totalChunks = totalChunks;
    }

    return chunks;
}

/**
 * Process a document file (PDF, DOCX, or TXT)
 */
export async function processDocument(
    buffer: ArrayBuffer,
    filename: string,
    options: {
        chunkSize?: number;
        chunkOverlap?: number;
        fileTypeHint?: string | null;
        mimeType?: string | null;
    } = {}
): Promise<ParsedDocument> {
    const { chunkSize = 1000, chunkOverlap = 200, fileTypeHint, mimeType } = options;

    const resolvedFileType = normalizeFileTypeHint(fileTypeHint)
        ?? normalizeFileTypeHint(mimeType)
        ?? detectTypeFromFilename(filename)
        ?? (looksLikePdf(buffer) ? 'pdf' : null);

    let text: string;
    let fileType: SupportedDocumentType;

    switch (resolvedFileType) {
        case 'pdf':
            text = await parsePdf(buffer);
            fileType = 'pdf';
            break;
        case 'docx':
            text = await parseDocx(buffer);
            fileType = 'docx';
            break;
        case 'txt':
            text = new TextDecoder().decode(buffer);
            fileType = 'txt';
            break;
        default:
            throw new Error(`Unsupported file type for "${filename}" (hint: ${fileTypeHint || 'n/a'}, mime: ${mimeType || 'n/a'})`);
    }
    
    // Split into chunks
    const chunks = splitIntoChunks(text, filename, chunkSize, chunkOverlap);
    
    return {
        text,
        chunks,
        metadata: {
            filename,
            fileType,
            totalCharacters: text.length,
            totalChunks: chunks.length
        }
    };
}

/**
 * Simple text splitter for direct text input
 */
export function processText(
    text: string,
    sourceName: string = 'direct-input',
    options: {
        chunkSize?: number;
        chunkOverlap?: number;
    } = {}
): ParsedDocument {
    const { chunkSize = 1000, chunkOverlap = 200 } = options;
    
    const chunks = splitIntoChunks(text, sourceName, chunkSize, chunkOverlap);
    
    return {
        text,
        chunks,
        metadata: {
            filename: sourceName,
            fileType: 'txt',
            totalCharacters: text.length,
            totalChunks: chunks.length
        }
    };
}
