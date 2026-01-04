// simpanan-berjangka.dto.ts
import { IsOptional, IsString } from 'class-validator';
import { KolomSimpananKey } from './../constant/simpanan-berjangka.constants';

export class UsiaProfesiSimpananQueryDto {
  @IsOptional()
  @IsString()
  tp?: string;                 // filter per TP (kalau mau)

  @IsOptional()
  @IsString()
  tahunBuka?: string;          // contoh filter: tahun tglBuka, mis. "2024"
}

/** Satu baris profesi di dalam satu bucket usia */
export interface UsiaProfesiRow {
  profesi: string;
  perJenis: Record<KolomSimpananKey, number>;
  total: number;      // JML kolom terakhir
  persen: number;     // 0–100, proporsi dari grandTotal
}

/** Satu bucket usia (mis. "24 - 35 Th") */
export interface UsiaBucket {
  usia: string;
  rows: UsiaProfesiRow[];
  subtotal: number;
  subtotalPerJenis: Record<KolomSimpananKey, number>;
}

/** Response utama endpoint */
export interface UsiaProfesiSimpananResponse {
  jenisList: KolomSimpananKey[];   // ['SISUKA','SUJATRA','SIPIJAR','SIMAPAN']
  buckets: UsiaBucket[];
  grandTotal: number;
}
