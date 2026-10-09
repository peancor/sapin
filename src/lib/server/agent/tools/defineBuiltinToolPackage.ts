import { jsonSchemaToZod, type JsonSchemaProperty } from '../toolParameterSchema';
import type { BuiltinToolHandler, BuiltinToolPackage, ToolManifest } from './types';

/** Keep each handler's parameter type; validate untyped input at the registry boundary. */
export function defineBuiltinToolPackage<Args extends object>(definition: {
	manifest: ToolManifest;
	handler: BuiltinToolHandler<Args>;
}): BuiltinToolPackage & { handler: BuiltinToolHandler } {
	const schema = jsonSchemaToZod(definition.manifest.parametersSchema as JsonSchemaProperty);
	return {
		manifest: definition.manifest,
		handler: async (args, context, toolCallId) => {
			const parsed = schema.safeParse(args);
			if (!parsed.success) {
				return {
					success: false,
					errorMessage: `Parámetros inválidos para ${definition.manifest.name}.`,
					durationMs: 0
				};
			}
			// The trusted package pairs its manifest with its handler's input contract.
			return definition.handler(parsed.data as Args, context, toolCallId);
		}
	};
}
