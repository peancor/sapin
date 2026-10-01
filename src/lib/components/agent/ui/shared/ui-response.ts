export interface SubmitUIResponseParams {
	apiBase: string;
	instanceId: string;
	componentKey: string;
	payload: object;
}

export interface SubmitUIResponseResult {
	ok: boolean;
	errorMessage?: string;
}

export async function submitUIResponse(
	params: SubmitUIResponseParams
): Promise<SubmitUIResponseResult> {
	try {
		const res = await fetch(`${params.apiBase}/ui-response`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				instanceId: params.instanceId,
				componentKey: params.componentKey,
				payload: params.payload
			})
		});

		if (!res.ok) {
			return {
				ok: false,
				errorMessage: 'No se pudo guardar tu resultado. Reintenta el envio.'
			};
		}

		return { ok: true };
	} catch {
		return {
			ok: false,
			errorMessage: 'No se pudo guardar tu resultado. Reintenta el envio.'
		};
	}
}
