import { createHash, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

const GOOGLE_SECURE_TOKEN_JWKS =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export interface VerifiedUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAnonymous: boolean;
}

export interface IdTokenVerifier {
  verify(idToken: string): Promise<VerifiedUser>;
}

export class AuthError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 401, code = 'unauthenticated') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Verifies Firebase Auth ID tokens against Google's public JWKS.
 * No service-account key material is required, so the sandbox / Cloud Run
 * deployment never needs a private key on disk.
 */
export function createFirebaseTokenVerifier(projectId: string): IdTokenVerifier {
  if (!projectId) throw new Error('Firebase project id is required to verify ID tokens');
  const jwks = createRemoteJWKSet(new URL(GOOGLE_SECURE_TOKEN_JWKS));
  return {
    async verify(idToken: string): Promise<VerifiedUser> {
      const { payload } = await jwtVerify(idToken, jwks, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
      });
      return toVerifiedUser(payload);
    },
  };
}

function toVerifiedUser(payload: JWTPayload): VerifiedUser {
  const uid = typeof payload.user_id === 'string' ? payload.user_id : (payload.sub as string);
  if (!uid) throw new AuthError('ID token is missing a subject', 401, 'invalid_token');
  const firebase = payload.firebase as { sign_in_provider?: string } | undefined;
  return {
    uid,
    email: typeof payload.email === 'string' ? payload.email : null,
    displayName: typeof payload.name === 'string' ? payload.name : null,
    isAnonymous: firebase?.sign_in_provider === 'anonymous',
  };
}

/**
 * Test-only verifier. Accepts tokens of the shape `test:<uid>:<email>`.
 * Never mounted unless tests instantiate the router explicitly.
 */
export function createStaticTestVerifier(): IdTokenVerifier {
  return {
    async verify(idToken: string): Promise<VerifiedUser> {
      if (!idToken.startsWith('test:')) {
        throw new AuthError('Invalid test token', 401, 'invalid_token');
      }
      const [, uid, email] = idToken.split(':');
      if (!uid) throw new AuthError('Invalid test token subject', 401, 'invalid_token');
      return {
        uid,
        email: email || null,
        displayName: uid,
        isAnonymous: false,
      };
    },
  };
}

/** Extracts a bearer token from the Authorization header. */
export function readBearerToken(headerValue: string | undefined): string {
  if (!headerValue) throw new AuthError('Missing Authorization header', 401, 'unauthenticated');
  const [scheme, ...rest] = headerValue.split(' ');
  const token = rest.join(' ').trim();
  if (!/^bearer$/i.test(scheme) || !token) {
    throw new AuthError('Authorization header must use the Bearer scheme', 401, 'unauthenticated');
  }
  return token;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function safeCompareHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
