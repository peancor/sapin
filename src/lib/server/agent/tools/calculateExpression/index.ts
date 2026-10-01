import { calculateExpression } from './handler';
import { calculateExpressionManifest } from './manifest';
import type { BuiltinToolPackage } from '../types';

export const calculateExpressionPackage: BuiltinToolPackage = {
	manifest: calculateExpressionManifest,
	handler: calculateExpression
};

export { calculateExpression } from './handler';
export { calculateExpressionManifest } from './manifest';

