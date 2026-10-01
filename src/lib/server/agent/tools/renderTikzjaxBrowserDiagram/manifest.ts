import { tikzBrowserSupportedPackages } from '$lib/constants/tikzExamples';
import { BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT } from '../constants';
import type { ToolManifest } from '../types';

const supportedPackagesDescription = tikzBrowserSupportedPackages.join(', ');
const voltageSourceGuidance =
	'En circuitikz, cuando dibujes fuentes de voltaje como to[V], to[sV] o to[battery1], usa siempre el parametro invert para mantener la orientacion esperada del simbolo. No generes fuentes de voltaje sin invert. Ejemplo correcto: \\draw (0,0) to[V, v=$V_{fuente}$, invert] (0,2);';
const sourceAuthoringGuidance = `Guia de autoria para source: 1) Si el contenido es circuitikz, incluye \\usepackage{circuitikz} o un documento completo equivalente. 2) Si dibujas una fuente de voltaje, aplica siempre invert en V, sV y battery1. 3) Prioriza codigo directo, pequeno y autocontenido, evitando macros complejas o paquetes fuera de ${supportedPackagesDescription}. 4) Si necesitas librerias TikZ adicionales, declaralas explicitamente con \\usetikzlibrary o en tikzLibraries. 5) Si usas un documento completo, cierra siempre \\begin{document} y \\end{document}.`;

export const renderTikzjaxBrowserDiagramManifest: ToolManifest = {
	name: 'render_tikzjax_browser_diagram',
	displayName: 'Mostrar Diagrama TikZJax',
	description: `Renderiza un diagrama TikZ o TeX con TikZJax en el navegador. Acepta documento completo, preámbulo inicial o un bloque TikZ directo. Prioriza TikZ puro o paquetes soportados en navegador (${supportedPackagesDescription}). ${voltageSourceGuidance} ${sourceAuthoringGuidance} Si detecta paquetes no soportados o comandos incompatibles, la herramienta fallará antes de renderizar.`,
	category: 'ui',
	parametersSchema: {
		type: 'object',
		properties: {
			source: {
				type: 'string',
				minLength: 1,
				maxLength: 50000,
				description:
					`Fuente TikZ o TeX. Puede incluir \\begin{document}, \\usepackage y \\usetikzlibrary. ${voltageSourceGuidance} ${sourceAuthoringGuidance}`
			},
			title: {
				type: 'string',
				description: 'Título opcional visible sobre el diagrama.'
			},
			caption: {
				type: 'string',
				description: 'Texto breve opcional para explicar el diagrama o su objetivo didáctico.'
			},
			ariaLabel: {
				type: 'string',
				description: 'Etiqueta accesible opcional para lectores de pantalla.'
			},
			texPackages: {
				type: 'array',
				description:
					`Lista opcional de paquetes TeX extra. Solo se admiten paquetes soportados por el runtime browser: ${supportedPackagesDescription}. No la uses para paquetes no soportados ni como sustituto de \\usepackage{circuitikz} si el snippet depende de circuitikz.`,
				items: {
					type: 'string'
				}
			},
			tikzLibraries: {
				type: 'array',
				description:
					'Lista opcional de librerías TikZ extra, por ejemplo arrows.meta o calc. Declara aqui cualquier libreria necesaria en vez de asumir que ya esta cargada.',
				items: {
					type: 'string'
				}
			},
			addToPreamble: {
				type: 'string',
				description:
					'Fragmento opcional de preámbulo adicional para estilos, colores o macros simples compatibles con navegador. Evita redefiniciones complejas, comandos fragiles y dependencias externas.'
			}
		},
		required: ['source']
	},
	responseSchema: {
		type: 'object',
		properties: {
			rendered: { type: 'boolean' },
			componentKey: { type: 'string' }
		},
		required: ['rendered', 'componentKey']
	},
	executorType: 'builtin',
	executorConfig: {
		handler: 'ui_renderer',
		componentKey: 'TikzjaxDiagramCard',
		interactive: false
	},
	requiresConfirmation: false,
	riskLevel: 'low',
	isSystem: true,
	version: '1.0.0',
	usageDomain: BUILTIN_TOOL_USAGE_DOMAIN_AGENT_CHAT
};
