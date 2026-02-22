import { env } from '$env/dynamic/private';
import { Code } from 'lucide-svelte';
import { invite } from '../db/schema';
import { SerialNumberManager } from './sn';
//console.log(sn.generateSerialNumber());
if (!env.SECRET_KEY) throw new Error('SECRET_KEY is not set');
const secretKey = env.SECRET_KEY;
export const sn = new SerialNumberManager(secretKey);