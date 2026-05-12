import type { PageServerLoad } from './$types';

const errorMessages: Record<string, string> = {
	'teacher-link-required':
		'Tu usuario de Moodle todavía no está vinculado a una cuenta Sapin. Inicia sesión en Sapin en esta misma ventana y vuelve a abrir el enlace desde Moodle.',
	'teacher-course-permission':
		'Tu cuenta Sapin no tiene permisos docentes en el curso asociado a este enlace LTI.',
	default: 'No se pudo completar el lanzamiento LTI.'
};

export const load: PageServerLoad = ({ url }) => {
	const reason = url.searchParams.get('reason') ?? 'default';
	return {
		message: errorMessages[reason] ?? errorMessages.default
	};
};
