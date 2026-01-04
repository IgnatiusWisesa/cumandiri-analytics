import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery, PipelineStage } from 'mongoose';
import {
  SimpananBerjangka,
  SimpananBerjangkaDocument,
} from './schema/simpanan.schema';
import { CreateSimpananBerjangkaDto } from './dto/create-simpanan-berjangka.dto';
import { JenisSimpanan } from '../simpanan/schema/simpanan.types';
import * as XLSX from 'xlsx';
import { JENIS_TO_KOLOM, KolomSimpananKey } from './constant/simpanan-berjangka.constants';
import { UsiaBucket, UsiaProfesiSimpananQueryDto, UsiaProfesiSimpananResponse } from './dto/simpanan-berjangka.dto';

const AGE_BUCKETS = ['<24 th', '24-35 th', '36-45 th', '46-60 th', '>60 th', 'Tidak Valid'] as const;
const USIA_ORDER = ['<24 Th', '24 - 35 Th', '36 - 45 Th', '46 - 60 Th', '> 60 Th'];
type AgeBucketKey = (typeof AGE_BUCKETS)[number];

// sesuaikan dengan enum JenisSimpanan kamu
const JENIS_LIST: JenisSimpanan[] = ['SJTA', 'SSKA', 'SMP', 'SPJ'] as JenisSimpanan[];

const TP_ORDER = ['PBL','KRK','JBR','BWI','MJK','MGL','PML'] as const;
type TpKey = (typeof TP_ORDER)[number];

type UsiaPerTPRow = {
  usia: string;
  perTP: Record<TpKey, number>;
  total: number;
  persen: number;
};

type ProfesiPerTPRow = {
  profesi: string;
  perTP: Record<TpKey, number>;
  total: number;
  persen: number;
};

type PerTPBaseResp<Row> = {
  tps: TpKey[];
  totalAll: number;
  totalsPerTP: Record<TpKey, number>;
  rows: Row[];
};

export type SimpananProfesiRow = {
  profesi: string;
  perJenis: Record<JenisSimpanan, number>;
  total: number;
  persen: number;
};

export type SimpananProfesiAnalyticsResp = {
  jenisList: JenisSimpanan[];
  totalAll: number;
  totalsPerJenis: Record<JenisSimpanan, number>;
  rows: SimpananProfesiRow[];
};

function ageBucketFromAge(age: number | null | undefined): AgeBucketKey {
  if (age == null || isNaN(age as any)) return 'Tidak Valid';
  if (age < 24) return '<24 th';
  if (age <= 35) return '24-35 th';
  if (age <= 45) return '36-45 th';
  if (age <= 60) return '46-60 th';
  return '>60 th';
}

function diffYear(dob?: Date | null, ref?: Date | null): number | null {
  if (!dob) return null;
  const r = ref ?? new Date();
  let age = r.getFullYear() - dob.getFullYear();
  const m = r.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && r.getDate() < dob.getDate())) age--;
  return age;
}

@Injectable()
export class SimpananService {
  constructor(
    @InjectModel(SimpananBerjangka.name)
    private readonly model: Model<SimpananBerjangkaDocument>,
  ) {}

  /** Helper: konversi DTO -> payload untuk Mongo */
  private dtoToPayload(
    dto: CreateSimpananBerjangkaDto,
  ): Partial<SimpananBerjangka> {
    const trimOrUndef = (v?: string) =>
      v && v.trim().length > 0 ? v.trim() : undefined;

    return {
      jenis: dto.jenis,
      tp: dto.tp.trim(),
      noRek: dto.noRek.trim(),
      noAnggota: trimOrUndef(dto.noAnggota),
      kodeAnggota: trimOrUndef(dto.kodeAnggota),
      tglBuka: new Date(dto.tglBuka),
      jangkaWaktuBulan: dto.jangkaWaktuBulan,
      saldoMinimum: dto.saldoMinimum,
      bungaPersen: dto.bungaPersen,
      transaksiTerakhir: dto.transaksiTerakhir
        ? new Date(dto.transaksiTerakhir)
        : undefined,
      perpanjangOtomatis: dto.perpanjangOtomatis,
      tanggalLaporan: new Date(dto.tanggalLaporan),
      saldo: dto.saldo,
      sumberFile: trimOrUndef(dto.sumberFile),
    };
  }

  async createOrUpdate(dto: CreateSimpananBerjangkaDto) {
    const payload = this.dtoToPayload(dto);

    const key = {
      jenis: dto.jenis,
      noRek: dto.noRek.trim(),
      tanggalLaporan: new Date(dto.tanggalLaporan),
    };

    await this.model.updateOne(key, { $set: payload }, { upsert: true });

    return this.model.findOne(key).lean();
  }

  async findAll(
    filter: {
      jenis?: JenisSimpanan;
      tp?: string;
      tanggalLaporan?: Date;
    } = {},
    limit = 100,
    skip = 0,
  ) {
    const q: FilterQuery<SimpananBerjangkaDocument> = {};

    if (filter.jenis) q.jenis = filter.jenis;
    if (filter.tp) q.tp = filter.tp;
    if (filter.tanggalLaporan) q.tanggalLaporan = filter.tanggalLaporan;

    return this.model
      .find(q)
      .limit(limit)
      .skip(skip)
      .sort({ tp: 1, noRek: 1 })
      .lean();
  }

    async uploadExcel(
        meta: { jenis: JenisSimpanan; tanggalLaporan: Date; tp?: string },
        file: Express.Multer.File,
        ) {
        if (!file) throw new BadRequestException('File is required');

        const wb = XLSX.read(file.buffer, { type: 'buffer' });
        const ws = wb.Sheets[meta.jenis]; // sheet = SJTA / SSKA / SMP / SPJ
        if (!ws)
            throw new BadRequestException(`Sheet ${meta.jenis} not found in Excel`);

        const rows = XLSX.utils.sheet_to_json<any[]>(ws, {
            header: 1,
            raw: true,
            defval: null,
        }) as any[][];

        if (!rows.length) {
            return { success: true, count: 0, sheet: meta.jenis };
        }

        const norm = (v: any) =>
            String(v ?? '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();

        const headerKeywords = [
            'id',
            'no anggota',
            'no. anggota',
            'no rek',
            'tgl buka',
            'jangka waktu',
            'saldo minimum',
            'bunga',
            'transaksi terakhir',
            'saldo per',
        ];

        let headerIdx = -1;
        for (let i = 0; i < rows.length; i++) {
            const line = rows[i].map(norm);
            const hits = headerKeywords.filter((k) =>
            line.some((c) => c.includes(k)),
            ).length;
            if (hits >= 4) {
            headerIdx = i;
            break;
            }
        }

        if (headerIdx < 0) {
            throw new BadRequestException(
            'Header tabel simpanan tidak ditemukan. Cek template Excel.',
            );
        }

        const header = rows[headerIdx].map(norm);

        const findCol = (...cands: string[]) =>
            header.findIndex((h) =>
            cands.some((c) => h === c || h.startsWith(c)),
            );

        const cId = findCol('id');
        const cNoAnggota = findCol('no anggota', 'no. anggota');
        const cNoRek = findCol('no rek', 'no. rek');
        const cTglBuka = findCol('tgl buka');
        const cJangka = findCol('jangka waktu');
        const cSaldoMin = findCol('saldo minimum');
        const cBunga = findCol('bunga');
        const cTransLast = findCol('transaksi terakhir');
        const cSaldo = findCol('saldo per');

        if (cId < 0 || cNoRek < 0 || cSaldo < 0) {
            throw new BadRequestException(
            'Kolom ID / No. Rek / Saldo tidak lengkap di header.',
            );
        }

        const dataRows = rows.slice(headerIdx + 1);

        // mapping ke dokumen
        const mapped = dataRows
            .filter((r) => r[cId] != null && r[cId] !== '')
            .map((r) => {
            const tglBuka = cTglBuka >= 0 ? this.excelToDate(r[cTglBuka]) : null;
            const tLast =
                cTransLast >= 0 ? this.excelToDate(r[cTransLast]) : null;

            return {
                jenis: meta.jenis,
                tp: meta.tp?.trim(),
                noRek: String(r[cNoRek]).trim(),
                noAnggota:
                cNoAnggota >= 0 && r[cNoAnggota] != null
                    ? String(r[cNoAnggota]).trim()
                    : undefined,
                kodeAnggota: undefined,
                tglBuka: tglBuka ?? undefined,
                jangkaWaktuBulan:
                cJangka >= 0 && r[cJangka] != null
                    ? Number(r[cJangka])
                    : undefined,
                saldoMinimum:
                cSaldoMin >= 0 && r[cSaldoMin] != null
                    ? Number(r[cSaldoMin])
                    : 0,
                bungaPersen:
                cBunga >= 0 && r[cBunga] != null ? Number(r[cBunga]) : 0,
                transaksiTerakhir: tLast ?? undefined,
                tanggalLaporan: meta.tanggalLaporan,
                saldo: Number(r[cSaldo]),
                sumberFile: file.originalname,
            } as Partial<SimpananBerjangka>;
            });

        if (!mapped.length) {
            return { success: true, count: 0, sheet: meta.jenis };
        }

        console.log(
            '[Simpanan upload] collection =',
            this.model.collection.collectionName,
            'docs =',
            mapped.length,
        );

        // 🔴 Ganti bulkWrite → loop updateOne (upsert)
        let matched = 0;
        let modified = 0;
        let upserted = 0;

        for (const doc of mapped) {
            const res: any = await this.model.updateOne(
            {
                jenis: doc.jenis,
                noRek: doc.noRek,
                tanggalLaporan: doc.tanggalLaporan,
            },
            { $set: doc },
            { upsert: true },
            );

            matched += res.matchedCount ?? 0;
            modified += res.modifiedCount ?? 0;
            upserted += res.upsertedCount ?? (res.upserted ? 1 : 0);
        }

        console.log(
            '[Simpanan upload] done: matched =',
            matched,
            ', modified =',
            modified,
            ', upserted =',
            upserted,
        );

        return {
            success: true,
            count: mapped.length,
            sheet: meta.jenis,
            matched,
            modified,
            upserted,
        };
        }

    // ====================== ANALYTICS USIA ======================

  async getAnalyticsUsia(filter: {
    jenis?: JenisSimpanan;
    tp?: string;
    tanggalLaporan?: Date;
  } = {}) {
    const match: any = {};
    if (filter.jenis) match.jenis = filter.jenis;
    if (filter.tp) match.tp = filter.tp;
    if (filter.tanggalLaporan) match.tanggalLaporan = filter.tanggalLaporan;

    const pipeline: any[] = [
      { $match: match },
      {
        $lookup: {
          from: 'data_anggota',
          localField: 'noAnggota',    // asumsi: simpanan.noAnggota == data_anggota.noAgt
          foreignField: 'noAgt',
          as: 'anggota',
        },
      },
      { $unwind: { path: '$anggota', preserveNullAndEmptyArrays: true } },
    ];

    type Doc = {
      jenis: JenisSimpanan;
      anggota?: {
        usia?: number | null;
        tglLahir?: Date | null;
      };
    };

    const docs = (await this.model.aggregate(pipeline)) as Doc[];

    const byBucket = new Map<
      AgeBucketKey,
      { perJenis: Record<string, number>; total: number }
    >();

    for (const d of docs) {
      const usiaNum =
        d.anggota?.usia ??
        diffYear(d.anggota?.tglLahir ?? null, filter.tanggalLaporan ?? null);
      const bucket = ageBucketFromAge(usiaNum);

      if (!byBucket.has(bucket)) {
        byBucket.set(bucket, {
          perJenis: Object.fromEntries(JENIS_LIST.map((j) => [j, 0])),
          total: 0,
        });
      }
      const row = byBucket.get(bucket)!;
      row.perJenis[d.jenis] = (row.perJenis[d.jenis] ?? 0) + 1;
      row.total += 1;
    }

    // bentuk output terurut + hitung totalAll & persen
    const rows: {
      usia: AgeBucketKey;
      perJenis: Record<string, number>;
      total: number;
      percent: number;
    }[] = [];

    let totalAll = 0;
    for (const b of AGE_BUCKETS) {
      const row = byBucket.get(b) ?? {
        perJenis: Object.fromEntries(JENIS_LIST.map((j) => [j, 0])),
        total: 0,
      };
      totalAll += row.total;
      rows.push({
        usia: b,
        perJenis: row.perJenis,
        total: row.total,
        percent: 0, // diisi di bawah
      });
    }

    rows.forEach((r) => {
      r.percent = totalAll ? Math.round((r.total / totalAll) * 1000) / 10 : 0; // 1 desimal
    });

    const totalsPerJenis: Record<string, number> = Object.fromEntries(
      JENIS_LIST.map((j) => [
        j,
        rows.reduce((acc, r) => acc + (r.perJenis[j] ?? 0), 0),
      ]),
    );

    return {
      jenisList: JENIS_LIST,
      totalAll,
      totalsPerJenis,
      rows,
    };
  }

  // ====================== ANALYTICS PROFESI ======================

  private excelToDate(val: any): Date | null {
    if (val == null || val === '') return null;

    // kalau sudah Date object
    if (val instanceof Date && !isNaN(+val)) return val;

    // kalau serial excel (number)
    if (typeof val === 'number') {
        const d = XLSX.SSF.parse_date_code(val);
        if (!d || !d.y) return null;
        return new Date(d.y, (d.m || 1) - 1, d.d || 1);
    }

    // string biasa "30/09/2025", "2025-09-30", dll
    const s = String(val).trim();

    let m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2}|\d{4})$/);
    if (m) {
        let y = +m[3];
        if (y < 100) y += y >= 50 ? 1900 : 2000;
        return new Date(y, +m[2] - 1, +m[1]);
    }

    const d2 = new Date(s);
    return isNaN(+d2) ? null : d2;
    }

  async getAnalyticsProfesi(filter: {
    jenis?: JenisSimpanan;
    tp?: string;
    tanggalLaporan?: Date;
  } = {}) {
    const match: any = {};
    if (filter.jenis) match.jenis = filter.jenis;
    if (filter.tp) match.tp = filter.tp;
    if (filter.tanggalLaporan) match.tanggalLaporan = filter.tanggalLaporan;

    const pipeline: any[] = [
      { $match: match },
      {
        $lookup: {
          from: 'data_anggota',
          localField: 'noAnggota',
          foreignField: 'noAgt',
          as: 'anggota',
        },
      },
      { $unwind: { path: '$anggota', preserveNullAndEmptyArrays: true } },
    ];

    type Doc = {
      jenis: JenisSimpanan;
      anggota?: {
        profesi?: string | null;
      };
    };

    const docs = (await this.model.aggregate(pipeline)) as Doc[];

    const byProfesi = new Map<
      string,
      { perJenis: Record<string, number>; total: number }
    >();

    const normProfesi = (p?: string | null): string => {
      const s = (p ?? '').trim();
      return s || 'Kosong';
    };

    for (const d of docs) {
      const profesi = normProfesi(d.anggota?.profesi);

      if (!byProfesi.has(profesi)) {
        byProfesi.set(profesi, {
          perJenis: Object.fromEntries(JENIS_LIST.map((j) => [j, 0])),
          total: 0,
        });
      }

      const row = byProfesi.get(profesi)!;
      row.perJenis[d.jenis] = (row.perJenis[d.jenis] ?? 0) + 1;
      row.total += 1;
    }

    let totalAll = 0;
    const rows = [...byProfesi.entries()]
      .map(([profesi, v]) => {
        totalAll += v.total;
        return {
          profesi,
          perJenis: v.perJenis,
          total: v.total,
          percent: 0,
        };
      })
      .sort((a, b) => b.total - a.total || a.profesi.localeCompare(b.profesi));

    rows.forEach((r) => {
      r.percent = totalAll ? Math.round((r.total / totalAll) * 1000) / 10 : 0;
    });

    const totalsPerJenis: Record<string, number> = Object.fromEntries(
      JENIS_LIST.map((j) => [
        j,
        rows.reduce((acc, r) => acc + (r.perJenis[j] ?? 0), 0),
      ]),
    );

    return {
      jenisList: JENIS_LIST,
      totalAll,
      totalsPerJenis,
      rows,
    };
  }

  // --- ANALYTICS: PROFESI vs JENIS SIMPANAN ---

    async getProfesiAnalytics(opts: {
    jenis?: JenisSimpanan;      // filter satu jenis (opsional)
    tp?: string;                // filter TP (opsional, diambil dari data_anggota.tp)
    tanggalLaporan?: Date;      // filter tanggal laporan (opsional tapi biasanya diisi)
    }): Promise<SimpananProfesiAnalyticsResp> {
    const match: any = {};
    if (opts.jenis) match.jenis = opts.jenis;
    if (opts.tanggalLaporan) match.tanggalLaporan = opts.tanggalLaporan;

    const pipeline: PipelineStage[] = [
        { $match: match },

        // join ke data_anggota pakai noAnggota -> noAgt
        {
        $lookup: {
            from: 'data_anggota',
            localField: 'noAnggota',
            foreignField: 'noAgt',
            as: 'agt',
        },
        },
        { $unwind: { path: '$agt', preserveNullAndEmptyArrays: true } },

        // filter TP kalau diminta
        ...(opts.tp
        ? [{ $match: { 'agt.tp': opts.tp } } as PipelineStage]
        : []),

        // siapkan field profesi yang sudah dirapikan
        {
        $project: {
            jenis: 1,
            profesi: {
            $ifNull: [{ $trim: { input: '$agt.profesi' } }, 'Kosong'],
            },
        },
        },

        // agregasi sekaligus: rows, totalsPerJenis, totalAll
        {
        $facet: {
            rows: [
            // hitung per kombinasi profesi+jenis
            {
                $group: {
                _id: { profesi: '$profesi', jenis: '$jenis' },
                c: { $sum: 1 },
                },
            },
            // gabung per profesi → items: [{k: jenis, v: count}]
            {
                $group: {
                _id: '$_id.profesi',
                items: { $push: { k: '$_id.jenis', v: '$c' } },
                total: { $sum: '$c' },
                },
            },
            {
                $project: {
                _id: 0,
                profesi: '$_id',
                items: 1,
                total: 1,
                },
            },
            { $sort: { total: -1, profesi: 1 } },
            ],

            totalsPerJenis: [
            { $group: { _id: '$jenis', total: { $sum: 1 } } },
            { $project: { _id: 0, k: '$_id', v: '$total' } },
            ],

            totalAll: [{ $count: 'n' }],
        },
        },
    ];

    const [agg] = (await (this.model as any).aggregate(pipeline).exec()) || [];

    const jenisList: JenisSimpanan[] = ['SJTA', 'SSKA', 'SMP', 'SPJ'];

    const totalAll = agg?.totalAll?.[0]?.n ?? 0;

    const totalsPerJenis: Record<JenisSimpanan, number> = {
        SJTA: 0,
        SSKA: 0,
        SMP: 0,
        SPJ: 0,
    };
    for (const x of agg?.totalsPerJenis ?? []) {
        if (jenisList.includes(x.k)) {
        totalsPerJenis[x.k as JenisSimpanan] = Number(x.v ?? 0);
        }
    }

    const rows: SimpananProfesiRow[] = [];
    for (const r of agg?.rows ?? []) {
        const perJenis: Record<JenisSimpanan, number> = {
        SJTA: 0,
        SSKA: 0,
        SMP: 0,
        SPJ: 0,
        };

        for (const item of r.items ?? []) {
        if (jenisList.includes(item.k)) {
            perJenis[item.k as JenisSimpanan] = Number(item.v ?? 0);
        }
        }

        const total = Number(r.total ?? 0);
        const persen = totalAll
        ? Math.round(((total / totalAll) * 100) * 10) / 10 // 1 desimal
        : 0;

        rows.push({
        profesi: r.profesi || 'Kosong',
        perJenis,
        total,
        persen,
        });
    }

    return { jenisList, totalAll, totalsPerJenis, rows };
    }

    async getUsiaPerTP(opts: {
        jenis?: JenisSimpanan;
        tanggalLaporan?: Date;
        tp?: TpKey[];   // optional: filter subset TP
        }): Promise<PerTPBaseResp<UsiaPerTPRow>> {
        const match: any = {};
        if (opts.jenis) match.jenis = opts.jenis;
        if (opts.tanggalLaporan) match.tanggalLaporan = opts.tanggalLaporan;

        const pipeline: PipelineStage[] = [
            { $match: match },

            // join anggota untuk ambil TP, usia/tglLahir
            {
            $lookup: {
                from: 'data_anggota',
                localField: 'noAnggota',
                foreignField: 'noAgt',
                as: 'agt',
            },
            },
            { $unwind: { path: '$agt', preserveNullAndEmptyArrays: true } },

            {
            $addFields: {
                _tp: '$agt.tp',
                _usia: {
                $ifNull: [
                    '$agt.usia',
                    {
                    $cond: [
                        { $ifNull: ['$agt.tglLahir', false] },
                        {
                        $dateDiff: {
                            startDate: '$agt.tglLahir',
                            endDate: { $ifNull: ['$tanggalLaporan', '$$NOW'] },
                            unit: 'year',
                        },
                        },
                        null,
                    ],
                    },
                ],
                },
            },
            },

            // filter TP valid & optional subset
            {
            $match: {
                _tp: {
                $in: opts.tp && opts.tp.length ? opts.tp : TP_ORDER,
                },
            },
            },

            // bucket usia
            {
            $addFields: {
                _bucket: {
                $switch: {
                    branches: [
                    {
                        case: {
                        $and: [{ $ne: ['$_usia', null] }, { $lt: ['$_usia', 24] }],
                        },
                        then: '<24 th',
                    },
                    {
                        case: {
                        $and: [
                            { $gte: ['$_usia', 24] },
                            { $lte: ['$_usia', 35] },
                        ],
                        },
                        then: '24 - 35 th',
                    },
                    {
                        case: {
                        $and: [
                            { $gte: ['$_usia', 36] },
                            { $lte: ['$_usia', 45] },
                        ],
                        },
                        then: '36 - 45 th',
                    },
                    {
                        case: {
                        $and: [
                            { $gte: ['$_usia', 46] },
                            { $lte: ['$_usia', 60] },
                        ],
                        },
                        then: '46 - 60 th',
                    },
                    {
                        case: { $gt: ['$_usia', 60] },
                        then: '> 60 th',
                    },
                    ],
                    default: 'Tidak Valid',
                },
                },
            },
            },

            // group per bucket + TP
            {
            $group: {
                _id: '$_bucket',
                total: { $sum: 1 },
                PBL: { $sum: { $cond: [{ $eq: ['$_tp', 'PBL'] }, 1, 0] } },
                KRK: { $sum: { $cond: [{ $eq: ['$_tp', 'KRK'] }, 1, 0] } },
                JBR: { $sum: { $cond: [{ $eq: ['$_tp', 'JBR'] }, 1, 0] } },
                BWI: { $sum: { $cond: [{ $eq: ['$_tp', 'BWI'] }, 1, 0] } },
                MJK: { $sum: { $cond: [{ $eq: ['$_tp', 'MJK'] }, 1, 0] } },
                MGL: { $sum: { $cond: [{ $eq: ['$_tp', 'MGL'] }, 1, 0] } },
                PML: { $sum: { $cond: [{ $eq: ['$_tp', 'PML'] }, 1, 0] } },
            },
            },

            {
            $project: {
                _id: 0,
                usia: '$_id',
                total: 1,
                perTP: {
                PBL: '$PBL',
                KRK: '$KRK',
                JBR: '$JBR',
                BWI: '$BWI',
                MJK: '$MJK',
                MGL: '$MGL',
                PML: '$PML',
                },
            },
            },
        ];

        const raw = await (this.model as any).aggregate(pipeline).exec();

        const BUCKET_ORDER = [
            '<24 th',
            '24 - 35 th',
            '36 - 45 th',
            '46 - 60 th',
            '> 60 th',
            'Tidak Valid',
        ];

        const rows: UsiaPerTPRow[] = [];
        let totalAll = 0;
        const totalsPerTP: Record<TpKey, number> = {
            PBL: 0,
            KRK: 0,
            JBR: 0,
            BWI: 0,
            MJK: 0,
            MGL: 0,
            PML: 0,
        };

        for (const bucket of BUCKET_ORDER) {
            const found = raw.find((r: any) => r.usia === bucket);
            const perTP: Record<TpKey, number> = {
            PBL: 0,
            KRK: 0,
            JBR: 0,
            BWI: 0,
            MJK: 0,
            MGL: 0,
            PML: 0,
            };
            let total = 0;

            if (found) {
            for (const tp of TP_ORDER) {
                const val = Number(found.perTP?.[tp] ?? 0);
                perTP[tp] = val;
                totalsPerTP[tp] += val;
                total += val;
            }
            }

            totalAll += total;
            rows.push({ usia: bucket, perTP, total, persen: 0 });
        }

        rows.forEach((r) => {
            r.persen = totalAll
            ? Math.round(((r.total / totalAll) * 100) * 10) / 10
            : 0;
        });

        return { tps: [...TP_ORDER] as TpKey[], totalAll, totalsPerTP, rows };
    }

    async getProfesiPerTPForSimpanan(opts: {
        jenis?: JenisSimpanan;
        tanggalLaporan?: Date;
        tp?: TpKey[];
        }): Promise<PerTPBaseResp<ProfesiPerTPRow>> {
        const match: any = {};
        if (opts.jenis) match.jenis = opts.jenis;
        if (opts.tanggalLaporan) match.tanggalLaporan = opts.tanggalLaporan;

        const pipe: PipelineStage[] = [
            { $match: match },

            {
            $lookup: {
                from: 'data_anggota',
                localField: 'noAnggota',
                foreignField: 'noAgt',
                as: 'agt',
            },
            },
            { $unwind: { path: '$agt', preserveNullAndEmptyArrays: true } },

            {
            $addFields: {
                _tp: '$agt.tp',
                _profesi: {
                $ifNull: [{ $trim: { input: '$agt.profesi' } }, 'Kosong'],
                },
            },
            },

            {
            $match: {
                _tp: {
                $in: opts.tp && opts.tp.length ? opts.tp : TP_ORDER,
                },
            },
            },

            {
            $facet: {
                rows: [
                {
                    $group: {
                    _id: { profesi: '$_profesi', tp: '$_tp' },
                    c: { $sum: 1 },
                    },
                },
                {
                    $group: {
                    _id: '$_id.profesi',
                    items: { $push: { k: '$_id.tp', v: '$c' } },
                    total: { $sum: '$c' },
                    },
                },
                {
                    $project: {
                    _id: 0,
                    profesi: '$_id',
                    items: 1,
                    total: 1,
                    },
                },
                { $sort: { total: -1, profesi: 1 } },
                ],

                totalsPerTP: [
                { $group: { _id: '$_tp', total: { $sum: 1 } } },
                { $project: { _id: 0, k: '$_id', v: '$total' } },
                ],

                grandTotal: [{ $count: 'n' }],
            },
            },
        ];

        const [res] = await (this.model as any).aggregate(pipe).exec();

        const totalsPerTP: Record<TpKey, number> = {
            PBL: 0,
            KRK: 0,
            JBR: 0,
            BWI: 0,
            MJK: 0,
            MGL: 0,
            PML: 0,
        };
        for (const x of res?.totalsPerTP ?? []) {
            if (TP_ORDER.includes(x.k)) {
            totalsPerTP[x.k as TpKey] = Number(x.v ?? 0);
            }
        }

        const grandTotal = res?.grandTotal?.[0]?.n ?? 0;

        const rows: ProfesiPerTPRow[] = [];
        for (const r of res?.rows ?? []) {
            const perTP: Record<TpKey, number> = {
            PBL: 0,
            KRK: 0,
            JBR: 0,
            BWI: 0,
            MJK: 0,
            MGL: 0,
            PML: 0,
            };
            for (const item of r.items ?? []) {
            if (TP_ORDER.includes(item.k)) {
                perTP[item.k as TpKey] = Number(item.v ?? 0);
            }
            }

            const total = Number(r.total ?? 0);
            const persen = grandTotal
            ? Math.round(((total / grandTotal) * 100) * 10) / 10
            : 0;

            rows.push({
            profesi: r.profesi || 'Kosong',
            perTP,
            total,
            persen,
            });
        }

        return {
            tps: [...TP_ORDER] as TpKey[],
            totalAll: grandTotal,
            totalsPerTP,
            rows,
        };

    }

    async getUsiaProfesiSimpanan(
        query: UsiaProfesiSimpananQueryDto,
    ): Promise<UsiaProfesiSimpananResponse> {
        const { tahunBuka, tp } = query;

        const match: Record<string, any> = {};
        if (tp) match.tp = tp;
        if (tahunBuka) {
        const year = Number(tahunBuka);
        if (!Number.isNaN(year)) {
            match.tglBuka = {
            $gte: new Date(year, 0, 1),
            $lt: new Date(year + 1, 0, 1),
            };
        }
        }

        const pipeline: PipelineStage[] = [
        { $match: match },

        // ganti 'data_anggota' dengan nama koleksi anggota yang sebenarnya
        {
            $lookup: {
            from: 'data_anggota',
            let: { noAnggota: '$noAnggota', kodeAnggota: '$kodeAnggota' },
            pipeline: [
                {
                $match: {
                    $expr: {
                    $or: [
                        { $eq: ['$noAnggota', '$$noAnggota'] },
                        { $eq: ['$kodeAnggota', '$$kodeAnggota'] },
                    ],
                    },
                },
                },
                { $project: { _id: 0, profesi: 1, tglLahir: 1 } },
            ],
            as: 'anggota',
            },
        },
        { $unwind: '$anggota' },

        // hitung usia pada saat pembukaan rekening (tglBuka)
        {
            $addFields: {
            usiaTahun: {
                $dateDiff: {
                startDate: '$anggota.tglLahir',
                endDate: '$tglBuka',
                unit: 'year',
                },
            },
            },
        },

        // bucket usia
        {
            $addFields: {
            usiaBucket: {
                $switch: {
                branches: [
                    { case: { $lt: ['$usiaTahun', 24] }, then: '<24 th' },
                    {
                    case: {
                        $and: [
                        { $gte: ['$usiaTahun', 24] },
                        { $lte: ['$usiaTahun', 35] },
                        ],
                    },
                    then: '24-35 th',
                    },
                    {
                    case: {
                        $and: [
                        { $gte: ['$usiaTahun', 36] },
                        { $lte: ['$usiaTahun', 45] },
                        ],
                    },
                    then: '36-45 th',
                    },
                    {
                    case: {
                        $and: [
                        { $gte: ['$usiaTahun', 46] },
                        { $lte: ['$usiaTahun', 60] },
                        ],
                    },
                    then: '46-60 th',
                    },
                    { case: { $gt: ['$usiaTahun', 60] }, then: '>60 th' },
                ],
                default: 'Tidak Valid',
                },
            },
            },
        },

        // group per (usiaBucket, profesi) + sum SJTA/SSKA/SMP/SPJ
        {
            $group: {
            _id: { usiaBucket: '$usiaBucket', profesi: '$anggota.profesi' },
            SJTA: { $sum: { $cond: [{ $eq: ['$jenis', 'SJTA'] }, '$saldo', 0] } },
            SSKA: { $sum: { $cond: [{ $eq: ['$jenis', 'SSKA'] }, '$saldo', 0] } },
            SMP:  { $sum: { $cond: [{ $eq: ['$jenis', 'SMP']  }, '$saldo', 0] } },
            SPJ:  { $sum: { $cond: [{ $eq: ['$jenis', 'SPJ']  }, '$saldo', 0] } },
            total: { $sum: '$saldo' },
            },
        },

        // group kedua per usiaBucket → rows + subtotal
        {
            $group: {
            _id: '$_id.usiaBucket',
            rows: {
                $push: {
                profesi: '$_id.profesi',
                perJenis: {
                    SJTA: '$SJTA',
                    SSKA: '$SSKA',
                    SMP: '$SMP',
                    SPJ: '$SPJ',
                },
                total: '$total',
                },
            },
            subtotal: { $sum: '$total' },
            },
        },

        // sort usia
        {
            $addFields: {
            sortKey: {
                $switch: {
                branches: [
                    { case: { $eq: ['$_id', '<24 th'] }, then: 0 },
                    { case: { $eq: ['$_id', '24-35 th'] }, then: 1 },
                    { case: { $eq: ['$_id', '36-45 th'] }, then: 2 },
                    { case: { $eq: ['$_id', '46-60 th'] }, then: 3 },
                    { case: { $eq: ['$_id', '>60 th'] }, then: 4 },
                ],
                default: 99,
                },
            },
            },
        },
        { $sort: { sortKey: 1 } },

        // grand total
        {
            $group: {
            _id: null,
            buckets: {
                $push: {
                usia: '$_id',
                rows: '$rows',
                subtotal: '$subtotal',
                },
            },
            grandTotal: { $sum: '$subtotal' },
            },
        },
        { $project: { _id: 0 } },
        ];

        type RawAgg = {
            buckets: any[];
            grandTotal: number;
        };

        const [raw] = await this.model
            .aggregate<RawAgg>(pipeline)
            .allowDiskUse(true)
            .exec();

        return {
            buckets: raw?.buckets ?? [],
            grandTotal: raw?.grandTotal ?? 0,
            jenisList: ['SISUKA', 'SUJATRA', 'SIPIJAR', 'SIMAPAN'], // sesuai KolomSimpananKey
        };
    }

}
