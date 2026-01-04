import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SimpananService } from './simpanan.service';
import { CreateSimpananBerjangkaDto } from './dto/create-simpanan-berjangka.dto';
import { JenisSimpanan } from './schema/simpanan.types';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsiaProfesiSimpananQueryDto, UsiaProfesiSimpananResponse } from './dto/simpanan-berjangka.dto';

const TP_ORDER = ['PBL', 'KRK', 'JBR', 'BWI', 'MJK', 'MGL', 'PML'] as const;
type TpKey = (typeof TP_ORDER)[number];

@ApiTags('simpanan-berjangka')
@Controller('simpanan-berjangka')
export class SimpananController {
  constructor(private readonly service: SimpananService) {}

  // ---------- LIST BASIC ----------
  @Get()
  @ApiOperation({ summary: 'List data simpanan berjangka' })
  @ApiOkResponse({ description: 'OK' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({
    name: 'jenis',
    required: false,
    enum: ['SJTA', 'SSKA', 'SMP', 'SPJ'],
  })
  @ApiQuery({ name: 'tp', required: false, type: String })
  @ApiQuery({
    name: 'tanggalLaporan',
    required: false,
    type: String,
    description: 'ISO date, mis. 2025-09-30',
  })
  async findAll(
    @Query('limit') limit = 100,
    @Query('skip') skip = 0,
    @Query('jenis') jenis?: JenisSimpanan,
    @Query('tp') tp?: string,
    @Query('tanggalLaporan') tanggalLaporan?: string,
  ) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    const safeSkip = Math.max(Number(skip) || 0, 0);

    const filter: {
      jenis?: JenisSimpanan;
      tp?: string;
      tanggalLaporan?: Date;
    } = {};

    if (jenis) filter.jenis = jenis;
    if (tp) filter.tp = tp.trim();
    if (tanggalLaporan) filter.tanggalLaporan = new Date(tanggalLaporan);

    return this.service.findAll(filter, safeLimit, safeSkip);
  }

  // ---------- CREATE / UPSERT SATU ----------
  @Post()
  @ApiOperation({ summary: 'Create / upsert satu simpanan berjangka' })
  async createOne(@Body() dto: CreateSimpananBerjangkaDto) {
    return this.service.createOrUpdate(dto);
  }

  // ---------- BULK UPLOAD EXCEL ----------
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiQuery({
    name: 'sheet',
    required: true,
    enum: ['SJTA', 'SSKA', 'SMP', 'SPJ'],
    description: 'Kode jenis simpanan (SJTA/SSKA/SMP/SPJ)',
  })
  @ApiQuery({
    name: 'tanggalLaporan',
    required: true,
    type: String,
    description: 'Tanggal laporan, mis. 2025-09-30',
  })
  @ApiQuery({
    name: 'tp',
    required: false,
    type: String,
    description: 'Kode TP (optional, kalau mau di-tag per TP)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async uploadSimpanan(
    @Query('sheet') sheet: JenisSimpanan,
    @Query('tanggalLaporan') tanggalLaporan: string,
    @Query('tp') tp: string | undefined,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const tgl = new Date(tanggalLaporan);
    return this.service.uploadExcel(
      { jenis: sheet, tanggalLaporan: tgl, tp },
      file,
    );
  }

  // =============== ANALYTICS 1: USIA vs JENIS ===============
  @Get('analytics/usia')
  @ApiOperation({ summary: 'Klasifikasi simpanan berjangka dibanding usia (per jenis)' })
  @ApiOkResponse({ description: 'OK' })
  @ApiQuery({
    name: 'jenis',
    required: false,
    enum: ['SJTA', 'SSKA', 'SMP', 'SPJ'],
  })
  @ApiQuery({ name: 'tp', required: false, type: String })
  @ApiQuery({
    name: 'tanggalLaporan',
    required: false,
    type: String,
    description: 'ISO date, mis. 2025-09-30',
  })
  async getAnalyticsUsia(
    @Query('jenis') jenis?: JenisSimpanan,
    @Query('tp') tp?: string,
    @Query('tanggalLaporan') tanggalLaporan?: string,
  ) {
    const filter: {
      jenis?: JenisSimpanan;
      tp?: string;
      tanggalLaporan?: Date;
    } = {};

    if (jenis) filter.jenis = jenis;
    if (tp) filter.tp = tp.trim();
    if (tanggalLaporan) filter.tanggalLaporan = new Date(tanggalLaporan);

    return this.service.getAnalyticsUsia(filter);
  }

  // =============== ANALYTICS 2: PROFESI vs JENIS ===============
  @Get('analytics/profesi')
  @ApiOperation({ summary: 'Klasifikasi simpanan berjangka dibanding profesi (per jenis)' })
  @ApiOkResponse({ description: 'OK' })
  @ApiQuery({
    name: 'jenis',
    required: false,
    enum: ['SJTA', 'SSKA', 'SMP', 'SPJ'],
    description: 'Filter salah satu jenis simpanan (opsional)',
  })
  @ApiQuery({
    name: 'tp',
    required: false,
    type: String,
    description: 'Filter TP (opsional, diambil dari data_anggota.tp)',
  })
  @ApiQuery({
    name: 'tanggalLaporan',
    required: false,
    type: String,
    description: 'ISO date, mis. 2025-09-30 (opsional tapi disarankan)',
  })
  async getProfesiAnalytics(
    @Query('jenis') jenis?: JenisSimpanan,
    @Query('tp') tp?: string,
    @Query('tanggalLaporan') tanggalLaporan?: string,
  ) {
    const filter: {
      jenis?: JenisSimpanan;
      tp?: string;
      tanggalLaporan?: Date;
    } = {};

    if (jenis) filter.jenis = jenis;
    if (tp) filter.tp = tp.trim();
    if (tanggalLaporan) {
      const d = new Date(tanggalLaporan);
      if (!isNaN(d.getTime())) filter.tanggalLaporan = d;
    }

    return this.service.getProfesiAnalytics(filter);
  }

  // =============== ANALYTICS 3: USIA vs TP (boleh filter jenis) ===============
  @Get('analytics/usia-tp')
  @ApiOperation({
    summary: 'Klasifikasi simpanan berjangka dibanding usia per TP',
  })
  @ApiOkResponse({ description: 'OK' })
  @ApiQuery({
    name: 'jenis',
    required: false,
    enum: ['SJTA', 'SSKA', 'SMP', 'SPJ'],
  })
  @ApiQuery({
    name: 'tanggalLaporan',
    required: false,
    type: String,
    description: 'ISO date, mis. 2025-09-30',
  })
  @ApiQuery({
    name: 'tp',
    required: false,
    type: String,
    description: 'Daftar TP, pisah koma. Contoh: PBL,KRK,JBR',
  })
  async getUsiaPerTP(
    @Query('jenis') jenis?: JenisSimpanan,
    @Query('tanggalLaporan') tanggalLaporan?: string,
    @Query('tp') tp?: string,
  ) {
    const filter: { jenis?: JenisSimpanan; tanggalLaporan?: Date; tp?: TpKey[] } = {};

    if (jenis) filter.jenis = jenis;
    if (tanggalLaporan) {
      const d = new Date(tanggalLaporan);
      if (!isNaN(d.getTime())) {
        filter.tanggalLaporan = d;
      }
    }

    if (tp) {
      filter.tp = tp
        .split(',')
        .map((x) => x.trim().toUpperCase())
        .filter((x): x is TpKey =>
          (TP_ORDER as readonly string[]).includes(x),
        );
    }

    return this.service.getUsiaPerTP(filter);
  }

  // =============== ANALYTICS 4: PROFESI vs TP (boleh filter jenis) ===============
  @Get('analytics/profesi-tp')
  @ApiOperation({
    summary: 'Klasifikasi profesi pengguna simpanan per TP',
  })
  @ApiOkResponse({ description: 'OK' })
  @ApiQuery({
    name: 'jenis',
    required: false,
    enum: ['SJTA', 'SSKA', 'SMP', 'SPJ'],
  })
  @ApiQuery({
    name: 'tanggalLaporan',
    required: false,
    type: String,
    description: 'ISO date, mis. 2025-09-30',
  })
  @ApiQuery({
    name: 'tp',
    required: false,
    type: String,
    description: 'Comma-separated list TP, mis. PBL,KRK (opsional)',
  })
  async getProfesiPerTP(
    @Query('jenis') jenis?: JenisSimpanan,
    @Query('tanggalLaporan') tanggalLaporan?: string,
    @Query('tp') tp?: string,
  ) {
    const filter: {
      jenis?: JenisSimpanan;
      tanggalLaporan?: Date;
      tp?: TpKey[];
    } = {};

    if (jenis) filter.jenis = jenis;
    if (tanggalLaporan) {
      const d = new Date(tanggalLaporan);
      if (!isNaN(d.getTime())) filter.tanggalLaporan = d;
    }
    if (tp) {
      filter.tp = tp
        .split(',')
        .map((x) => x.trim().toUpperCase())
        .filter((x) => (TP_ORDER as readonly string[]).includes(x)) as TpKey[];
    }

    return this.service.getProfesiPerTPForSimpanan(filter);
  }

    @Get('analytics/usia-profesi')
    @ApiOperation({
        summary: 'Klasifikasi usia, profesi, dan simpanan',
        description:
        'Mengembalikan rekap simpanan berjangka yang dikelompokkan berdasarkan bucket usia dan profesi, ' +
        'dengan kolom SISUKA, SUJATRA, SIPIJAR, dan SIMAPAN.',
    })
    @ApiQuery({
        name: 'tp',
        required: false,
        description: 'Filter berdasarkan TP (mis. PBL, KRK, dst)',
        example: 'PBL',
    })
    @ApiQuery({
        name: 'tahunBuka',
        required: false,
        description: 'Filter berdasarkan tahun pembukaan simpanan (tglBuka)',
        example: '2024',
    })
    @ApiOkResponse({
        description: 'Rekap usia × profesi × simpanan',
        // kalau nanti kamu ubah response ke class DTO, bisa pakai:
        // type: UsiaProfesiSimpananResponseDto,
    })
    async getUsiaProfesiSimpanan(
        @Query() query: UsiaProfesiSimpananQueryDto,
    ): Promise<UsiaProfesiSimpananResponse> {
        return this.service.getUsiaProfesiSimpanan(query);
    }
}
