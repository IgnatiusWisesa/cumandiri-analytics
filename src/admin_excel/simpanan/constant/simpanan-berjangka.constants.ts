import { JenisSimpanan } from "../schema/simpanan.types";

// simpanan-berjangka.constants.ts
export type KolomSimpananKey = 'SISUKA' | 'SUJATRA' | 'SIPIJAR' | 'SIMAPAN';

export const JENIS_TO_KOLOM: Record<JenisSimpanan, KolomSimpananKey> = {
  SSKA: 'SISUKA',
  SJTA: 'SUJATRA',
  SPJ:  'SIPIJAR',
  SMP:  'SIMAPAN',
  // silakan sesuaikan kalau mapping di tempatmu beda
};
