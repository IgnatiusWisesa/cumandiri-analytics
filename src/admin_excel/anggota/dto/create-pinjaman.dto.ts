import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateDataAnggotaDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  noAgt!: string;

  @ApiProperty() @IsString() @IsOptional()
  nama?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  tp?: string;

  @ApiPropertyOptional({ enum: ['L', 'P'] }) @IsEnum(['L','P']) @IsOptional()
  jk?: 'L'|'P';

  @ApiPropertyOptional() @IsDateString() @IsOptional()
  tglLahir?: string;

  @ApiPropertyOptional() @IsNumber() @IsOptional()
  usia?: number;

  @ApiPropertyOptional() @IsString() @IsOptional()
  pekerjaan?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  profesi?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  bidangUsaha?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  namaInstansi?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  tahunGabung?: number;

  @ApiPropertyOptional() @IsString() @IsOptional()
  tglMasuk?: string;
}
