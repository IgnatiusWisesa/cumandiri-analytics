import { Controller, Get, Post, Body, Query, UseInterceptors, UploadedFile, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DataAnggotaService } from './data-anggota.service';
import { CreateDataAnggotaDto } from './dto/create-pinjaman.dto';
import { UploadExcelDto } from './dto/upload-excel.dto';
import { Response } from 'express';

@ApiTags('data-anggota')
@Controller('data-anggota')
export class DataAnggotaController {
    constructor(private readonly service: DataAnggotaService) {}

    @Get()
    @ApiOperation({ summary: 'List Data Anggota' })
    @ApiOkResponse({ description: 'OK' })
    findAll(
        @Query('limit') limit = 100,
        @Query('skip') skip = 0,
        @Query('nama') nama?: string,
    ) {
        const filter: any = {};
        if (nama) filter.nama = { $regex: new RegExp(nama, 'i') };
        return this.service.findAll(filter, Number(limit), Number(skip));
    }

    @Post()
    @ApiOperation({ summary: 'Create/Upsert satu anggota' })
    createOne(@Body() dto: CreateDataAnggotaDto) {
        return this.service.createOne(dto);
    }

    @Post('upload')
    @ApiOperation({ summary: 'Upload Excel untuk populate Data Anggota (bulk upsert)' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: UploadExcelDto })
    @UseInterceptors(FileInterceptor('file'))
    async uploadExcel(
        @UploadedFile() file: Express.Multer.File,
        @Query('sheet') sheet?: string,
    ) {
        // console.log('[UPLOAD] hit'); 
        // console.log('[UPLOAD] sheet =', sheet);
        // console.log('[UPLOAD] file?', !!file, file?.originalname, file?.mimetype, file?.size);

        if (!file) {
            console.log('No file received');
            return { parsed: 0, matched: 0, modified: 0, upserted: 0, failed: 1, reason: 'No file received' };
        }

        const buffer = file.buffer ?? (file.path ? require('fs').readFileSync(file.path) : undefined);
        if (!buffer) {
            console.log('No file buffer available');
            return { parsed: 0, matched: 0, modified: 0, upserted: 0, failed: 1, reason: 'No file buffer' };
        }

        const rows = this.service.parseExcel(file.buffer, sheet);

        // console.log(`[UPLOAD] Parsed ${rows.length} rows from Excel file.`);
        // console.log(`Parsed ${rows.length} rows from Excel file.`);
        // console.log('First row:', rows[0]);

        const res = await this.service.bulkUpsert(rows);
        return { parsed: rows.length, ...res };
    }

    @Get('analytics')
    @ApiOperation({ summary: 'Analitik usia & profesi per TP' })
    @ApiOkResponse({ description: 'OK' })
    getAnalytics() {
    return this.service.getAnalytics();
    }

    @Get('analytics/profesi')
    @ApiOperation({ summary: 'Analitik klasifikasi anggota berdasarkan profesi' })
    @ApiOkResponse({ description: 'OK' })
    async profesiAnalytics() {
        return this.service.getProfessionAnalytics();
    }

    @Get('analytics/export')
    @ApiOperation({ summary: 'Download Excel ANALISA (pakai template chart)' })
    async exportAnalytics(@Res() res: Response) {
    try {
        const buf = await this.service.exportAnalyticsXlsx();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="ANALISA_${new Date().toISOString().slice(0,10)}.xlsx"`);
        res.send(buf);
    } catch (e) {
        console.error('Export error:', e);
        res.status(500).json({ success: false, message: (e as Error).message });
        }
    }

    @Get('new-members/export')
        async exportNew(@Query('years') years = '2025,2024', @Res() res: Response) {
        const buf = await this.service.exportNewMembersXlsx(
            years.split(',').map(s => +s.trim()).filter(Boolean)
        );
        res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition','attachment; filename="ANGGOTA_BARU.xlsx"');
        res.send(buf);
    }

    @Get('profesi-usia')
    @ApiOperation({ summary: 'Klasifikasi PROFESI × USIA (per TP) untuk tabel & chart' })
    @ApiOkResponse({ description: 'OK' })
    @ApiQuery({
    name: 'tahunGabung',
    required: false, // <--- false
    description: 'Filter opsional berdasarkan tahun gabung (mis. 2025)',
    })
    async getProfesiUsia(
        @Query('tahunGabung') tahunGabung?: string,
    ) {
        const year = tahunGabung ? Number(tahunGabung) : undefined;
        return this.service.getProfesiByUsia({ tahunGabung: year });
    }

}
