// The vault format must be byte-compatible across platforms: whatever the desktop (Node crypto)
// writes, the mobile implementation (pure JS) must read, and the other way round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createVaultCrypto } from '../../shared/vaultCrypto.js';
import { createTotp } from '../../shared/totp.js';
import { generateKeyFile, parseKeyFile } from '../../shared/keyFile.js';
import { noblePrimitives } from '../../shared/noblePrimitives.js';
import { utf8ToBytes, bytesToHex, bytesToBase64, base64ToBytes, copyBytes } from '../../shared/bytes.js';

const require = createRequire(import.meta.url);
const nodePrimitives = require('../../electron/nodePrimitives.cjs');
const { encryptLegacy } = require('../fixtures/legacyEncrypt.cjs');

const implementations = { node: nodePrimitives, noble: noblePrimitives };
const PASSWORD = 'Çok-gizli parola 123 ✓';
const TEXT = JSON.stringify([{ id: '1', title: 'Örnek', password: 'şifre-ğüşiöç' }]);

test('primitives give identical results on every platform', async () => {
    const key = nodePrimitives.randomBytes(32);
    const salt = nodePrimitives.randomBytes(32);
    const data = utf8ToBytes('some data');
    const hex = (bytes) => bytesToHex(bytes);

    assert.equal(hex(noblePrimitives.sha1(data)), hex(nodePrimitives.sha1(data)));
    assert.equal(hex(noblePrimitives.hmacSha1(key, data)), hex(nodePrimitives.hmacSha1(key, data)));
    assert.equal(
        hex(noblePrimitives.hkdfSha256(key, salt, data, 32)),
        hex(nodePrimitives.hkdfSha256(key, salt, data, 32))
    );
    const params = { N: 16384, r: 8, p: 1 };
    assert.equal(
        hex(noblePrimitives.scryptSync(data, salt, params, 32)),
        hex(nodePrimitives.scryptSync(data, salt, params, 32))
    );
    assert.equal(
        hex(await noblePrimitives.scrypt(data, salt, params, 32)),
        hex(await nodePrimitives.scrypt(data, salt, params, 32))
    );

    for (const ivLength of [12, 16]) {
        const iv = nodePrimitives.randomBytes(ivLength);
        for (const aad of [null, utf8ToBytes('header')]) {
            const a = nodePrimitives.aesGcmEncrypt(key, iv, data, aad);
            const b = noblePrimitives.aesGcmEncrypt(key, iv, data, aad);
            assert.equal(hex(a.ciphertext), hex(b.ciphertext));
            assert.equal(hex(a.tag), hex(b.tag));
            assert.equal(hex(noblePrimitives.aesGcmDecrypt(key, iv, a.ciphertext, a.tag, aad)), hex(data));
            assert.equal(hex(nodePrimitives.aesGcmDecrypt(key, iv, b.ciphertext, b.tag, aad)), hex(data));
        }
    }

    for (const p of [nodePrimitives, noblePrimitives]) {
        assert.equal(p.timingSafeEqual(utf8ToBytes('abc'), utf8ToBytes('abc')), true);
        assert.equal(p.timingSafeEqual(utf8ToBytes('abc'), utf8ToBytes('abd')), false);
        assert.equal(p.timingSafeEqual(utf8ToBytes('abc'), utf8ToBytes('abcd')), false);
    }
});

for (const [writerName, writer] of Object.entries(implementations)) {
    for (const [readerName, reader] of Object.entries(implementations)) {
        test(`vault written by ${writerName} opens with ${readerName}`, async () => {
            const write = createVaultCrypto(writer);
            const read = createVaultCrypto(reader);

            // password only
            const keyMaterial = await write.createKey(PASSWORD);
            const file = write.encryptWithKey(TEXT, keyMaterial);
            assert.equal(bytesToHex(file.subarray(0, 4)), bytesToHex(utf8ToBytes('OPV2')));
            assert.equal(read.requiresKeyFile(file), false);

            const opened = await read.decryptWithPassword(file, PASSWORD);
            assert.equal(opened.text, TEXT);
            assert.equal(bytesToHex(opened.keyMaterial.key), bytesToHex(keyMaterial.key));
            assert.equal(read.decryptWithKey(file, opened.keyMaterial), TEXT);
            assert.equal(await read.verifyPassword(PASSWORD, opened.keyMaterial), true);
            assert.equal(await read.verifyPassword('yanlış', opened.keyMaterial), false);
            await assert.rejects(read.decryptWithPassword(file, 'yanlış'));

            // the session key of one platform works on the other
            const second = read.encryptWithKey('ikinci', opened.keyMaterial);
            assert.equal(write.decryptWithKey(second, keyMaterial), 'ikinci');
            assert.notEqual(bytesToHex(second), bytesToHex(read.encryptWithKey('ikinci', opened.keyMaterial)));

            // password + key file
            const { secret, content } = generateKeyFile(writer);
            const keyFileSecret = parseKeyFile(content);
            assert.equal(bytesToHex(keyFileSecret), bytesToHex(secret));
            const withKeyFile = await write.createKey(PASSWORD, copyBytes(secret));
            const protectedFile = write.encryptWithKey(TEXT, withKeyFile);
            assert.equal(read.requiresKeyFile(protectedFile), true);
            await assert.rejects(read.decryptWithPassword(protectedFile, PASSWORD), { code: 'KEYFILE_REQUIRED' });
            await assert.rejects(read.decryptWithPassword(protectedFile, PASSWORD, reader.randomBytes(32)));
            assert.equal((await read.decryptWithPassword(protectedFile, PASSWORD, keyFileSecret)).text, TEXT);
            assert.throws(() => read.decryptWithKey(protectedFile, opened.keyMaterial));

            // tampering with the header, the IV or the ciphertext is detected
            for (const index of [1, 10, 40, protectedFile.length - 1]) {
                const tampered = copyBytes(file);
                tampered[index] ^= 1;
                await assert.rejects(read.decryptWithPassword(tampered, PASSWORD));
            }
        });
    }
}

test('vaults of the first app version (legacy format) still open on every platform', async () => {
    const legacyFile = await encryptLegacy(TEXT, 'eski1234');
    for (const primitives of Object.values(implementations)) {
        const vault = createVaultCrypto(primitives);
        assert.equal(vault.isCurrentFormat(legacyFile), false);
        const opened = await vault.decryptWithPassword(legacyFile, 'eski1234');
        assert.equal(opened.text, TEXT);
        assert.equal(opened.keyMaterial, null, 'legacy files report no key material so they get upgraded');
        await assert.rejects(vault.decryptWithPassword(legacyFile, 'yanlış12'));
    }
});

test('TOTP codes match the RFC 6238 test vector and both platforms agree', () => {
    // RFC 6238 appendix B, SHA-1, secret "12345678901234567890", T = 59 s -> 94287082 (8 digits)
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    for (const primitives of Object.values(implementations)) {
        const totp = createTotp(primitives);
        assert.equal(totp.generateTOTP(secret, 59 * 1000), '287082');
        assert.equal(totp.generateTOTP(secret, 1111111109 * 1000), '081804');
        assert.equal(totp.verifyTOTP(secret, totp.generateTOTP(secret)), true);
        assert.equal(totp.verifyTOTP(secret, totp.generateTOTP(secret, Date.now() - 30000)), true, 'previous step accepted');
        assert.equal(totp.verifyTOTP(secret, totp.generateTOTP(secret, Date.now() - 300000)), false);
        assert.equal(totp.verifyTOTP(secret, '12345'), false);
        assert.equal(totp.verifyTOTP(secret, 123456), false);
        assert.match(totp.generateSecret(), /^[A-Z2-7]{32}$/);
    }
});

test('byte helpers round-trip', () => {
    const bytes = nodePrimitives.randomBytes(100);
    assert.equal(bytesToHex(base64ToBytes(bytesToBase64(bytes))), bytesToHex(bytes));
    assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString('base64'));
    assert.throws(() => parseKeyFile('not json'));
    assert.throws(() => parseKeyFile(JSON.stringify({ app: 'OrendaPass', type: 'keyfile', key: 'AAAA' })));
});
