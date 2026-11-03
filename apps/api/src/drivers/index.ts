import type { Language } from '@vizdsa/trace';
import { cppDriver } from './cpp.ts';
import { javaDriver } from './java.ts';
import { pythonDriver } from './python.ts';

export { DriverError } from './error.ts';

export function buildDriver(language: Language, code: string, input: string): unknown {
  if (language === 'python') return pythonDriver(code, input);
  if (language === 'java') return javaDriver(code, input);
  return cppDriver(code, input);
}
