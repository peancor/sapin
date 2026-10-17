import { buildCsvContent } from './csv';

export const STUDENT_CSV_HEADERS = ['externalId', 'email', 'fullname', 'firstname'];

type Student = {
	id: string;
	externalId?: string | null;
	email?: string | null;
	username?: string | null;
	alias?: string | null;
};

export function buildStudentCsv(students: readonly Student[]): string {
	const seen = new Set<string>();
	return buildCsvContent([
		STUDENT_CSV_HEADERS,
		...students
			.filter((student) => {
				if (seen.has(student.id)) return false;
				seen.add(student.id);
				return true;
			})
			.map((student) => [student.externalId, student.email, student.username, student.alias])
	]);
}

export function buildStudentCsvTemplate(): string {
	return buildStudentCsv([
		{
			id: 'example-1',
			externalId: 'prueba-001',
			email: 'ana@example.invalid',
			username: 'Pérez, Ana',
			alias: 'Ana'
		},
		{
			id: 'example-2',
			externalId: 'prueba-002',
			email: 'luis@example.invalid',
			username: 'García, Luis',
			alias: 'Luis'
		}
	]);
}
