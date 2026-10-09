import DOMPurify from 'isomorphic-dompurify';

/** Sanitize the final HTML, after Markdown/KaTeX rendering, on server and client. */
export function sanitizeHtml(html: string): string {
	return DOMPurify.sanitize(html, {
		FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select']
	});
}
