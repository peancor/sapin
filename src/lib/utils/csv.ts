export type CsvCell = string | number | boolean | null | undefined;

export const CSV_BOM = '\uFEFF';

export function escapeCsvCell(cell: CsvCell): string {
	const value = cell == null ? '' : String(cell).replace(/\r\n|\r|\n/g, '\n');
	return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildCsvContent(rows: CsvCell[][]): string {
	return `${CSV_BOM}${rows.map((row) => row.map(escapeCsvCell).join(';')).join('\r\n')}`;
}
