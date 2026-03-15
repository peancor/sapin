import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const thisFilePath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(thisFilePath), '..');
const staticVendorDirPath = resolve(projectRoot, 'static/vendor');
const staticTikzjaxBrowserRuntimeDirPath = join(staticVendorDirPath, 'tikzjax-browser');
const staticNodeTikzjaxDirPath = join(staticVendorDirPath, 'node-tikzjax');

/**
 * @param {string} dirPath
 * @returns {string[]}
 */
function walkFiles(dirPath) {
	const entries = readdirSync(dirPath, { withFileTypes: true });
	/** @type {string[]} */
	const files = [];

	for (const entry of entries) {
		const fullPath = join(dirPath, entry.name);

		if (entry.isDirectory()) {
			files.push(...walkFiles(fullPath));
		} else {
			files.push(fullPath);
		}
	}

	return files;
}

/**
 * @param {string} sourceDirPath
 * @param {string} targetDirPath
 */
function copyDirectory(sourceDirPath, targetDirPath) {
	for (const filePath of walkFiles(sourceDirPath)) {
		const relativePath = relative(sourceDirPath, filePath);
		const targetPath = join(targetDirPath, relativePath);
		mkdirSync(dirname(targetPath), { recursive: true });
		copyFileSync(filePath, targetPath);
	}
}

/**
 * @param {string} filePath
 */
function ensureParentDir(filePath) {
	mkdirSync(dirname(filePath), { recursive: true });
}

/**
 * @param {string} sourcePath
 * @param {string} targetPath
 */
function copyIfMissing(sourcePath, targetPath) {
	if (!existsSync(sourcePath) || existsSync(targetPath)) {
		return;
	}

	ensureParentDir(targetPath);
	copyFileSync(sourcePath, targetPath);
}

/**
 * @param {string} markerPath
 * @param {Record<string, unknown>} marker
 */
function writeMarkerIfChanged(markerPath, marker) {
	if (existsSync(markerPath)) {
		try {
			const currentMarker = JSON.parse(readFileSync(markerPath, 'utf8'));
			if (JSON.stringify(currentMarker) === JSON.stringify(marker)) {
				return false;
			}
		} catch {
			// Ignore invalid marker files and rebuild the generated assets.
		}
	}

	ensureParentDir(markerPath);
	writeFileSync(markerPath, JSON.stringify(marker, null, 2));
	return true;
}

export function prepareTikzjaxBrowserTexFiles() {
	const sourceTarPath = resolve(projectRoot, 'node_modules/node-tikzjax/tex/tex_files.tar.gz');
	const generatedDirPath = resolve(projectRoot, '.generated/tikzjax-browser-tex-files');
	const tempExtractDirPath = resolve(projectRoot, '.generated/.tikzjax-browser-tex-files-temp');
	const markerPath = join(generatedDirPath, '.prepared.json');

	if (!existsSync(sourceTarPath)) {
		return generatedDirPath;
	}

	const sourceMtimeMs = statSync(sourceTarPath).mtimeMs;

	if (existsSync(markerPath)) {
		try {
			const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
			if (marker?.sourceMtimeMs === sourceMtimeMs) {
				return generatedDirPath;
			}
		} catch {
			// Ignore invalid marker files and rebuild the generated assets.
		}
	}

	rmSync(generatedDirPath, { recursive: true, force: true });
	rmSync(tempExtractDirPath, { recursive: true, force: true });
	mkdirSync(generatedDirPath, { recursive: true });
	mkdirSync(tempExtractDirPath, { recursive: true });

	try {
		execFileSync('tar', ['-xzf', sourceTarPath, '-C', tempExtractDirPath], {
			stdio: 'pipe'
		});
	} catch (error) {
		throw new Error(
			`No se pudo extraer ${sourceTarPath} con el comando tar. ` +
				'Asegúrate de que el ejecutable tar esté disponible en el sistema.',
			{ cause: error }
		);
	}

	for (const filePath of walkFiles(tempExtractDirPath)) {
		const relativePath = relative(tempExtractDirPath, filePath);
		const targetPath = join(generatedDirPath, `${relativePath}.gz`);
		mkdirSync(dirname(targetPath), { recursive: true });
		writeFileSync(targetPath, gzipSync(readFileSync(filePath)));
	}

	writeFileSync(
		markerPath,
		JSON.stringify(
			{
				sourceTarPath,
				sourceMtimeMs
			},
			null,
			2
		)
	);

	rmSync(tempExtractDirPath, { recursive: true, force: true });

	return generatedDirPath;
}

export function prepareTikzjaxBrowserRuntimeAssets() {
	const distDirPath = resolve(projectRoot, 'node_modules/@rod2ik/tikzjax/dist');
	const sourceTarPath = resolve(projectRoot, 'node_modules/node-tikzjax/tex/tex_files.tar.gz');
	const generatedDirPath = staticTikzjaxBrowserRuntimeDirPath;
	const tempExtractDirPath = resolve(projectRoot, '.generated/.tikzjax-browser-runtime-temp');
	const markerPath = join(generatedDirPath, '.prepared.json');
	const runTexPath = join(distDirPath, 'run-tex.js');
	const tikzjaxPath = join(distDirPath, 'tikzjax.js');
	const texWasmPath = join(distDirPath, 'tex.wasm.gz');
	const coreDumpPath = join(distDirPath, 'core.dump.gz');

	if (!existsSync(distDirPath) || !existsSync(sourceTarPath)) {
		return generatedDirPath;
	}

	const marker = {
		generatorVersion: 4,
		sourceTarMtimeMs: statSync(sourceTarPath).mtimeMs,
		runTexMtimeMs: statSync(runTexPath).mtimeMs,
		tikzjaxMtimeMs: statSync(tikzjaxPath).mtimeMs,
		texWasmMtimeMs: statSync(texWasmPath).mtimeMs,
		coreDumpMtimeMs: statSync(coreDumpPath).mtimeMs
	};

	if (!writeMarkerIfChanged(markerPath, marker)) {
		return generatedDirPath;
	}

	rmSync(generatedDirPath, { recursive: true, force: true });
	rmSync(tempExtractDirPath, { recursive: true, force: true });
	mkdirSync(generatedDirPath, { recursive: true });
	mkdirSync(tempExtractDirPath, { recursive: true });

	copyDirectory(distDirPath, generatedDirPath);

	writeFileSync(
		join(generatedDirPath, 'run-tex.js'),
		readFileSync(runTexPath, 'utf8')
			.replaceAll('tex.wasm.gz', 'tex.wasm.bin')
			.replaceAll('core.dump.gz', 'core.dump.bin')
			.replaceAll('tex_files/${A}.gz', 'tex_files/${A}.bin')
	);

	const patchedTikzjaxSource = readFileSync(tikzjaxPath, 'utf8')
		.replace(
			'try{await r.load(e)}catch(e){console.log(e)}return r',
			'await r.load(e);return r'
		)
		.replace(
			'return r})(),"complete"==document.readyState?K():window.addEventListener("load",K),window.addEventListener("unload",Z))',
			'return r})(),window.__tikzjaxRuntimeReady=V,window.__tikzjaxRuntimeReady.then((()=>window.dispatchEvent(new CustomEvent("tikzjax-runtime-ready")))).catch((e=>window.dispatchEvent(new CustomEvent("tikzjax-runtime-error",{detail:e})))),"complete"==document.readyState?K():window.addEventListener("load",K),window.addEventListener("unload",Z))'
		);

	writeFileSync(join(generatedDirPath, 'tikzjax.js'), patchedTikzjaxSource);

	writeFileSync(join(generatedDirPath, 'tex.wasm.bin'), readFileSync(texWasmPath));
	writeFileSync(join(generatedDirPath, 'core.dump.bin'), readFileSync(coreDumpPath));

	try {
		execFileSync('tar', ['-xzf', sourceTarPath, '-C', tempExtractDirPath], {
			stdio: 'pipe'
		});
	} catch (error) {
		throw new Error(
			`No se pudo extraer ${sourceTarPath} con el comando tar. ` +
				'Asegúrate de que el ejecutable tar esté disponible en el sistema.',
			{ cause: error }
		);
	}

	for (const filePath of walkFiles(tempExtractDirPath)) {
		const relativePath = relative(tempExtractDirPath, filePath);
		const targetPath = join(generatedDirPath, 'tex_files', `${relativePath}.bin`);
		ensureParentDir(targetPath);
		writeFileSync(targetPath, gzipSync(readFileSync(filePath)));
	}

	for (const filePath of walkFiles(join(generatedDirPath, 'tex_files'))) {
		if (!filePath.endsWith('.gz')) {
			continue;
		}

		copyIfMissing(filePath, filePath.replace(/\.gz$/, '.bin'));
	}

	copyIfMissing(
		join(generatedDirPath, 'tex_files', 'pgflibraryarrows.meta.code.tex.bin'),
		join(generatedDirPath, 'tex_files', 'tikzlibraryarrows.meta.code.tex.bin')
	);
	copyIfMissing(
		join(generatedDirPath, 'tex_files', 'pgflibraryarrows.meta.code.tex.gz'),
		join(generatedDirPath, 'tex_files', 'tikzlibraryarrows.meta.code.tex.gz')
	);

	writeFileSync(markerPath, JSON.stringify(marker, null, 2));

	rmSync(tempExtractDirPath, { recursive: true, force: true });

	return generatedDirPath;
}

export function prepareNodeTikzjaxStaticAssets() {
	const sourceDirPath = resolve(projectRoot, 'node_modules/node-tikzjax/css');
	const markerPath = join(staticNodeTikzjaxDirPath, '.prepared.json');

	if (!existsSync(sourceDirPath)) {
		return staticNodeTikzjaxDirPath;
	}

	const marker = {
		generatorVersion: 1,
		sourceDirPath,
		sourceMtimeMs: statSync(sourceDirPath).mtimeMs
	};

	if (!writeMarkerIfChanged(markerPath, marker)) {
		return staticNodeTikzjaxDirPath;
	}

	rmSync(staticNodeTikzjaxDirPath, { recursive: true, force: true });
	mkdirSync(staticNodeTikzjaxDirPath, { recursive: true });
	copyDirectory(sourceDirPath, staticNodeTikzjaxDirPath);
	writeFileSync(markerPath, JSON.stringify(marker, null, 2));

	return staticNodeTikzjaxDirPath;
}

if (process.argv[1] && resolve(process.argv[1]) === thisFilePath) {
	prepareTikzjaxBrowserTexFiles();
	prepareTikzjaxBrowserRuntimeAssets();
	prepareNodeTikzjaxStaticAssets();
}