import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parse } from 'csv-parse/sync';
import { DBUserUtils, CourseRoleUtils } from '$lib/server/db';

interface CsvRecord {
	id: string;
	email: string;
	firstname: string;
	lastname: string;
	fullname: string;
}

/**
 * Detecta si el contenido parece ser UTF-8 válido.
 * Retorna true si se puede decodificar como UTF-8 sin errores.
 */
function isValidUtf8(bytes: Uint8Array): boolean {
	try {
		const decoder = new TextDecoder('utf-8', { fatal: true });
		decoder.decode(bytes);
		return true;
	} catch {
		return false;
	}
}

/**
 * Sanitiza el contenido de un CSV para asegurar codificación UTF-8 correcta.
 * - Elimina BOM (Byte Order Mark) de UTF-8, UTF-16 LE/BE
 * - Detecta automáticamente Windows-1252 y convierte a UTF-8
 * - Normaliza caracteres Unicode (NFC)
 * - Elimina caracteres de control excepto newlines y tabs
 */
function sanitizeCsvContent(buffer: ArrayBuffer): string {
	let bytes = new Uint8Array(buffer);
	let encoding: 'utf-8' | 'windows-1252' = 'utf-8';

	// Detectar y eliminar BOM
	if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
		// UTF-8 BOM - definitivamente es UTF-8
		bytes = bytes.slice(3);
		encoding = 'utf-8';
	} else if ((bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0xff && bytes[1] === 0xfe)) {
		// UTF-16 BOM (BE o LE) - no soportado
		throw new Error('El archivo parece estar en UTF-16. Por favor, guárdelo como UTF-8.');
	} else {
		// Sin BOM - detectar codificación
		if (!isValidUtf8(bytes)) {
			// No es UTF-8 válido, asumir Windows-1252 (común en Excel español)
			encoding = 'windows-1252';
		}
	}

	// Decodificar con la codificación detectada
	const decoder = new TextDecoder(encoding, { fatal: false });
	const text = decoder.decode(bytes);

	// Normalizar Unicode (NFC - para caracteres como ñ, á, é, í, ó, ú)
	let sanitized = text.normalize('NFC');

	// Eliminar caracteres de control excepto \n (10), \r (13), \t (9)
	// eslint-disable-next-line no-control-regex
	sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

	// Eliminar replacement characters que puedan quedar
	sanitized = sanitized.replaceAll('\uFFFD', '');

	return sanitized.trim();
}

export const POST: RequestHandler = async ({ request, params, locals }) => {
	// Verificar autenticación
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Verificar permisos de gestión de estudiantes en el curso
	const hasPermission = await CourseRoleUtils.userHasCoursePermission(
		locals.user.id,
		params.cid!,
		'manageUsers'
	);
	if (!hasPermission) {
		return json({ error: 'No tienes permisos para importar estudiantes en este curso' }, { status: 403 });
	}

	try {
		const formData = await request.formData();
		const file = formData.get('file');
		const courseId = params.cid;

		if (!file || !(file instanceof File)) {
			return json({ error: 'No file provided' }, { status: 400 });
		}

		// Leer como ArrayBuffer para poder detectar BOM y sanitizar
		const buffer = await file.arrayBuffer();
		const text = sanitizeCsvContent(buffer);
		const records = parse(text, {
			columns: true,
			skip_empty_lines: true,
			trim: true
		});

		// Validar que el CSV no esté vacío
		if (records.length === 0) {
			return json(
				{
					error: 'Empty CSV',
					message: 'El archivo CSV está vacío. Por favor, proporciona un archivo con al menos una fila de datos.'
				},
				{ status: 400 }
			);
		}

		// Validar headers requeridos
		const requiredHeaders = ['id', 'email', 'firstname', 'lastname', 'fullname'];
		const firstRecord = records[0] as Record<string, unknown>;
		const csvHeaders = Object.keys(firstRecord);
		const missingHeaders = requiredHeaders.filter((header) => !csvHeaders.includes(header));

		if (missingHeaders.length > 0) {
			return json(
				{
					error: 'Invalid CSV format',
					message: `El archivo CSV no contiene las columnas requeridas. Faltan: ${missingHeaders.join(', ')}. Se esperan: ${requiredHeaders.join(', ')}`
				},
				{ status: 400 }
			);
		}

		const results = [];
		for (let index = 0; index < records.length; index++) {
			const record = records[index] as CsvRecord;
			const rowNumber = index + 2; // +1 para filas (row 1 es header), +1 para offset 0-based
			const { id: externalId, email, firstname, lastname, fullname } = record as CsvRecord;

			try {
				// Validar que los campos requeridos no estén vacíos
				const missingFields = [];
				if (!externalId || String(externalId).trim() === '') missingFields.push('id');
				if (!email || String(email).trim() === '') missingFields.push('email');
				if (!firstname || String(firstname).trim() === '') missingFields.push('firstname');
				if (!lastname || String(lastname).trim() === '') missingFields.push('lastname');
				if (!fullname || String(fullname).trim() === '') missingFields.push('fullname');

				if (missingFields.length > 0) {
					results.push({
						rowNumber,
						email: email || 'N/A',
						status: 'error',
						message: `Campos requeridos vacíos: ${missingFields.join(', ')}`
					});
					continue;
				}

				// Validar formato de email
				const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
				if (!emailRegex.test(String(email).trim())) {
					results.push({
						rowNumber,
						email,
						status: 'error',
						message: 'Email inválido'
					});
					continue;
				}

				let userId = await DBUserUtils.existsUserWithExternalId(String(externalId).trim());
				if (!userId) {
					// Register user if they don't exist
					userId = await DBUserUtils.registerUserFromEmailAndExternalId(
						String(email).trim(),
						String(externalId).trim(),
						String(fullname).trim(),
						String(firstname).trim(),
						String(lastname).trim()
					);
				}

				// Enroll user in the course usando el nuevo sistema de roles
				await CourseRoleUtils.assignCourseRole(courseId, userId, 'student');

				results.push({
					rowNumber,
					email,
					status: 'success',
					message: 'Importado exitosamente'
				});
			} catch (error) {
				results.push({
					rowNumber,
					email: record.email || 'N/A',
					status: 'error',
					message: error instanceof Error ? error.message : 'Error desconocido'
				});
			}
		}

		return json({
			message: 'Import completed',
			results,
			totalProcessed: records.length,
			successCount: results.filter((r) => r.status === 'success').length
		});
	} catch (error) {
		console.error('Error processing CSV import:', error);
		return json(
			{
				error: 'Failed to process CSV file',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
}
