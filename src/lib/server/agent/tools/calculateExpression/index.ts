import { calculateExpression } from './handler';
import { calculateExpressionManifest } from './manifest';
import { defineBuiltinToolPackage } from '../defineBuiltinToolPackage';

export const calculateExpressionPackage = defineBuiltinToolPackage({
	manifest: calculateExpressionManifest,
	handler: calculateExpression
});

export { calculateExpression } from './handler';
export { calculateExpressionManifest } from './manifest';
