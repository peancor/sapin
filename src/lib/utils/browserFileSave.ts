type FileSavePickerOptions = {
	suggestedName?: string;
	types?: Array<{
		description: string;
		accept: Record<string, string[]>;
	}>;
	excludeAcceptAllOption?: boolean;
};

type WritableFileStream = {
	write(data: Blob): Promise<void>;
	close(): Promise<void>;
};

type FileSystemFileHandle = {
	createWritable(): Promise<WritableFileStream>;
};

type WindowWithSavePicker = Window & {
	showSaveFilePicker?: (options?: FileSavePickerOptions) => Promise<FileSystemFileHandle>;
};

export type SaveBlobResult = 'saved' | 'downloaded' | 'cancelled';

export function getFilenameFromContentDisposition(disposition: string | null, fallback: string) {
	if (!disposition) return fallback;

	const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
	if (utf8Match?.[1]) {
		try {
			return decodeURIComponent(utf8Match[1]);
		} catch {
			return utf8Match[1];
		}
	}

	const quotedMatch = disposition.match(/filename="([^"]+)"/i);
	if (quotedMatch?.[1]) return quotedMatch[1];

	const plainMatch = disposition.match(/filename=([^;]+)/i);
	return plainMatch?.[1]?.trim() || fallback;
}

function sanitizeSuggestedFilename(filename: string) {
	return filename.replace(/[\\/:*?"<>|]+/g, '_');
}

function getDownloadExtension(filename: string) {
	const match = filename.match(/(\.[a-z0-9]+)$/i);
	return match?.[1]?.toLowerCase() ?? '';
}

function getFallbackMime(filename: string) {
	if (filename.endsWith('.json')) return 'application/json';
	if (filename.endsWith('.zip') || filename.endsWith('.sapinlesson.zip')) return 'application/zip';
	return 'application/octet-stream';
}

function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	URL.revokeObjectURL(url);
}

export async function saveBlobAs(blob: Blob, filename: string): Promise<SaveBlobResult> {
	const savePicker = (window as WindowWithSavePicker).showSaveFilePicker;
	const safeFilename = sanitizeSuggestedFilename(filename);

	if (savePicker) {
		try {
			const extension = getDownloadExtension(safeFilename);
			const mimeType = blob.type || getFallbackMime(safeFilename);
			const handle = await savePicker({
				suggestedName: safeFilename,
				types: extension
					? [
							{
								description: 'Paquete de actividad Sapin',
								accept: { [mimeType]: [extension] }
							}
						]
					: undefined,
				excludeAcceptAllOption: false
			});
			const writable = await handle.createWritable();
			await writable.write(blob);
			await writable.close();
			return 'saved';
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				return 'cancelled';
			}
		}
	}

	downloadBlob(blob, safeFilename);
	return 'downloaded';
}
