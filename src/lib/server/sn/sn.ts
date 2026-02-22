import * as crypto from 'crypto';

export class SerialNumberManager {
    private readonly secretKey: string;
    private readonly charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    constructor(secretKey: string) {
        if (!secretKey || secretKey.length !== 64) {
            throw new Error('Invalid secret key length - must be 64 hex characters');
        }
        this.secretKey = secretKey;
    }

    generateSerialNumber(): string {
        const randomBytes = crypto.randomBytes(4);
        const hmac = crypto.createHmac('sha256', this.secretKey);
        hmac.update(randomBytes);
        const hashBytes = hmac.digest().slice(0, 4);
        const combined = Buffer.concat([randomBytes, hashBytes]);
        let result = '';
        for (const byte of combined) {
            const hi = (byte >> 4) & 0xf;
            const lo = byte & 0xf;
            result += this.charset[hi] + this.charset[lo];
        }
        return result.match(/.{1,4}/g)!.join('-');
    }

    validateSerialNumber(serial: string): boolean {
        try {
            const clean = serial.replace(/-/g, '');
            if (clean.length !== 16) return false;
            const bytes = new Uint8Array(8);
            for (let i = 0; i < 8; i++) {
                const hiIndex = this.charset.indexOf(clean[2 * i]);
                const loIndex = this.charset.indexOf(clean[2 * i + 1]);
                if (hiIndex < 0 || loIndex < 0) return false;
                bytes[i] = (hiIndex << 4) | loIndex;
            }
            const randomPart = bytes.slice(0, 4);
            const hashPart = bytes.slice(4);
            const hmac = crypto.createHmac('sha256', this.secretKey);
            hmac.update(randomPart);
            const expectedHash = hmac.digest().slice(0, 4);
            return crypto.timingSafeEqual(hashPart, expectedHash);
        } catch {
            return false;
        }
    }

    static generateNewSecretKey(): string {
        return crypto.randomBytes(32).toString('hex');
    }
}
/*
// Ejemplo de uso:
const secretKey = SerialNumberManager.generateNewSecretKey();
console.log('Nueva clave secreta (guárdala de forma segura):', secretKey);

const manager = new SerialNumberManager(secretKey);

// Generar algunos números de serie
const serials = Array(3).fill(0).map(() => manager.generateSerialNumber());
console.log('\nNúmeros de serie generados:');
serials.forEach(serial => console.log(serial));

// Validar los números de serie
console.log('\nValidación de números de serie:');
serials.forEach(serial => {
    console.log(`${serial}: ${manager.validateSerialNumber(serial)}`);
});

// Intentar validar un número de serie falso
const fakeSerial = 'AAAA-BBBB-CCCC-DDDD';
console.log(`\nValidación de número falso (${fakeSerial}):`, 
    manager.validateSerialNumber(fakeSerial));
    */