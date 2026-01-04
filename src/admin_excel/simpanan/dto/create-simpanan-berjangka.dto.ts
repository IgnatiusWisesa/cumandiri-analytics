import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { JenisSimpanan } from './../schema/simpanan.types';

export class CreateSimpananBerjangkaDto {
  @IsEnum(['SJTA', 'SSKA', 'SMP', 'SPJ'] as const)
  jenis!: JenisSimpanan;

  @IsString()
  @IsNotEmpty()
  tp!: string;

  @IsString()
  @IsNotEmpty()
  noRek!: string;

  @IsOptional()
  @IsString()
  noAnggota?: string;

  @IsOptional()
  @IsString()
  kodeAnggota?: string;

  @IsDateString()
  tglBuka!: string; // "2024-10-31T00:00:00.000Z" atau "2024-10-31"

  @IsInt()
  @Min(1)
  jangkaWaktuBulan!: number;

  @IsInt()
  @Min(0)
  saldoMinimum!: number;

  @IsNumber()
  bungaPersen!: number;

  @IsOptional()
  @IsDateString()
  transaksiTerakhir?: string;

  @IsBoolean()
  perpanjangOtomatis!: boolean;

  @IsDateString()
  tanggalLaporan!: string; // "2025-09-30"

  @IsInt()
  @Min(0)
  saldo!: number;

  @IsOptional()
  @IsString()
  sumberFile?: string;
}
