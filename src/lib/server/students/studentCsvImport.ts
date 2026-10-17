import { parse } from 'csv-parse/sync';

export type StudentCsvRecord = {
	externalId: string;
	email: string;
	fullname: string;
	firstname: string;
};

export class StudentCsvError extends Error {}

export function parseStudentCsv(text: string): StudentCsvRecord[] {
	// Detect the separator from the header alone, never from names or quoted data.
	const header = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0];
	const delimiter = header.includes(';') ? ';' : ',';
	let records: Record<string, string>[];
	try {
		records = parse(text, {
			bom: true,
			delimiter,
			skip_empty_lines: true,
			trim: true,
			columns(headers: string[]) {
				if (new Set(headers).size !== headers.length)
					throw new StudentCsvError('Hay columnas duplicadas.');
				if (
					!headers.includes('email') ||
					!headers.includes('fullname') ||
					(!headers.includes('externalId') && !headers.includes('id'))
				) {
					throw new StudentCsvError(
						'Se requieren las columnas externalId, email y fullname. También se admite id como identificador externo del formato antiguo de Moodle.'
					);
				}
				if (headers.includes('externalId') && headers.includes('id')) {
					throw new StudentCsvError('Usa externalId o id, no ambas columnas.');
				}
				return headers;
			}
		});
	} catch (error) {
		if (error instanceof StudentCsvError) throw error;
		throw new StudentCsvError(
			'CSV inválido: revisa el separador, las comillas y el número de columnas.'
		);
	}
	if (!records.length) throw new StudentCsvError('El archivo CSV no contiene estudiantes.');
	return records.map((record) => ({
		externalId: (record.externalId ?? record.id ?? '').trim(),
		email: record.email.trim(),
		fullname: record.fullname.trim(),
		firstname: (record.firstname ?? '').trim()
	}));
}

type ExistingUser = { id: string; email: string | null; externalId: string | null };

/** Resolve enrollment only; CSV imports never overwrite or link existing identities. */
export function resolveStudentCsvUser(
	record: StudentCsvRecord,
	byExternalId: ExistingUser | null,
	byEmail: ExistingUser | null
): string | null {
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) throw new StudentCsvError('Email inválido');
	if (byExternalId) {
		if (byExternalId.email !== record.email || (byEmail && byEmail.id !== byExternalId.id)) {
			throw new StudentCsvError(
				'Conflicto: el identificador externo y el email no corresponden al mismo usuario.'
			);
		}
		return byExternalId.id;
	}
	if (byEmail) {
		if (record.externalId && byEmail.externalId !== record.externalId) {
			throw new StudentCsvError(
				'Conflicto: el email ya existe con otro identificador externo o sin él. No se modificó el usuario.'
			);
		}
		return byEmail.id;
	}
	if (!record.externalId || !record.fullname) {
		throw new StudentCsvError(
			'Para crear un estudiante se requieren externalId, email y fullname.'
		);
	}
	return null;
}
