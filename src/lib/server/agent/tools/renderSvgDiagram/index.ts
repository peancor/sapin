import { renderSvgDiagramManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const renderSvgDiagramPackage: BuiltinToolPackage = {
	manifest: renderSvgDiagramManifest
};

export { renderSvgDiagramManifest } from './manifest';
