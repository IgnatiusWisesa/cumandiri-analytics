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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { KreditService, AgeAnalyticsResponse } from './kredit.service';
import { CreateKreditDto } from './dto/create-kredit.dto';

@ApiTags('kredit')
@Controller('kredit')
export class KreditController {
    constructor(private readonly service: KreditService) { }

    @Get()
    @ApiOperation({ summary: 'List data kredit' })
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
    @ApiOperation({ summary: 'Create/Upsert satu kredit' })
    createOne(@Body() dto: CreateKreditDto) {
        if (!dto.noRek) throw new BadRequestException('noRek wajib diisi');
        return this.service.createOne(dto);
    }

    @Post('upload')
    @ApiOperation({ summary: 'Upload Excel untuk populate Kredit (bulk upsert)' })
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
    @UseInterceptors(
        FileInterceptor('file', {
            limits: { fileSize: 10 * 1024 * 1024 },
            fileFilter: (_req, file, cb) => {
                const ok =
                    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'].includes(
                        file.mimetype,
                    ) || /\.xlsx?$/i.test(file.originalname);
                cb(ok ? null : new BadRequestException('File harus .xls/.xlsx'), ok);
            },
        }),
    )
    async uploadExcel(@UploadedFile() file: Express.Multer.File, @Query('sheet') sheet?: string) {
        if (!file?.buffer) throw new BadRequestException('File tidak ditemukan atau kosong');
        const rows = this.service.parseExcel(file.buffer, sheet);
        const res = await this.service.bulkUpsert(rows);
        return { parsed: rows.length, ...res };
    }

    @Get('analytics/usia')
    @ApiOperation({ summary: 'Klasifikasi usia kredit per TP (dengan join ke data_anggota)' })
    @ApiQuery({ name: 'year', required: false, type: Number, description: 'Filter tahun tglPinjam (YYYY)' })
    @ApiQuery({ name: 'tp', required: false, type: [String], description: 'Filter TP (multi)' })
    @ApiQuery({ name: 'kategori', required: false, type: String })
    @ApiQuery({ name: 'ugl', required: false, type: String })
    async getAgeAnalytics(
        @Query('year') year?: number,
        @Query('tp') tp?: string[],
        @Query('kategori') kategori?: string,
        @Query('ugl') ugl?: string,
    ): Promise<AgeAnalyticsResponse> {
        return this.service.getAgeAnalytics({
            year: year ? Number(year) : undefined,
            tp: tp?.length ? tp : undefined,
            kategori,
            ugl,
        });
    }

    @Get('analytics/usia-profesi-tujuan')
    @ApiOperation({ summary: 'Klasifikasi USIA × PROFESI × TUJUAN KREDIT' })
    @ApiQuery({ name: 'year', required: false, type: Number })
    @ApiQuery({ name: 'tp', required: false, isArray: true, type: String })
    @ApiQuery({ name: 'kategori', required: false, type: String })
    @ApiQuery({ name: 'ugl', required: false, type: String })
    async getUsiaProfesiTujuan(
        @Query('year') year?: string,
        @Query('tp') tp?: string[] | string,
        @Query('kategori') kategori?: string,
        @Query('ugl') ugl?: string,
    ) {
        const tpArr = Array.isArray(tp) ? tp : tp ? [tp] : undefined;
        return this.service.getUsiaProfesiTujuan({
            year: year ? Number(year) : undefined,
            tp: tpArr,
            kategori,
            ugl,
        });
    }

    @Get('analytics/profesi-tp')
    @ApiOperation({ summary: 'Klasifikasi PROFESI KREDIT per TP' })
    @ApiQuery({ name: 'year', required: false, type: Number })
    @ApiQuery({ name: 'tp', required: false, isArray: true, type: String })
    @ApiQuery({ name: 'ugl', required: false, type: String })
    async getProfesiPerTP(
        @Query('year') year?: string,
        @Query('tp') tp?: string[] | string,
        @Query('ugl') ugl?: string,
    ) {
        const tpArr = Array.isArray(tp) ? tp : tp ? [tp] : undefined;
        return this.service.getProfesiPerTP({
            year: year ? Number(year) : undefined,
            tp: tpArr,
            ugl,
        });
    }

    @Get('analytics/usia-status')
    @ApiOperation({ summary: 'Klasifikasi USIA KREDIT per TP dengan Status' })
    @ApiQuery({ name: 'year', required: false, type: Number })
    @ApiQuery({ name: 'tp', required: false, isArray: true, type: String })
    @ApiQuery({ name: 'ugl', required: false, type: String })
    async getUsiaWithStatus(
        @Query('year') year?: string,
        @Query('tp') tp?: string[] | string,
        @Query('ugl') ugl?: string,
    ) {
        const tpArr = Array.isArray(tp) ? tp : tp ? [tp] : undefined;
        return this.service.getAgeAnalyticsWithStatus({
            year: year ? Number(year) : undefined,
            tp: tpArr,
            ugl,
        });
    }

    @Get('analytics/profesi-tp-status')
    @ApiOperation({ summary: 'Klasifikasi PROFESI KREDIT per TP dengan Status' })
    @ApiQuery({ name: 'year', required: false, type: Number })
    @ApiQuery({ name: 'tp', required: false, isArray: true, type: String })
    @ApiQuery({ name: 'ugl', required: false, type: String })
    async getProfesiPerTPWithStatus(
        @Query('year') year?: string,
        @Query('tp') tp?: string[] | string,
        @Query('ugl') ugl?: string,
    ) {
        const tpArr = Array.isArray(tp) ? tp : tp ? [tp] : undefined;
        return this.service.getProfesiPerTPWithStatus({
            year: year ? Number(year) : undefined,
            tp: tpArr,
            ugl,
        });
    }
}
