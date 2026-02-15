import { describe, it, expect, beforeAll } from 'vitest';

let extractBearerToken: (authHeader: string | null) => string | null;
let validatePasswordStrength: (password: string) => { valid: boolean; errors: string[] };

beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "unit-test-jwt-secret-minimum-32-chars";
    const auth = await import("@/lib/auth");
    extractBearerToken = auth.extractBearerToken;
    validatePasswordStrength = auth.validatePasswordStrength;
});

describe('Auth Library', () => {
    describe('extractBearerToken', () => {
        it('should return null for null header', () => {
            expect(extractBearerToken(null)).toBeNull();
        });

        it('should return null for invalid format', () => {
            expect(extractBearerToken('Basic token')).toBeNull();
            expect(extractBearerToken('Bearer')).toBeNull();
        });

        it('should return token for valid Bearer header', () => {
            expect(extractBearerToken('Bearer mytoken')).toBe('mytoken');
            expect(extractBearerToken('Bearer   mytoken')).toBeNull(); // Strict split by space? Implementation uses split(' ') length 2.
        });
    });

    describe('validatePasswordStrength', () => {
        it('should fail for short passwords', () => {
            const result = validatePasswordStrength('Short1a');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Password must be at least 8 characters long');
        });

        it('should fail for missing complexity', () => {
            const result = validatePasswordStrength('alllowercase1');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Password must contain at least one uppercase letter');
        });

        it('should pass for valid password', () => {
            const result = validatePasswordStrength('ValidPass1');
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });
});
