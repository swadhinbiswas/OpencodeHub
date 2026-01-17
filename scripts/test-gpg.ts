
import * as openpgp from 'openpgp';

async function test() {
    try {
        console.log("Generating key...");
        const { publicKey } = await openpgp.generateKey({
            type: 'ecc',
            curve: 'ed25519' as any,
            userIDs: [{ name: 'Test', email: 'test@example.com' }],
        });
        console.log("Key generated.");

        console.log("Reading public key...");
        const key = await openpgp.readKey({ armoredKey: publicKey });
        console.log("Key ID:", key.getKeyID().toHex());
        console.log("Is Private:", key.isPrivate());

        console.log("Test passed.");
    } catch (e) {
        console.error("Test failed:", e);
    }
}

test();
