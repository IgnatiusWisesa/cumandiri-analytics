import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PinjamanFilterDto {
  @IsOptional() @IsNumber() @Transform(({value}) => Number(value))
  year?: number;               // filter tahun tglPinjam

  @IsOptional() @IsArray() @Transform(({ value }) =>
    Array.isArray(value) ? value : (value ? [value] : []))
  tp?: string[];               // PBL, KRK, ...

  @IsOptional() @IsString()
  produk?: string;

  @IsOptional() @IsString()
  cabang?: string;             // bila mau batasi cabang di koleksi pinjaman
}

/** ====== RESPON: /analytics/profesi-vs-tujuan ====== */
export class ProfesiVsTujuanRow {
  @ApiProperty({ example: 'Wiraswasta' }) profesi!: string;

  @ApiProperty({
    description: 'Map tujuan → jumlah',
    example: { KESEHATAN: 4, KESEJAHTERAAN: 46, KONSUMTIF: 76, PENDIDIKAN: 58, PRODUKTIF: 343, KOSONG: 37 },
    additionalProperties: { type: 'number' },
  })
  perPurpose!: Record<string, number>;

  @ApiProperty({ example: 564 }) total!: number;
}

export class ProfesiVsTujuanResp {
  @ApiProperty({ example: 1737 }) totalAll!: number;

  @ApiProperty({
    description: 'Total per tujuan',
    example: { KESEHATAN: 21, KESEJAHTERAAN: 264, KONSUMTIF: 412, PENDIDIKAN: 268, PRODUKTIF: 688, KOSONG: 84 },
    additionalProperties: { type: 'number' },
  })
  totalsPerPurpose!: Record<string, number>;

  @ApiProperty({ type: [ProfesiVsTujuanRow] })
  rows!: ProfesiVsTujuanRow[];
}

/** ====== RESPON: /analytics/profesi-per-tp ====== */
export class ProfesiPerTPRow {
  @ApiProperty({ example: 'Wiraswasta' }) profesi!: string;

  @ApiProperty({
    description: 'Map TP → jumlah',
    example: { PBL: 164, KRK: 93, JBR: 114, BWI: 98, MJK: 43, MGL: 52, PML: 0 },
    additionalProperties: { type: 'number' },
  })
  perTP!: Record<string, number>;

  @ApiProperty({ example: 564 }) total!: number;
}

export class ProfesiPerTPResp {
  @ApiProperty({ example: ['PBL','KRK','JBR','BWI','MJK','MGL','PML'] })
  tps!: string[];

  @ApiProperty({ example: 1737 }) grandTotal!: number;

  @ApiProperty({
    description: 'Total per TP (kolom footer)',
    example: { PBL: 671, KRK: 299, JBR: 273, BWI: 244, MJK: 105, MGL: 145, PML: 0 },
    additionalProperties: { type: 'number' },
  })
  totalsPerTP!: Record<string, number>;

  @ApiProperty({ type: [ProfesiPerTPRow] })
  rows!: ProfesiPerTPRow[];
}