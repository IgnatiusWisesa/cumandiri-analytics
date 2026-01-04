import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { UpdateResult } from 'mongodb';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

import { CreateDataAnggotaDto } from './dto/create-pinjaman.dto';
import { DataAnggota, DataAnggotaDocument } from './schema/data-anggota.schema';

export type AnalyticsResponse = {
  usia: {
    rows: RowUsia[];   // <-- tadinya pakai BaseAgeBucket
    total: number;
    tps: string[];
  };
  profesi: {
    rows: Array<{
      profesi: string;
      jumlah: number;
      persen: number;
      perTP: Record<string, number>;
    }>;
    total: number;
    tps: string[];
  };
};

// Urutan bucket sesuai tabel
const AGE_BUCKETS = [
  '<24 th','24 - 35 th','36 - 45 th','46 - 60 th','> 60 th','Tidak Valid',
] as const;

type BaseAgeBucket = typeof AGE_BUCKETS[number];
type AgeBucket = BaseAgeBucket | 'TOTAL';

type RowUsia = {
  usiaBucket: AgeBucket;
  jumlah: number;
  persen: number;                // 0..100
  perTP: Record<string, number>;
};

type ProfesiRow = {
  profesi: string;
  jumlah: number;
  persen: number;
  perTP: Record<string, number>;
};

// Urutan TP harus sama dengan kolom di template
const TP_ORDER = ['PBL', 'KRK', 'JBR', 'BWI', 'MJK', 'MGL', 'PML'] as const;

// Menghasilkan bucket usia (tanpa 'TOTAL')
function computeAgeBucket(age?: number): BaseAgeBucket {
  if (age == null || isNaN(age)) return 'Tidak Valid';
  if (age < 24) return '<24 th';
  if (age <= 35) return '24 - 35 th';
  if (age <= 45) return '36 - 45 th';
  if (age <= 60) return '46 - 60 th';
  return '> 60 th';
}

type ProfesiUsiaRow = {
  usia: string;                    // bucket
  profesi: string;
  jumlah: number;
  perTP: Record<string, number>;   // { PBL: n, KRK: n, ... }
};

type ProfesiUsiaBucket = {
  usia: string;
  total: number;
  rows: Array<{ profesi: string; jumlah: number; persen: number; perTP: Record<string, number> }>;
};

type ProfesiUsiaResponse = {
  buckets: ProfesiUsiaBucket[];
  grandTotal: number;
  tps: string[];                   // ['PBL','KRK',...]
};

const TP_CODE_TO_NAME: Record<string, string> = {
  '001': 'PBL',
  '002': 'KRK',
  '003': 'JBR',
  '004': 'BWI',
  '005': 'MJK',
  '006': 'MGL',
  '007': 'PML',
};

const TP_LIST = ['PBL','KRK','JBR','BWI','MJK','MGL','PML'];

function excelSet(ws: XLSX.WorkSheet, row1: number, col0: number, v: any, z?: string) {
  const addr = XLSX.utils.encode_cell({ r: row1 - 1, c: col0 });
  (ws as any)[addr] = { t: typeof v === 'number' ? 'n' : 's', v };
  if (z) (ws as any)[addr].z = z;
}

const stripUndefined = <T extends Record<string, any>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([,v]) => v !== undefined && v !== '')) as T;

@Injectable()
export class DataAnggotaService {
  constructor(
    @InjectModel(DataAnggota.name) private readonly model: Model<DataAnggotaDocument>,
  ) {}

  async findAll(filter = {}, limit = 100, skip = 0) {
    return this.model.find(filter).limit(limit).skip(skip).sort({ nama: 1 }).lean();
  }

    async createOne(dto: CreateDataAnggotaDto) {
        const payload = stripUndefined({
            ...dto,
            tglLahir: dto.tglLahir ? new Date(dto.tglLahir) : undefined,
            tglMasuk: dto.tglMasuk ? new Date(dto.tglMasuk) : undefined,
            tahunGabung: dto.tahunGabung,
        });
        await this.model.updateOne({ noAgt: String(dto.noAgt).trim() }, { $set: payload }, { upsert: true });
        return this.model.findOne({ noAgt: String(dto.noAgt).trim() }).lean();
        }

        async bulkUpsert(items: CreateDataAnggotaDto[]) {
        if (!items?.length) return { matched: 0, modified: 0, upserted: 0, failed: 0, errors: [] as any[] };

        const CHUNK = 200;
        let matched = 0, modified = 0, upserted = 0, failed = 0;
        const errors: any[] = [];

        const toPayload = (dto: CreateDataAnggotaDto) => stripUndefined({
            ...dto,
            tglLahir: dto.tglLahir ? new Date(dto.tglLahir) : undefined,
            tglMasuk: dto.tglMasuk ? new Date(dto.tglMasuk) : undefined,
            tahunGabung: dto.tahunGabung,
        });

        for (let i = 0; i < items.length; i += CHUNK) {
            const chunk = items.slice(i, i + CHUNK);
            const results = await Promise.allSettled(
            chunk.map(async (dto) => {
                const key = String(dto.noAgt).trim();
                if (!key) throw new Error('noAgt missing');
                const res: UpdateResult = await this.model.updateOne(
                { noAgt: key },
                { $set: toPayload(dto) },
                { upsert: true }
                );
                matched  += res.matchedCount ?? 0;
                modified += res.modifiedCount ?? 0;
                upserted += (res as any).upsertedId ? 1 : 0;
            }),
            );

            results.forEach((r, idx) => {
            if (r.status === 'rejected') {
                failed += 1;
                errors.push({ index: i + idx, noAgt: items[idx]?.noAgt, reason: String(r.reason) });
            }
            });
        }

        return { matched, modified, upserted, failed, errors };
        }

    /** Parse Excel → array DTO siap upsert */
    parseExcel(buffer: Buffer, sheetName?: string): CreateDataAnggotaDto[] {

        // console.log("buffer", buffer)
        // console.log("sheetName", sheetName)

        const wb = XLSX.read(buffer, { type: 'buffer' });
        const useSheet = sheetName || wb.SheetNames[0];
        const ws = wb.Sheets[useSheet];
        if (!ws) {
            throw new Error(`Sheet "${useSheet}" tidak ditemukan. Sheet ada: ${wb.SheetNames.join(', ')}`);
        }

        // console.log("ws", ws)

        // --- 1) Deteksi baris header otomatis (scan 10 baris pertama)
        const ref = XLSX.utils.decode_range(ws['!ref'] as string);
        const normStr = (x: any) =>
            String(x ?? '')
            .toLowerCase()
            .normalize('NFKD')
            .replace(/\p{Diacritic}/gu, '')
            .trim();

        let headerRow = ref.s.r; // default
        for (let r = ref.s.r; r <= Math.min(ref.s.r + 10, ref.e.r); r++) {
            const arr = XLSX.utils.sheet_to_json<any>(ws, {
            header: 1,
            range: { s: { r, c: ref.s.c }, e: { r, c: ref.e.c } },
            blankrows: false,
            raw: false,         // ambil teks yang terlihat
            })[0] as any[] | undefined;

            if (!arr) continue;
            const joined = arr.map(normStr).join('|');

            // heuristik minimal: ada "nama" + (ada "nba"/"no agt"/"no anggota") atau ada "tanggallahirumur"
            if (
            joined.includes('nama') ||
            joined.includes('tanggallahirumur') ||
            joined.includes('no agt') ||
            joined.includes('noanggota') ||
            joined.includes('nba') ||
            joined.includes('n b a')
            ) {
            headerRow = r;
            break;
            }
        }

        // console.log('Detected header row at:', headerRow + 1);
        // console.log('Header preview:', XLSX.utils.sheet_to_json<any>(ws, {
        //     header: 1,
        //     range: { s: { r: headerRow, c: ref.s.c }, e: { r: headerRow, c: ref.e.c } },
        //     blankrows: false,
        //     raw: false,
        // })[0]);

        // --- 2) Baca baris data mulai headerRow, gunakan header asli
        const rawRows = XLSX.utils.sheet_to_json<any>(ws, {
            defval: null,
            raw: false,       // pakai teks (hindari 14053 → 1.4053e+4)
            range: headerRow, // baris ini dianggap header
        });

        if (!rawRows.length) {
            console.log('Parsed 0 rows from Excel file.\nFirst row:', undefined);
            return [];
        }

        // --- 3) Mapping header → field DTO
        const norm = (s?: string) =>
            (s || '')
            .toLowerCase()
            .normalize('NFKD')
            .replace(/\p{Diacritic}/gu, '')
            .replace(/[^a-z0-9]+/g, '')
            .trim();

        const mapKey = (rawHeader: string): keyof CreateDataAnggotaDto | 'skip' => {
            switch (norm(rawHeader)) {
            // noAgt / NBA
            case 'noagt':
            case 'noanggota':
            case 'nba':
            case 'noba':
            case 'nbaagt':
            case 'n b a':
            case 'n b aagt':
                return 'noAgt';

            case 'nama':
                return 'nama';

            // tp / cabang
            case 'tp':
            case 'cabang':
            case 'branch':
                return 'tp';

            // gender
            case 'jk':
            case 'jeniskelamin':
                return 'jk';

            // tanggal lahir / gabungan
            case 'tgllahir':
            case 'tanggallahir':
                return 'tglLahir';

            case 'tanggallahirumur':
            case 'tgllahirumur':
                return 'tglLahir'; // nilai diproses khusus di bawah
            // usia eksplisit
            case 'usia':
                return 'usia';

            case 'pekerjaan':
                return 'pekerjaan';
            case 'profesi':
                return 'profesi';
            case 'bidangusaha':
                return 'bidangUsaha';

            case 'namainstansi':
            case 'instansi':
                return 'namaInstansi';

            // tanggal masuk → untuk tahunGabung
            case 'tglmasuk':
            case 'tanggamasuk':
            case 'tanggalmasuk':
                return 'tglMasuk';

            default:
                return 'skip';
            }
        };

        const isErrorNA = (v: any) => {
            // Excel error biasanya jadi string "#N/A" saat raw:false
            return String(v).trim().toUpperCase() === '#N/A';
        };

        const toDateISO = (val: any): string | undefined => {
            if (val === null || val === undefined || val === '' || isErrorNA(val)) return undefined;
            if (val instanceof Date && !isNaN(+val)) {
            return new Date(Date.UTC(val.getFullYear(), val.getMonth(), val.getDate())).toISOString();
            }
            if (typeof val === 'number') {
            const d = XLSX.SSF.parse_date_code(val);
            if (!d || !d.y) return undefined;
            return new Date(Date.UTC(d.y, (d.m || 1) - 1, d.d || 1)).toISOString();
            }
            const s = String(val).trim();
            let m = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
            if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString();
            m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2}|\d{4})$/);
            if (m) {
            let y = +m[3];
            if (y < 100) y += y >= 50 ? 1900 : 2000;
            return new Date(Date.UTC(y, +m[2] - 1, +m[1])).toISOString();
            }
            const d = new Date(s);
            return isNaN(+d)
            ? undefined
            : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
        };

        // derive tahun dari nama sheet jika 4 digit
        const yearFromSheet = /^\d{4}$/.test(useSheet) ? Number(useSheet) : undefined;

        const out: CreateDataAnggotaDto[] = [];

        for (const row of rawRows) {
            const dto: any = {};
            for (const [rawK, rawV] of Object.entries(row)) {
            const key = mapKey(String(rawK));
            if (key === 'skip') continue;

            // treat Excel errors as empty
            const v = isErrorNA(rawV) ? undefined : rawV;

            // kolom gabungan "Tanggal Lahir/Umur"
            const nk = norm(String(rawK));
            if ((nk === 'tanggallahirumur' || nk === 'tgllahirumur') && v != null) {
                const s = String(v);
                const [tglPart, usiaPart] = s.split('/').map(x => x?.trim());
                const iso = toDateISO(tglPart);
                if (iso) dto.tglLahir = iso;
                const m = (usiaPart || '').match(/(\d{1,3})/);
                if (m) dto.usia = Number(m[1]);
                continue;
            }

            if (key === 'tglLahir' || key === 'tglMasuk') dto[key] = toDateISO(v);
            else if (key === 'usia') dto[key] = v == null ? undefined : Number(v);
            else if (key === 'noAgt') {
                // paksa jadi string & trim → jaga titik tidak hilang
                dto.noAgt = v == null ? undefined : String(v).trim();
            } else {
                dto[key] = v == null ? undefined : String(v).trim();
            }
            }

            // derive tahunGabung
            const yJoin = dto.tglMasuk ? new Date(dto.tglMasuk).getUTCFullYear() : undefined;
            if (yJoin) dto.tahunGabung = yJoin;
            else if (yearFromSheet) dto.tahunGabung = yearFromSheet;

            // normalisasi final
            if (dto.noAgt) dto.noAgt = String(dto.noAgt).trim();
            if (dto.nama) dto.nama = String(dto.nama).trim();

            // >>> hanya butuh noAgt untuk upsert
            if (dto.noAgt) out.push(dto as CreateDataAnggotaDto);
        }

        // console.log('Parsed', out.length, 'rows ready for upsert');
        // console.log('[XLSX] Sheets:', wb.SheetNames, 'use:', useSheet, 'ref:', ws['!ref']);
        return out;
    }

  async getAnalytics(): Promise<AnalyticsResponse> {
    const docs = await this.model
      .find({}, { tp: 1, usia: 1, tglLahir: 1, profesi: 1 })
      .lean();

    const year = new Date().getUTCFullYear();
    const getAge = (d: any): number | undefined => {
      if (typeof d.usia === 'number') return d.usia;
      if (d.tglLahir) {
        const dob = new Date(d.tglLahir);
        if (!isNaN(+dob)) return year - dob.getUTCFullYear();
      }
      return undefined;
    };

    const tps = new Set<string>();
    const usiaAgg = new Map<BaseAgeBucket, { total: number; byTP: Map<string, number> }>();

    for (const d of docs) {
      const tp = (d.tp || 'UNKNOWN').toString().trim().toUpperCase();
      tps.add(tp);

      const bucket = computeAgeBucket(getAge(d));
      if (!usiaAgg.has(bucket)) usiaAgg.set(bucket, { total: 0, byTP: new Map() });
      const u = usiaAgg.get(bucket)!;
      u.total += 1;
      u.byTP.set(tp, (u.byTP.get(tp) || 0) + 1);
    }

    const tpList = TP_ORDER.filter(tp => tps.has(tp));
    const totalUsia = Array.from(usiaAgg.values()).reduce((s, v) => s + v.total, 0);

    const usiaRows: RowUsia[] = AGE_BUCKETS.map((b): RowUsia => {
    const v = usiaAgg.get(b) || { total: 0, byTP: new Map<string, number>() };
    const perTP: Record<string, number> = {};
    tpList.forEach((tp) => (perTP[tp] = v.byTP.get(tp) || 0));
    const persen = totalUsia ? +((v.total / totalUsia) * 100).toFixed(2) : 0;
    return { usiaBucket: b, jumlah: v.total, persen, perTP };
    });

    usiaRows.push({
    usiaBucket: 'TOTAL',
    jumlah: totalUsia,
    persen: 100,
    perTP: Object.fromEntries(
        tpList.map(tp =>
        [tp, AGE_BUCKETS.reduce((s, b) => s + ((usiaAgg.get(b)?.byTP.get(tp)) || 0), 0)],
        ),
    ),
    });

    return {
      usia: { rows: usiaRows, total: totalUsia, tps: tpList },
      profesi: { rows: [], total: 0, tps: tpList },
    };
  }

  async exportAnalyticsXlsx(): Promise<Buffer> {
    const data = await this.getAnalytics();

    const templatePath = path.join(process.cwd(), 'assets', 'templates', 'ANALISA_template.xlsx');
    if (!fs.existsSync(templatePath)) throw new Error(`Template not found at: ${templatePath}`);

    const wb = XLSX.read(fs.readFileSync(templatePath));
    const ws = wb.Sheets['ANALISA'];
    if (!ws) throw new Error('Sheet "ANALISA" not found');

    const ROW_FOR: Record<AgeBucket, number> = {
      '<24 th': 5, '24 - 35 th': 6, '36 - 45 th': 7, '46 - 60 th': 8, '> 60 th': 9,
      'Tidak Valid': 10, 'TOTAL': 11,
    };

    const COL = { USIA: 1, JUMLAH: 2, PERCENT: 3, PBL: 4, KRK: 5, JBR: 6, BWI: 7, MJK: 8, MGL: 9, PML: 10 } as const;

    // clear values area
    for (let r = 5; r <= 11; r++) for (let c = COL.USIA; c <= COL.PML; c++) {
      const addr = XLSX.utils.encode_cell({ r: r - 1, c });
      delete (ws as any)[addr];
    }

    const usiaNoTotal = data.usia.rows.filter(r => r.usiaBucket !== 'TOTAL');
    for (const r of usiaNoTotal) {
      const row = ROW_FOR[r.usiaBucket];
      excelSet(ws, row, COL.USIA, r.usiaBucket);
      excelSet(ws, row, COL.JUMLAH, r.jumlah);
      excelSet(ws, row, COL.PERCENT, +(r.persen / 100).toFixed(4), '0.00%');
      excelSet(ws, row, COL.PBL, r.perTP.PBL || 0);
      excelSet(ws, row, COL.KRK, r.perTP.KRK || 0);
      excelSet(ws, row, COL.JBR, r.perTP.JBR || 0);
      excelSet(ws, row, COL.BWI, r.perTP.BWI || 0);
      excelSet(ws, row, COL.MJK, r.perTP.MJK || 0);
      excelSet(ws, row, COL.MGL, r.perTP.MGL || 0);
      excelSet(ws, row, COL.PML, r.perTP.PML || 0);
    }

    const tr = ROW_FOR['TOTAL'];
    const sumTP = (tp: (typeof TP_ORDER)[number]) => usiaNoTotal.reduce((s, rr) => s + (rr.perTP[tp] || 0), 0);
    excelSet(ws, tr, COL.USIA, 'TOTAL');
    excelSet(ws, tr, COL.JUMLAH, data.usia.total);
    excelSet(ws, tr, COL.PERCENT, 1, '0.00%');
    excelSet(ws, tr, COL.PBL, sumTP('PBL'));
    excelSet(ws, tr, COL.KRK, sumTP('KRK'));
    excelSet(ws, tr, COL.JBR, sumTP('JBR'));
    excelSet(ws, tr, COL.BWI, sumTP('BWI'));
    excelSet(ws, tr, COL.MJK, sumTP('MJK'));
    excelSet(ws, tr, COL.MGL, sumTP('MGL'));
    excelSet(ws, tr, COL.PML, sumTP('PML'));

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // ====== NEW: ANGGOTA BARU per TAHUN ======

  /** Ambil agregasi anggota yang dibuat pada tahun `year` (createdAt) */
  private async getNewMembers(year: number) {
    const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const end   = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));

    // timestamps true → mongoose buat createdAt/updatedAt
    const docs = await this.model.find(
        {
        $or: [
            { tahunGabung: year },
            { $and: [{ tahunGabung: { $exists: false } }, { createdAt: { $gte: start, $lt: end } }] },
        ],
        } as any,
        { tp: 1, usia: 1, tglLahir: 1, tglMasuk: 1, tahunGabung: 1, createdAt: 1 },
    ).lean();

    const refYear = year;
    const ageFromDoc = (d: any): number | undefined => {
        if (typeof d.usia === 'number') return d.usia;
        if (d.tglLahir) {
        const dob = new Date(d.tglLahir);
        if (!isNaN(+dob)) return refYear - dob.getUTCFullYear();
        }
        return undefined;
    };

    const tps = new Set<string>();
    const agg = new Map<BaseAgeBucket, { total: number; byTP: Map<string, number> }>();

    for (const d of docs) {
      const tp = (d.tp || 'UNKNOWN').toString().trim().toUpperCase();
      tps.add(tp);
      const b = computeAgeBucket(ageFromDoc(d));
      if (!agg.has(b)) agg.set(b, { total: 0, byTP: new Map() });
      const u = agg.get(b)!;
      u.total += 1;
      u.byTP.set(tp, (u.byTP.get(tp) || 0) + 1);
    }

    const tpList = TP_ORDER.filter(tp => tps.has(tp));
    const total = Array.from(agg.values()).reduce((s, v) => s + v.total, 0);

    // >>> ketik hasil map sebagai RowUsia[]
    const rows: RowUsia[] = AGE_BUCKETS.map((b): RowUsia => {
        const v = agg.get(b) || { total: 0, byTP: new Map<string, number>() };
        const perTP: Record<string, number> = {};
        tpList.forEach((tp) => (perTP[tp] = v.byTP.get(tp) || 0));
        const persen = total ? +((v.total / total) * 100).toFixed(0) : 0;
        return { usiaBucket: b, jumlah: v.total, persen, perTP };
    });

    // >>> sekarang aman push TOTAL
    rows.push({
        usiaBucket: 'TOTAL',
        jumlah: total,
        persen: 100,
        perTP: Object.fromEntries(
        tpList.map(tp => [tp, AGE_BUCKETS.reduce((s, b) => s + ((agg.get(b)?.byTP.get(tp)) || 0), 0)])
        ),
    });

    // >>> pastikan type return mengandung RowUsia[]
    return { year, rows, total, tps: tpList } as {
        year: number; rows: RowUsia[]; total: number; tps: string[];
    };
  }

  /**
   * Export tabel "ANGGOTA BARU" multi-tahun.
   * Template: assets/templates/ANGGOTA_BARU_template.xlsx (sheet: "ANGGOTA BARU")
   */
  async exportNewMembersXlsx(years: number[] = [2025, 2024]): Promise<Buffer> {
    const templatePath = path.join(process.cwd(), 'assets', 'templates', 'ANGGOTA_BARU_template.xlsx');
    if (!fs.existsSync(templatePath)) throw new Error(`Template not found at: ${templatePath}`);

    const wb = XLSX.read(fs.readFileSync(templatePath));
    const ws = wb.Sheets['ANGGOTA BARU'];
    if (!ws) throw new Error('Sheet "ANGGOTA BARU" not found');

    // Lokasi blok (awal baris untuk masing-masing tahun) — SESUAI template-mu
    // Baris judul besar di handle template; kita hanya isi nilai di grid.
    const BLOCKS = [
      { // blok 1 (tahun[0])
        startRow: 4, // baris pertama data usia "<24 th"
      },
      { // blok 2 (tahun[1])
        startRow: 20,
      },
    ];

    const COL = {
      USIA: 1,           // B
      GAB_COUNT: 2,      // C (jumlah GAB)
      GAB_PCT: 3,        // D (persen GAB)
      // kolom per-TP: tiap TP 2 kolom: count lalu percent
      // E.. seterusnya → [count, pct] berulang
    };

    const pctFmt = '0%'; // tampilan persentase per kolom

    // tulis tiap tahun
    for (let idx = 0; idx < years.length && idx < BLOCKS.length; idx++) {
      const { year, rows, total, tps } = await this.getNewMembers(years[idx]);
      const start = BLOCKS[idx].startRow;

      // header judul kecil "ANGGOTA BARU <YEAR>" diasumsikan sudah ada di template baris di atasnya

      // tulis 5 bucket + ">60" (tidak tulis "TOTAL" di tabel isi; total kita isi di baris ringkasan)
      const dataRows = rows.filter(r => r.usiaBucket !== 'TOTAL'); // sekarang aman

      // GAB (total baris per usia)
      dataRows.forEach((r, i) => {
        const r1 = start + i;
        excelSet(ws, r1, COL.USIA, r.usiaBucket);
        excelSet(ws, r1, COL.GAB_COUNT, r.jumlah);
        excelSet(ws, r1, COL.GAB_PCT, +(r.persen / 100).toFixed(4), '0.00%');
      });

      // baris TOTAL GAB (jumlah semua)
      const totalRow = start + dataRows.length;
      excelSet(ws, totalRow, COL.USIA, 'TOTAL');
      excelSet(ws, totalRow, COL.GAB_COUNT, total);
      // kolom persen total dibiarkan kosong (template biasanya kuning)

      // ==== per TP: untuk setiap TP kita tulis 2 kolom: count & percent ====
      // posisi kolom pertama TP mulai dari E (index 4), lalu geser 2 kolom per TP
      let col = 4;
      for (const tp of TP_ORDER) {
        const exists = tps.includes(tp);
        // hitung total per TP untuk persentase baris TOTAL (kalau mau diisi)
        const tpTotal = dataRows.reduce((s, r) => s + (r.perTP[tp] || 0), 0);

        // tiap usia
        dataRows.forEach((r, i) => {
          const r1 = start + i;
          const cnt = exists ? (r.perTP[tp] || 0) : 0;
          const pct = total ? cnt / total : 0;
          excelSet(ws, r1, col, cnt);                // count
          excelSet(ws, r1, col + 1, pct, pctFmt);    // percent of GAB total
        });

        // baris TOTAL (isi total count TP; percent baris total—sesuai contoh—biasanya kosong)
        excelSet(ws, totalRow, col, tpTotal);

        col += 2;
      }
    }

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

    async getProfessionAnalytics(): Promise<{ rows: ProfesiRow[]; total: number; tps: string[] }> {
        // Ambil agregat per (profesi, tp)
        const agg = await this.model.aggregate<{
            _id: { prof: string; tp: string };
            count: number;
        }>([
            {
            $project: {
                tp: {
                $toUpper: {
                    $trim: { input: { $ifNull: ['$tp', 'UNKNOWN'] } },
                },
                },
                // normalisasi profesi: kosong / "#N/A" -> "Kosong"
                profRaw: {
                $trim: {
                    input: {
                    $ifNull: ['$profesi', ''],
                    },
                },
                },
            },
            },
            {
            $addFields: {
                prof: {
                $cond: [
                    {
                    $or: [
                        { $eq: ['$profRaw', ''] },
                        { $eq: [{ $toUpper: '$profRaw' }, '#N/A'] },
                    ],
                    },
                    'Kosong',
                    '$profRaw',
                ],
                },
            },
            },
            { $group: { _id: { prof: '$prof', tp: '$tp' }, count: { $sum: 1 } } },
        ]);

        // Kumpulkan daftar TP yang benar-benar muncul di data + urut sesuai template
        const tpSet = new Set<string>();
        agg.forEach(a => tpSet.add(a._id.tp));
        const tpList = TP_ORDER.filter(tp => tpSet.has(tp)); // hanya TP yang ada

        // Bentuk baris per profesi
        const byProf = new Map<string, { total: number; perTP: Map<string, number> }>();
        for (const a of agg) {
            const prof = a._id.prof || 'Kosong';
            const tp = a._id.tp;
            if (!byProf.has(prof)) byProf.set(prof, { total: 0, perTP: new Map() });
            const p = byProf.get(prof)!;
            p.total += a.count;
            p.perTP.set(tp, (p.perTP.get(tp) || 0) + a.count);
        }

        const total = Array.from(byProf.values()).reduce((s, v) => s + v.total, 0);

        const rows: ProfesiRow[] = Array.from(byProf.entries())
            .map(([prof, v]) => {
            const perTP: Record<string, number> = {};
            tpList.forEach(tp => (perTP[tp] = v.perTP.get(tp) || 0));
            const persen = total ? +((v.total / total) * 100).toFixed(1) : 0; // 1 desimal seperti di screenshot
            return { profesi: prof, jumlah: v.total, persen, perTP };
            })
            .sort((a, b) => b.jumlah - a.jumlah || a.profesi.localeCompare(b.profesi));

        return { rows, total, tps: tpList };
    }

    async getProfesiByUsia(params?: { tahunGabung?: number }): Promise<ProfesiUsiaResponse> {
        const { tahunGabung } = params || {};

        // filter dasar (opsional by tahunGabung)
        const match: any = {};
        if (tahunGabung) match.tahunGabung = tahunGabung;

        // Mongo pipeline
        const pipeline: any[] = [
        { $match: match },

        // Hitung usiaNum: dari field "usia" atau dari "tglLahir"
        {
            $addFields: {
            tpName: {
                $switch: {
                branches: Object.entries(TP_CODE_TO_NAME).map(([code, name]) => ({
                    case: { $eq: ['$tp', code] },
                    then: name,
                })),
                default: '$tp', // biarkan apa adanya kalau tidak cocok
                },
            },
            usiaNum: {
                $ifNull: [
                '$usia',
                {
                    $cond: [
                    { $ifNull: ['$tglLahir', false] },
                    { // umur ≈ floor(dateDiff year)
                        $dateDiff: {
                        startDate: '$tglLahir',
                        endDate: '$$NOW',
                        unit: 'year',
                        },
                    },
                    null,
                    ],
                },
                ],
            },
            profesiClean: { $ifNull: ['$profesi', 'Kosong'] },
            },
        },

        // Tentukan bucket usia
        {
            $addFields: {
            usiaBucket: {
                $switch: {
                branches: [
                    { case: { $and: [{ $ne: ['$usiaNum', null] }, { $lt: ['$usiaNum', 24] }] }, then: '<24 Th' },
                    { case: { $and: [{ $gte: ['$usiaNum', 24] }, { $lte: ['$usiaNum', 35] }] }, then: '24 - 35 Th' },
                    { case: { $and: [{ $gte: ['$usiaNum', 36] }, { $lte: ['$usiaNum', 45] }] }, then: '36 - 45 Th' },
                    { case: { $and: [{ $gte: ['$usiaNum', 46] }, { $lte: ['$usiaNum', 60] }] }, then: '46 - 60 Th' },
                    { case: { $and: [{ $ne: ['$usiaNum', null] }, { $gt: ['$usiaNum', 60] }] }, then: '>60 Th' },
                ],
                default: 'TIDAK VALID',
                },
            },
            },
        },

        // Gunakan facet agar bisa sekaligus hitung grand total
        {
            $facet: {
            rows: [
                {
                $group: {
                    _id: { usia: '$usiaBucket', profesi: '$profesiClean' },
                    jumlah: { $sum: 1 },
                    PBL: { $sum: { $cond: [{ $eq: ['$tpName', 'PBL'] }, 1, 0] } },
                    KRK: { $sum: { $cond: [{ $eq: ['$tpName', 'KRK'] }, 1, 0] } },
                    JBR: { $sum: { $cond: [{ $eq: ['$tpName', 'JBR'] }, 1, 0] } },
                    BWI: { $sum: { $cond: [{ $eq: ['$tpName', 'BWI'] }, 1, 0] } },
                    MJK: { $sum: { $cond: [{ $eq: ['$tpName', 'MJK'] }, 1, 0] } },
                    MGL: { $sum: { $cond: [{ $eq: ['$tpName', 'MGL'] }, 1, 0] } },
                    PML: { $sum: { $cond: [{ $eq: ['$tpName', 'PML'] }, 1, 0] } },
                },
                },
                {
                $project: {
                    _id: 0,
                    usia: '$_id.usia',
                    profesi: '$_id.profesi',
                    jumlah: 1,
                    perTP: {
                    PBL: '$PBL', KRK: '$KRK', JBR: '$JBR', BWI: '$BWI', MJK: '$MJK', MGL: '$MGL', PML: '$PML',
                    },
                },
                },
            ],
            grand: [{ $count: 'n' }],
            },
        },
        ];

        const [{ rows, grand }] = await this.model.aggregate(pipeline).allowDiskUse(true);
        const grandTotal: number = (grand?.[0]?.n as number) || 0;

        // urutan bucket agar sesuai Excel
        const order = ['<24 Th','24 - 35 Th','36 - 45 Th','46 - 60 Th','>60 Th','TIDAK VALID'];
        const bucketMap = new Map<string, ProfesiUsiaBucket>(
        order.map((label) => [label, { usia: label, total: 0, rows: [] }]),
        );

        // isi bucket + hitung total per bucket + persen (dari grandTotal)
        (rows as ProfesiUsiaRow[]).forEach((r) => {
        const b = bucketMap.get(r.usia)!;
        b.total += r.jumlah;
        b.rows.push({
            profesi: r.profesi,
            jumlah: r.jumlah,
            persen: grandTotal ? +(100 * r.jumlah / grandTotal).toFixed(1) : 0,
            perTP: TP_LIST.reduce((o, tp) => {
            o[tp] = r.perTP?.[tp] ?? 0;
            return o;
            }, {} as Record<string, number>),
        });
        });

        // sort dalam bucket: terbesar → kecil (seperti tabel)
        for (const b of bucketMap.values()) {
        b.rows.sort((a, z) => z.jumlah - a.jumlah || a.profesi.localeCompare(z.profesi));
        }

        return {
        buckets: order.map((k) => bucketMap.get(k)!),
        grandTotal,
        tps: TP_LIST,
        };
    }
}
 