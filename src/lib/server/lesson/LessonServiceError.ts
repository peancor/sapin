export class LessonServiceError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = 'LessonServiceError';
		this.status = status;
	}
}
