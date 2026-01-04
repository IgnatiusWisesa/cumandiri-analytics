import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsDateString } from 'class-validator';

export class CreateKreditDto {
    @ApiProperty({ required: false, description: 'No Anggota (NBA)' })
    @IsOptional()
    @IsString()
    noAgt?: string;

    @ApiProperty({ required: true, description: 'No Rekening (unique)' })
    @IsString()
    noRek: string;

    @ApiProperty({ required: false, description: 'Tanggal Pinjam (ISO string)' })
    @IsOptional()
    @IsDateString()
    tglPinjam?: string;

    @ApiProperty({ required: false, description: 'Angsuran Tetap' })
    @IsOptional()
    @IsNumber()
    angsuranTetap?: number;

    @ApiProperty({ required: false, description: 'Nilai Pinjaman' })
    @IsOptional()
    @IsNumber()
    nilaiPinjaman?: number;

    @ApiProperty({ required: false, description: 'Suku Bunga (%)' })
    @IsOptional()
    @IsNumber()
    sukuBungaPct?: number;

    @ApiProperty({ required: false, description: 'Saldo Pinjaman' })
    @IsOptional()
    @IsNumber()
    saldoPinjaman?: number;

    @ApiProperty({ required: false, description: 'Status Kredit (LANCAR/MACET/dll)' })
    @IsOptional()
    @IsString()
    statusKredit?: string;

    @ApiProperty({ required: false, description: 'Tujuan' })
    @IsOptional()
    @IsString()
    tujuan?: string;

    @ApiProperty({ required: false, description: 'Kategori (PRODUKTIF/KONSUMTIF/etc)' })
    @IsOptional()
    @IsString()
    kategori?: string;

    @ApiProperty({ required: false, description: 'Keterangan' })
    @IsOptional()
    @IsString()
    keterangan?: string;

    @ApiProperty({ required: false, description: 'UGL' })
    @IsOptional()
    @IsString()
    ugl?: string;

    @ApiProperty({ required: false, description: 'Sep-25 data' })
    @IsOptional()
    @IsString()
    sep25?: string;
}
