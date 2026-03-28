/**
 * Crypto Utility - AES-256-GCM Encryption
 * For encrypting sensitive data (passwords, tokens) before storage
 */

import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const ITERATIONS = 100000;
const KEY_LENGTH = 32;

/**
 * Derive a key from the master encryption key and salt
 * @param {string} masterKey - The master encryption key from .env
 * @param {Buffer} salt - Random salt for key derivation
 * @returns {Buffer} Derived encryption key
 */
function deriveKey(masterKey, salt) {
    return crypto.pbkdf2Sync(masterKey, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt sensitive data
 * @param {string} data - Plain text data to encrypt
 * @returns {string} Encrypted data in format: salt:iv:encryptedData:authTag (base64 encoded)
 */
export function encrypt(data) {
    const masterKey = process.env.ENCRYPTION_KEY;

    if (!masterKey) {
        console.warn('[CRYPTO] ENCRYPTION_KEY not set, storing data in plain text (INSECURE!)');
        return `PLAIN:${data}`;
    }

    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = deriveKey(masterKey, salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH
    });

    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag().toString('base64');

    // Format: salt:iv:encryptedData:authTag
    return `${salt.toString('base64')}:${iv.toString('base64')}:${encrypted}:${authTag}`;
}

/**
 * Decrypt sensitive data
 * @param {string} encryptedData - Encrypted data in format: salt:iv:encryptedData:authTag
 * @returns {string|null} Decrypted plain text, or null if decryption fails
 */
export function decrypt(encryptedData) {
    const masterKey = process.env.ENCRYPTION_KEY;

    if (!encryptedData) return null;

    // Handle plain text fallback (for migration or missing key)
    if (encryptedData.startsWith('PLAIN:')) {
        return encryptedData.substring(6);
    }

    if (!masterKey) {
        console.error('[CRYPTO] Cannot decrypt: ENCRYPTION_KEY not set');
        return null;
    }

    try {
        const parts = encryptedData.split(':');
        if (parts.length !== 4) {
            console.error('[CRYPTO] Invalid encrypted data format');
            return null;
        }

        const salt = Buffer.from(parts[0], 'base64');
        const iv = Buffer.from(parts[1], 'base64');
        const encrypted = parts[2];
        const authTag = Buffer.from(parts[3], 'base64');

        const key = deriveKey(masterKey, salt);

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
            authTagLength: AUTH_TAG_LENGTH
        });

        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('[CRYPTO] Decryption failed:', error.message);
        return null;
    }
}

/**
 * Generate a secure random encryption key (for initial setup)
 * @returns {string} Base64-encoded 32-byte key
 */
export function generateEncryptionKey() {
    return crypto.randomBytes(32).toString('base64');
}

/**
 * Hash data using SHA-256 (for non-reversible hashing)
 * @param {string} data - Data to hash
 * @returns {string} SHA-256 hash in hex format
 */
export function hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}
