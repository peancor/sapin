import { env } from '$env/dynamic/private';
import '../db/schema';
import { SerialNumberManager } from './sn';
//console.log(sn.generateSerialNumber());
if (!env.SECRET_KEY) throw new Error('SECRET_KEY is not set');
const secretKey = env.SECRET_KEY;
export const sn = new SerialNumberManager(secretKey);
