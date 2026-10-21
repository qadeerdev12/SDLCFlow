/** Local HTTP is a process-level development/test decision, never a request or
 * cookie fallback. Unspecified NODE_ENV is secure by default for npm start.
 */
export function authRuntimeOptions(env = process.env) {
    const environment = env.NODE_ENV || 'production';
    if (!['development', 'test', 'production'].includes(environment)) {
        throw new Error('NODE_ENV must be development, test or production');
    }
    const localHttp = environment !== 'production';
    if (!localHttp && !env.CLIENT_ORIGIN?.trim()) {
        throw new Error('Production authentication requires explicit HTTPS CLIENT_ORIGIN');
    }
    return { localHttp, environment };
}
