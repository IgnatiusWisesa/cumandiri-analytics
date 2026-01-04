import {
    BadRequestException,
    Controller,
    Get,
    Post,
    Body,
    Query,
    UseInterceptors,
    UploadedFile,
    DefaultValuePipe,
    ParseIntPipe,
    ParseArrayPipe
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PinjamanService, AgeAnalyticsResponse, UsiaProfesiTujuanResponse } from './pinjaman.service';
import { CreatePinjamanDto } from './dto/create-pinjaman.dto';
import { PinjamanFilterDto, ProfesiPerTPResp, ProfesiVsTujuanResp } from './dto/pinjaman-analytics.dto';

@ApiTags('pinjaman')
@Controller('pinjaman')
export class PinjamanController {
    constructor(private readonly service: PinjamanService) { }

    @Get()
    @ApiOperation({ summary: 'List data pinjaman' })
    @ApiQuery({ name: 'limit', required: false, type: Number, example: 100 })
    @ApiQuery({ name: 'skip', required: false, type: Number, example: 0 })
    @ApiQuery({ name: 'noAgt', required: false, type: String })
    findAll(
        @Query('limit', new DefaultValuePipe(100), new ParseIntPipe({ errorHttpStatusCode: 400 })) limit: number,
        @Query('skip', new DefaultValuePipe(0), new ParseIntPipe({ errorHttpStatusCode: 400 })) skip: number,
        @Query('noAgt') noAgt?: string,
    ) {
        const MAX_LIMIT = 1000;
        const safeLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
        const safeSkip = Math.max(skip, 0);
        const filter: any = {};
        if (noAgt) filter.noAgt = String(noAgt).trim();
        return this.service.findAll(filter, safeLimit, safeSkip);
    }

    @Post()
    @ApiOperation({ summary: 'Create/Upsert satu pinjaman' })
    createOne(@Body() dto: CreatePinjamanDto) {
        if (!dto.noRek) throw new BadRequestException('noRek wajib diisi');
        return this.service.createOne(dto);
    }

    @Post('upload')
    @ApiOperation({ summary: 'Upload Excel untuk populate Pinjaman (bulk upsert)' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
            },
            required: ['file'],
        },
    })
    @UseInterceptors(FileInterceptor('file', {
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            const ok =
                ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
                    .includes(file.mimetype) || /\.xlsx?$/i.test(file.originalname);
            cb(ok ? null : new BadRequestException('File harus .xls/.xlsx'), ok);
        },
    }))
    async uploadExcel(
        @UploadedFile() file: Express.Multer.File,
        @Query('sheet') sheet?: string,
    ) {
        if (!file?.buffer) throw new BadRequestException('File tidak ditemukan atau kosong');
        const rows = this.service.parseExcel(file.buffer, sheet);
        const res = await this.service.bulkUpsert(rows);
        return { parsed: rows.length, ...res };
    }

    @Get('analytics/usia')
    @ApiOperation({ summary: 'Klasifikasi usia peminjam per TP' })
    @ApiQuery({ name: 'year', required: false, type: Number, description: 'Filter tahun tglPinjam (YYYY)' })
    @ApiQuery({
        name: 'tp',
        required: false,
        type: [String],
        description: 'Filter TP (multi). Contoh: ?tp=PBL&tp=KRK',
    })
    @ApiQuery({ name: 'produk', required: false, type: String })
    @ApiQuery({ name: 'cabang', required: false, type: String })
    async getAgeAnalytics(
        @Query('year') year?: number,
        @Query('tp', new DefaultValuePipe([]), new ParseArrayPipe({ items: String, optional: true })) tp?: string[],
        @Query('produk') produk?: string,
        @Query('cabang') cabang?: string,
    ): Promise<AgeAnalyticsResponse> {
        return this.service.getAgeAnalytics({
            year: year ? Number(year) : undefined,
            tp: tp?.length ? tp : undefined,
            produk,
            cabang,
        });
    }

    @Get('analytics/usia-vs-tujuan')
    @ApiOperation({ summary: 'Klasifikasi usia dibanding tujuan pinjaman' })
    @ApiQuery({ name: 'year', required: false, type: Number, description: 'Filter tahun (berdasar tglPinjam)' })
    @ApiQuery({ name: 'tp', required: false, isArray: true, type: String, description: 'Filter TP (multi): ?tp=PBL&tp=KRK' })
    @ApiQuery({ name: 'produk', required: false, type: String })
    @ApiQuery({ name: 'cabang', required: false, type: String })
    async getAgeVsPurpose(
        @Query('year') year?: string,
        @Query('tp') tp?: string[] | string,
        @Query('produk') produk?: string,
        @Query('cabang') cabang?: string,
    ) {
        const tpArr = Array.isArray(tp) ? tp : (tp ? [tp] : undefined);
        return this.service.getAgeVsPurpose({
            year: year ? Number(year) : undefined,
            tp: tpArr,
            produk,
            cabang,
        });
    }

    // === Tabel 1: Profesi × Tujuan Pinjaman ===
    @Get('analytics/profesi-vs-tujuan')
    @ApiOperation({ summary: 'Klasifikasi PROFESI dibanding TUJUAN PINJAMAN' })
    @ApiOkResponse({ type: ProfesiVsTujuanResp })
    @ApiQuery({ name: 'year', required: false, type: Number, description: 'Filter tahun tglPinjam (YYYY)' })
    @ApiQuery({ name: 'tp', required: false, type: String, isArray: true, description: 'Filter TP (multi)' })
    @ApiQuery({ name: 'produk', required: false, type: String })
    @ApiQuery({ name: 'cabang', required: false, type: String })
    getProfesiVsTujuan(@Query() q: PinjamanFilterDto) {
        return this.service.getProfesiVsTujuan(q);
    }

    @Get('analytics/tujuan-pembayaran')
    @ApiOperation({ summary: 'Klasifikasi Tujuan Pinjaman vs Kategori Pembayaran Angsuran' })
    @ApiQuery({ name: 'year', required: false, type: Number })
    @ApiQuery({ name: 'tp', required: false, isArray: true, type: String })
    getTujuanPembayaran(@Query() q: PinjamanFilterDto) {
        return this.service.getTujuanPembayaran(q);
    }

    // === Tabel 2: Profesi peminjam per TP ===
    @Get('analytics/profesi-per-tp')
    @ApiOperation({ summary: 'Klasifikasi PROFESI PEMINJAM per TP (dengan kolom GAB)' })
    @ApiOkResponse({ type: ProfesiPerTPResp })
    @ApiQuery({ name: 'year', required: false, type: Number, description: 'Filter tahun tglPinjam (YYYY)' })
    @ApiQuery({ name: 'tp', required: false, type: String, isArray: true, description: 'Filter TP (multi)' })
    @ApiQuery({ name: 'produk', required: false, type: String })
    @ApiQuery({ name: 'cabang', required: false, type: String })
    getProfesiPerTP(@Query() q: PinjamanFilterDto) {
        return this.service.getProfesiPerTP(q);
    }

    @Get('analytics/usia-profesi-tujuan')
    @ApiOperation({ summary: 'Klasifikasi USIA × PROFESI × TUJUAN PINJAMAN (6 kategori baku)' })
    @ApiQuery({ name: 'year', required: false, type: Number })
    @ApiQuery({ name: 'tp', required: false, isArray: true, type: String })
    @ApiQuery({ name: 'produk', required: false, type: String })
    @ApiQuery({ name: 'cabang', required: false, type: String })
    async getUsiaProfesiTujuan(
        @Query('year') year?: string,
        @Query('tp') tp?: string[] | string,
        @Query('produk') produk?: string,
        @Query('cabang') cabang?: string,
    ) {
        const tpArr = Array.isArray(tp) ? tp : (tp ? [tp] : undefined);
        return this.service.getUsiaProfesiTujuan({
            year: year ? Number(year) : undefined,
            tp: tpArr, produk, cabang,
        });
    }

}