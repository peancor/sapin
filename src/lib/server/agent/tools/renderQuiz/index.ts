import { renderQuizManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const renderQuizPackage: BuiltinToolPackage = {
	manifest: renderQuizManifest
};

export { renderQuizManifest } from './manifest';

