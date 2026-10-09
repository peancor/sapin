import { z } from 'zod';

export type JsonSchemaProperty = {
	type?: string | string[];
	description?: string;
	default?: unknown;
	enum?: unknown[];
	minimum?: number;
	maximum?: number;
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	items?: JsonSchemaProperty;
	properties?: Record<string, JsonSchemaProperty>;
	required?: string[];
};

function cloneSchemaWithType(schema: JsonSchemaProperty, type: string): JsonSchemaProperty {
	return {
		...schema,
		type
	};
}

/**
 * Convierte un JSON Schema a un schema Zod para la validación de parámetros.
 */
export function jsonSchemaToZod(schema: JsonSchemaProperty): z.ZodTypeAny {
	const type = schema.type;

	if (Array.isArray(type)) {
		const variants = type.map((variant) => jsonSchemaToZod(cloneSchemaWithType(schema, variant)));
		if (variants.length === 0) return z.unknown();
		if (variants.length === 1) return variants[0];
		return z.union(variants as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
	}

	switch (type) {
		case 'string': {
			let s = z.string();
			if (schema.description) s = s.describe(schema.description);
			if (schema.minLength !== undefined) s = s.min(schema.minLength);
			if (schema.maxLength !== undefined) s = s.max(schema.maxLength);
			if (schema.pattern) s = s.regex(new RegExp(schema.pattern));
			if (schema.enum) {
				const values = schema.enum as [string, ...string[]];
				return z.enum(values);
			}
			if (schema.default !== undefined) return s.default(schema.default as string);
			return s;
		}

		case 'number':
		case 'integer': {
			let n = schema.type === 'integer' ? z.number().int() : z.number();
			if (schema.description) n = n.describe(schema.description);
			if (schema.minimum !== undefined) n = n.min(schema.minimum);
			if (schema.maximum !== undefined) n = n.max(schema.maximum);
			if (schema.default !== undefined) return n.default(schema.default as number);
			return n;
		}

		case 'boolean': {
			const b = schema.description ? z.boolean().describe(schema.description) : z.boolean();
			if (schema.default !== undefined) return b.default(schema.default as boolean);
			return b;
		}

		case 'object': {
			if (!schema.properties) {
				const emptyObject = z.object({}).passthrough();
				return schema.description ? emptyObject.describe(schema.description) : emptyObject;
			}
			const shape: Record<string, z.ZodTypeAny> = {};
			for (const [key, prop] of Object.entries(schema.properties)) {
				shape[key] = jsonSchemaToZod(prop);
			}
			const required = new Set(schema.required ?? []);
			const partialShape: Record<string, z.ZodTypeAny> = {};
			for (const [key, zodType] of Object.entries(shape)) {
				partialShape[key] = required.has(key) ? zodType : zodType.optional();
			}
			const objectSchema = z.object(partialShape).passthrough();
			return schema.description ? objectSchema.describe(schema.description) : objectSchema;
		}

		case 'array': {
			const itemSchema = schema.items ? jsonSchemaToZod(schema.items) : z.unknown();
			const arr = z.array(itemSchema);
			return schema.description ? arr.describe(schema.description) : arr;
		}

		default:
			return z.unknown();
	}
}
