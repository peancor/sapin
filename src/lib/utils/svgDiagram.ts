const XML_DECLARATION_PATTERN = /^<\?xml[\s\S]*?\?>\s*/i;
const LEADING_COMMENT_PATTERN = /^(?:<!--[\s\S]*?-->\s*)+/;
const SVG_ROOT_PATTERN = /^<svg\b[\s\S]*<\/svg>$/i;
const UNSAFE_SVG_RULES = [
	{
		pattern: /<script\b/i,
		message: 'El SVG no puede contener etiquetas <script>.'
	},
	{
		pattern: /<foreignObject\b/i,
		message: 'El SVG no puede contener foreignObject.'
	},
	{
		pattern: /\son[a-z-]+\s*=/i,
		message: 'El SVG no puede contener manejadores inline como onload u onclick.'
	},
	{
		pattern: /\s(?:href|xlink:href)\s*=/i,
		message: 'El SVG no puede contener atributos href o xlink:href.'
	},
	{
		pattern: /\bjavascript:/i,
		message: 'El SVG no puede contener URLs javascript:.'
	}
] as const;

export interface PreparedSvgDiagram {
	svg: string;
	notes: string[];
}

function normalizeSvgMarkup(svg: string): string {
	return svg.trim().replace(XML_DECLARATION_PATTERN, '').replace(LEADING_COMMENT_PATTERN, '').trim();
}

export function prepareSvgDiagram(svg: string): PreparedSvgDiagram {
	const normalized = normalizeSvgMarkup(svg);

	if (!normalized) {
		throw new Error('El SVG está vacío.');
	}

	if (!SVG_ROOT_PATTERN.test(normalized)) {
		throw new Error('La herramienta SVG requiere un único bloque <svg>...</svg>.');
	}

	for (const rule of UNSAFE_SVG_RULES) {
		if (rule.pattern.test(normalized)) {
			throw new Error(rule.message);
		}
	}

	const notes: string[] = [];
	if (!/\bviewBox\s*=/.test(normalized)) {
		notes.push('El SVG no declara viewBox; puede escalar peor en pantallas pequeñas.');
	}

	return {
		svg: normalized,
		notes
	};
}

export function buildSvgDataUri(svg: string): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
