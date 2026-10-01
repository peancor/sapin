const DEFAULT_TIMEOUT_MS = 15000;
const MOODLE_REST_ENDPOINT_PATH = '/webservice/rest/server.php';

export interface MoodleStudent {
    moodleUserId: string;
    email: string;
    firstname: string;
    lastname: string;
    fullname: string;
}

interface MoodleEnrolledUser {
    id?: number;
    email?: string;
    firstname?: string;
    lastname?: string;
    fullname?: string;
    roles?: Array<{
        shortname?: string;
    }>;
}

export function normalizeMoodleRestEndpoint(moodleUrl: string): string {
    const url = new URL(moodleUrl.trim());
    url.search = '';
    url.hash = '';

    const path = url.pathname.replace(/\/+$/, '');
    url.pathname = path.endsWith(MOODLE_REST_ENDPOINT_PATH) || path.endsWith('.php')
        ? path
        : `${path}${MOODLE_REST_ENDPOINT_PATH}`;

    return url.toString();
}

function safeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isStudentRole(shortname: string): boolean {
    const normalized = shortname.trim().toLowerCase();
    return normalized === 'student' || normalized === 'estudiante';
}

function isStudentUser(user: MoodleEnrolledUser): boolean {
    const roles = Array.isArray(user.roles) ? user.roles : [];
    if (roles.length === 0) {
        return false;
    }
    return roles.some((role) => isStudentRole(safeString(role.shortname)));
}

export class MoodleClient {
    private readonly restEndpointUrl: string;
    private readonly token: string;
    private readonly timeoutMs: number;

    constructor(moodleUrl: string, token: string, timeoutMs = DEFAULT_TIMEOUT_MS) {
        this.restEndpointUrl = normalizeMoodleRestEndpoint(moodleUrl);
        this.token = token.trim();
        this.timeoutMs = timeoutMs;
    }

    async getCourseStudents(courseId: string): Promise<MoodleStudent[]> {
        if (!this.restEndpointUrl) {
            throw new Error('Se requiere la URL del endpoint REST de Moodle');
        }
        if (!this.token) {
            throw new Error('Se requiere el token de Moodle');
        }
        if (!courseId?.trim()) {
            throw new Error('Se requiere el ID del curso en Moodle');
        }

        const users = await this.callMoodle<MoodleEnrolledUser[]>('core_enrol_get_enrolled_users', {
            courseid: courseId.trim()
        });

        return users
            .filter(isStudentUser)
            .map((user) => ({
                moodleUserId: String(user.id ?? ''),
                email: safeString(user.email),
                firstname: safeString(user.firstname),
                lastname: safeString(user.lastname),
                fullname: safeString(user.fullname)
            }));
    }

    private async callMoodle<T>(wsfunction: string, params: Record<string, string>): Promise<T> {
        const url = new URL(this.restEndpointUrl);
        url.searchParams.set('wstoken', this.token);
        url.searchParams.set('moodlewsrestformat', 'json');
        url.searchParams.set('wsfunction', wsfunction);
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const response = await fetch(url.toString(), {
                method: 'GET',
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`Moodle respondió con estado ${response.status}`);
            }

            const data = (await response.json()) as
                | { exception?: string; errorcode?: string; message?: string }
                | T;

            if (
                typeof data === 'object' &&
                data !== null &&
                ('exception' in data || 'errorcode' in data || 'message' in data)
            ) {
                const moodleError = data as { exception?: string; errorcode?: string; message?: string };
                if (moodleError.exception || moodleError.errorcode) {
                    throw new Error(moodleError.message || 'Error de Moodle al procesar la solicitud');
                }
            }

            return data as T;
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('La solicitud a Moodle excedió el tiempo límite');
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }
}

export default MoodleClient;
