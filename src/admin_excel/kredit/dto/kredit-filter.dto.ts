import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsString, IsArray } from 'class-validator';

export class KreditFilterDto {
    @ApiProperty({ required: false, description: 'Filter tahun tglPinjam (YYYY)' })
    @IsOptional()
    @IsNumber()
    year?: number;

    @ApiProperty({ required: false, description: 'Filter TP (multi)', isArray: true, type: String })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tp?: string[];

    @ApiProperty({ required: false, description: 'Filter kategori' })
    @IsOptional()
    @IsString()
    kategori?: string;

    @ApiProperty({ required: false, description: 'Filter UGL' })
    @IsOptional()
    @IsString()
    ugl?: string;
}
