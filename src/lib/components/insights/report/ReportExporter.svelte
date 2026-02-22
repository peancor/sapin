<script lang="ts">
    import { createDocxFromContent } from '$lib/utils/docx-export';
    import fileSaver from 'file-saver';

    const { saveAs } = fileSaver;

    interface Props {
        content: string;
        activityName: string;
        generatedAt: string | null;
    }

    let { content, activityName, generatedAt }: Props = $props();

    let isExportingDocx = $state(false);
    let isExportingMd = $state(false);

    /**
     * Extract title from markdown content
     */
    function extractTitle(markdownContent: string): string {
        // Try to find first heading
        const headingMatch = markdownContent.match(/^#\s+(.+)$/m);
        if (headingMatch) {
            // Clean the title of any markdown syntax
            return headingMatch[1].replace(/\*\*/g, '').replace(/__/g, '').trim();
        }

        // Fallback to activity name or default
        if (activityName) {
            return `Informe de Insights: ${activityName}`;
        }

        return 'Informe de Insights';
    }

    export async function exportToDocx() {
        if (isExportingDocx || !content) return;

        isExportingDocx = true;
        try {
            const title = extractTitle(content);
            const dateStr = generatedAt || new Date().toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            // Use the new function that includes preprocessing
            const blob = await createDocxFromContent(title, dateStr, content);

            // Sanitize filename
            const safeActivityName = activityName
                ? activityName.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_')
                : 'report';

            const filename = `insights_${safeActivityName}.docx`;

            saveAs(blob, filename);
        } catch (error) {
            console.error('Error exporting to DOCX:', error);
            throw error;
        } finally {
            isExportingDocx = false;
        }
    }

    export async function exportToMarkdown() {
        if (isExportingMd || !content) return;

        isExportingMd = true;
        try {
            const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });

            const filename = activityName
                ? `insights_${activityName.replace(/\s+/g, '_')}.md`
                : `insights_report.md`;

            saveAs(blob, filename);
        } catch (error) {
            console.error('Error exporting to Markdown:', error);
            throw error;
        } finally {
            isExportingMd = false;
        }
    }

    export function getExportState() {
        return {
            isExportingDocx,
            isExportingMd
        };
    }
</script>
