import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreatePinjamanDto {
  @ApiProperty({ description: 'Nomor Rekening Pinjaman', example: '14053.001.1000.031' })
  @IsString() @IsNotEmpty()
  noRek: string;

  @ApiPropertyOptional({ description: 'No Anggota (NBA)', example: '14503.001.1000.004' })
  @IsString() @IsOptional()
  noAgt?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  produk?: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional()
  tglPinjam?: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional()
  tglAngsurTerakhir?: string;

  @ApiPropertyOptional({ description: 'Tenor dalam bulan', example: 36 })
  @IsNumber() @IsOptional()
  tenorBulan?: number;

  @ApiPropertyOptional({ description: 'Suku bunga persentase, contoh 12.5 = 12.5%' })
  @IsNumber() @IsOptional()
  sukuBungaPct?: number;

  @ApiPropertyOptional() @IsString() @IsOptional()
  jenisAngsuran?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  sppSpk?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  tujuan?: string;

  @ApiPropertyOptional({ description: 'Kategori pinjaman (PRODUKTIF/KONSUMTIF/dll.)' })
  @IsString() @IsOptional()
  kategori?: string;

  @ApiPropertyOptional() @IsNumber() @IsOptional()
  nilaiPinjaman?: number;

  @ApiPropertyOptional() @IsNumber() @IsOptional()
  saldoPinjaman?: number;

  @ApiPropertyOptional() @IsNumber() @IsOptional()
  saldoHutangBunga?: number;

  @ApiPropertyOptional() @IsString() @IsOptional()
  jaminan?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  keteranganJaminan?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  nba?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  cabang?: string;
}