import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateWriteOpResult } from 'mongoose';
import * as XLSX from 'xlsx';
import { Pinjaman, PinjamanDocument } from './schema/pinjaman.schema';
import { CreatePinjamanDto } from './dto/create-pinjaman.dto';

import { PipelineStage } from 'mongoose';
import { PinjamanFilterDto } from './dto/pinjaman-analytics.dto';

const TP_ORDER = ['PBL', 'KRK', 'JBR', 'BWI', 'MJK', 'MGL', 'PML'] as const;
type TpKey = typeof TP_ORDER[number];

export type AgeBucketKey = '<24 th' | '24-35 th' | '36-45 th' | '46-60 th' | '>60 th' | 'Tidak Valid';

export interface AgeRow {
  usia: AgeBucketKey;
  total: number;
  persen: number;               // 2 desimal, 0..100
  perTP: Record<TpKey, number>; // count per TP
}

export interface AgeAnalyticsResponse {
  totalAll: number;
  rows: AgeRow[];
  totalsPerTP: Record<TpKey, number>; // total per TP (baris TOTAL)
}

function computeBucket(age: number | null | undefined): AgeBucketKey {
  if (age == null || isNaN(age as any)) return 'Tidak Valid';
  if (age < 24) return '<24 th';
  if (age <= 35) return '24-35 th';
  if (age <= 45) return '36-45 th';
  if (age <= 60) return '46-60 th';
  return '>60 th';
}

const TP = ['PBL', 'KRK', 'JBR', 'BWI', 'MJK', 'MGL', 'PML'] as const;
const PURPOSES: PurposeKey[] = ['KESEHATAN', 'KESEJAHTERAAN', 'KONSUMTIF', 'PENDIDIKAN', 'PRODUKTIF', 'KOSONG'];

// urutan penting: match paling spesifik dulu
const RX: Record<PurposeKey, RegExp> = {
  KESEHATAN: /kesehat|berobat|operas|rumah\s*sakit|obat|bpjs|melahirkan|rawat|perawatan|behel|gigi|cek\s*kesehat/i,
  PENDIDIKAN: /pendidik|sekolah|kuliah|ukt|spp|wisuda|seragam|biaya\s*anak|kampus/i,
  PRODUKTIF: /modal|usaha|dagang|stok|kulakan|warung|toko|konter|bengkel|ternak|sapi|ayam|kambing|kebun|sawah|pupuk|alat\s*(kerja|usaha)|proyek|katering|konveksi|salon|fotocopy|angkut|galon|mebel|percetakan|online\s*shop|depo|kios|ruko/i,
  KESEJAHTERAAN: /renovas|bangun\s*rumah|perbaikan\s*(rumah|atap|talang|dapur)|pagar|pondasi|kanopi|kontrakan|kos\-?kos|sewa\s*(rumah|ruko|kios)|pernikahan|aqiqah|haj(i|atan)|umroh|lebaran|hari\s*raya|sertifikat|pbb|pajak|sertipikat|akta/i,
  KONSUMTIF: /hp|handphone|smartphone|laptop|tv|kulkas|mesin\s*cuci|motor|mobil|seped(a|a\s*listrik)|elektronik|travel|jalan|rekreasi|fashion|kosmetik|emas|smartwatch/i,
  KOSONG: /.^/, // dummy, dipakai terakhir bila tidak kena apapun
};

export type AgeVsPurposeRow = {
  usia: string;
  total: number;
  perPurpose: Record<(typeof PURPOSES)[number], number>; // { KESEHATAN: n, ..., KOSONG: n }
};

export type AgeVsPurposeResp = {
  totalAll: number;
  totalsPerPurpose: Record<(typeof PURPOSES)[number], number>;
  rows: AgeVsPurposeRow[];
};

export type PurposeKey =
  | 'KESEHATAN'
  | 'KESEJAHTERAAN'
  | 'KONSUMTIF'
  | 'PENDIDIKAN'
  | 'PRODUKTIF'
  | 'KOSONG';

export const PURPOSE_ORDER: PurposeKey[] = [
  'KESEHATAN', 'KESEJAHTERAAN', 'KONSUMTIF', 'PENDIDIKAN', 'PRODUKTIF', 'KOSONG',
];

export type UsiaProfesiTujuanRow = {
  profesi: string;
  total: number;                                  // total per baris (akumulasi semua purpose)
  perPurpose: Record<PurposeKey, number>;         // { KESEHATAN: n, ... }
};

export type UsiaProfesiTujuanBucket = {
  usia: string;                                   // "<24 th" | "24-35 th" | ...
  rows: UsiaProfesiTujuanRow[];                   // daftar profesi pada bucket usia tsb
  subtotal: number;                               // total semua baris pada bucket usia
  subtotalPerPurpose: Record<PurposeKey, number>; // subtotal per purpose pada bucket usia
};

export type UsiaProfesiTujuanResponse = {
  purposes: PurposeKey[];
  buckets: UsiaProfesiTujuanBucket[];
  grandTotal: number;
};

export type UsiaProfesiTujuanFilter = {
  year?: number;
  tp?: string[];       // kode TP
  produk?: string;
  cabang?: string;
};

export type UPTBucketRow = {
  profesi: string;
  total: number;
  perPurpose: Record<PurposeKey, number>;
};

export type UPTBucket = {
  usia: string;
  rows: UPTBucketRow[];
  subtotal: number;
  subtotalPerPurpose: Record<PurposeKey, number>;
};

export type UPTResponse = {
  purposes: PurposeKey[];
  buckets: UPTBucket[];
  grandTotal: number;
};

type UPTDoc = {
  usia?: string | null;
  profesi?: string | null;
  kategori?: string | null;
  keterangan?: string | null;
  tglLahir?: Date | null;
  tglPinjam?: Date | null;
};

function ageBucketFrom(dob?: Date | null, ref?: Date | null): string {
  if (!dob) return 'Kosong';
  const r = ref ?? new Date();
  let age = r.getFullYear() - dob.getFullYear();
  const m = r.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && r.getDate() < dob.getDate())) age--;
  if (age < 24) return '<24 th';
  if (age <= 35) return '24-35 th';
  if (age <= 45) return '36-45 th';
  if (age <= 60) return '46-60 th';
  return '>60 th';
}
const normAgeLabel = (s?: string | null, dob?: Date | null, ref?: Date | null) =>
  s && s.trim() ? s.replace(/\s*-\s*/g, '-').trim() : ageBucketFrom(dob, ref);

const PURPOSE_NORMALIZE = (p: any) => ({
  $let: {
    vars: {
      up: { $toUpper: { $trim: { input: { $ifNull: [p, ''] } } } }
    },
    in: {
      $switch: {
        branches: [
          { case: { $regexMatch: { input: '$$up', regex: /KESEHAT/i } }, then: 'KESEHATAN' },
          { case: { $regexMatch: { input: '$$up', regex: /SEJAHTERA/i } }, then: 'KESEJAHTERAAN' },
          { case: { $regexMatch: { input: '$$up', regex: /KONSUM/i } }, then: 'KONSUMTIF' },
          { case: { $regexMatch: { input: '$$up', regex: /PENDIDIK/i } }, then: 'PENDIDIKAN' },
          { case: { $regexMatch: { input: '$$up', regex: /PRODUKTIF/i } }, then: 'PRODUKTIF' },
        ],
        default: 'KOSONG'
      }
    }
  }
});

function normPurpose(kategori?: string | null, keterangan?: string | null): PurposeKey {
  const kat = (kategori || '').toString().trim().toUpperCase();
  if (PURPOSES.includes(kat as PurposeKey)) return kat as PurposeKey;
  if (!kat || kat === '0' || kat === '-') {
    const text = (keterangan || '').toString();
    for (const key of ['KESEHATAN', 'PENDIDIKAN', 'PRODUKTIF', 'KESEJAHTERAAN', 'KONSUMTIF'] as PurposeKey[]) {
      if (RX[key].test(text)) return key;
    }
    return 'KOSONG';
  }
  // kalau isi kategori aneh tapi mirip
  for (const key of PURPOSES) if (kat.includes(key)) return key as PurposeKey;
  return 'KOSONG';
}

@Injectable()
export class PinjamanService {
  constructor(
    @InjectModel(Pinjaman.name) private readonly model: Model<PinjamanDocument>,
  ) { }

  // util: match builder
  private buildMatch(q: PinjamanFilterDto): Record<string, any> {
    const m: any = {};
    if (q.year) m.$expr = { $eq: [{ $year: '$tglPinjam' }, Number(q.year)] };
    if (q.tp?.length) m.tp = { $in: q.tp };
    if (q.produk) m.produk = q.produk;
    if (q.cabang) m.cabang = q.cabang;
    return m;
  }

  // util: $switch untuk usia bucket apabila usiaBucket belum ada
  private ageBucketStages(): PipelineStage[] {
    return [
      {
        $addFields: {
          _ageYears: {
            $cond: [
              { $and: ['$tglLahir', { $ifNull: ['$tglLahir', false] }] },
              {
                $toInt: {
                  $dateDiff: {
                    startDate: '$tglLahir',
                    endDate: { $ifNull: ['$tglPinjam', '$$NOW'] },
                    unit: 'year',
                  },
                },
              },
              '$usia', // fallback: kalau kamu sudah simpan angka usia
            ],
          },
        },
      },
      {
        $addFields: {
          _usiaBucket: {
            $cond: [
              { $ifNull: ['$usiaBucket', false] },
              '$usiaBucket',
              {
                $switch: {
                  branches: [
                    { case: { $lt: ['$_ageYears', 24] }, then: '<24 th' },
                    { case: { $and: [{ $gte: ['$_ageYears', 24] }, { $lte: ['$_ageYears', 35] }] }, then: '24-35 th' },
                    { case: { $and: [{ $gte: ['$_ageYears', 36] }, { $lte: ['$_ageYears', 45] }] }, then: '36-45 th' },
                    { case: { $and: [{ $gte: ['$_ageYears', 46] }, { $lte: ['$_ageYears', 60] }] }, then: '46-60 th' },
                  ],
                  default: '>60 th',
                },
              },
            ],
          },
        },
      },
    ];
  }

  async findAll(filter = {}, limit = 100, skip = 0) {
    return this.model.find(filter).limit(limit).skip(skip).sort({ tglPinjam: -1 }).lean();
  }

  async createOne(dto: CreatePinjamanDto) {
    await this.model.updateOne({ noRek: dto.noRek }, { $set: dto }, { upsert: true });
    return this.model.findOne({ noRek: dto.noRek }).lean();
  }

  /**
   * Bulk upsert memakai bulkWrite agar upsertedCount akurat.
   * Pendekatan ini lebih efisien daripada loop updateOne paralel. :contentReference[oaicite:3]{index=3}
   */
  async bulkUpsert(items: CreatePinjamanDto[]) {
    if (!items?.length) return { matched: 0, modified: 0, upserted: 0, failed: 0 };

    const ops = items.map((dto) => ({
      updateOne: {
        filter: { noRek: dto.noRek },
        update: { $set: dto },
        upsert: true,
      },
    }));

    const res: UpdateWriteOpResult = await (this.model as any).bulkWrite(ops, { ordered: false });
    return {
      matched: res.matchedCount ?? 0,
      modified: res.modifiedCount ?? 0,
      upserted: res.upsertedCount ?? 0,
      failed: 0,
    };
  }

  /**
   * Parse Excel pinjaman:
   * - Deteksi sistem tanggal 1904
   * - Mapping header yang fleksibel (lowercase & trim)
   * - Normalisasi tenor ke bulan
   * - Lewati kolom yang duplikat dari DataAnggota (usia, profesi, tp)
   * Pola parsing terinspirasi dari parseExcel DataAnggotaService. :contentReference[oaicite:4]{index=4}
   */
  parseExcel(buffer: Buffer, sheetName?: string): CreatePinjamanDto[] {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[sheetName || wb.SheetNames[0]];
    if (!ws) throw new Error('Sheet tidak ditemukan');

    const is1904 = !!(wb.Workbook as any)?.WBProps?.date1904;

    const toDateISO = (val: any): string | undefined => {
      if (val == null || val === '') return undefined;
      if (val instanceof Date && !isNaN(+val)) {
        return new Date(Date.UTC(val.getFullYear(), val.getMonth(), val.getDate())).toISOString();
      }
      if (typeof val === 'number') {
        const d = XLSX.SSF.parse_date_code(val, { date1904: is1904 } as any);
        if (!d || !d.y) return undefined;
        return new Date(Date.UTC(d.y, (d.m || 1) - 1, d.d || 1)).toISOString();
      }
      const s = String(val).trim();
      let m = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
      if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString();
      m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2}|\d{4})$/);
      if (m) {
        let y = +m[3]; if (y < 100) y += y >= 50 ? 1900 : 2000;
        return new Date(Date.UTC(y, +m[2] - 1, +m[1])).toISOString();
      }
      const d2 = new Date(s);
      return isNaN(+d2) ? undefined : new Date(Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate())).toISOString();
    };

    const parseTenorBulan = (val: any): number | undefined => {
      if (val == null || val === '') return undefined;
      if (typeof val === 'number') return Math.round(val);
      const s = String(val).toLowerCase().trim();
      let m = s.match(/^(\d+)\s*(bln|bulan)?$/);
      if (m) return +m[1];
      let tahun = 0, bulan = 0;
      m = s.match(/(\d+)\s*(th|tahun)/); if (m) tahun = +m[1];
      m = s.match(/(\d+)\s*(bln|bulan)/); if (m) bulan = +m[1];
      const total = tahun * 12 + bulan;
      return total || undefined;
    };

    const norm = (s: any) =>
      String(s ?? '')
        .toLowerCase()
        .replace(/\./g, '')       // hapus titik
        .replace(/\//g, ' / ')    // jaga slash sebagai token
        .replace(/\s+/g, ' ')     // rapikan spasi
        .trim();

    // Baca sebagai array-of-arrays agar kita bisa cari baris header
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null }) as any[][];
    if (!rows.length) return [];

    // Cari index baris header: yang punya minimal beberapa kolom kunci
    const headerKeywords = ['no rek', 'rek pjmn', 'produk', 'tgl pinjam', 'nilai pinjaman'];
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const line = rows[i].map(norm);
      const hit = headerKeywords.filter(k => line.some(cell => cell.includes(k))).length;
      if (hit >= 2) { headerIdx = i; break; }
    }
    if (headerIdx < 0) {
      // fallback lama seperti DataAnggotaService: geser ke baris 4 (index 3) kalau perlu
      // (tapi lebih aman melempar error agar user isi 'sheet' benar)
      throw new Error('Header tabel tidak ditemukan. Pastikan memilih sheet yang benar atau perbaiki template.');
    }

    const header = rows[headerIdx].map(norm);

    // Buat peta: index kolom -> field DTO
    // Sertakan sinonim header agar fleksibel
    const mapHeader = (h: string): keyof CreatePinjamanDto | null | undefined => {
      if (h === 'no anggota' || h === 'nba') return 'noAgt';
      // if (/^no.? ?rek/.test(h) || h === 'rek pjmn') return 'noRek';
      if (h === 'no rek' || h === 'no. rek.' || h === 'no rek.') return 'noRek';
      if (h === 'produk') return 'produk';
      if (h === 'tgl pinjam' || h === 'tgl pinjam terakhir' || h === 'tgl pinjaman') return 'tglPinjam';
      if (h === 'tgl angsur terakhir' || h === 'tgl angsuran terakhir') return 'tglAngsurTerakhir';
      if (h === 'nilai pinjaman') return 'nilaiPinjaman';
      if (h === 'jangka waktu') return 'tenorBulan';
      if (h === 'suku bunga (%)' || h === 'suku bunga %' || h === 'suku bunga') return 'sukuBungaPct';
      if (h === 'jns angsuran' || h === 'jenis angsuran' || h === 'jns angsuran /') return 'jenisAngsuran';
      if (h === 'spp / spk' || h === 'spp/spk' || h === 'spp spk') return 'sppSpk';
      if (h === 'tujuan') return 'tujuan';
      if (h === 'kategori') return 'kategori';
      if (h === 'saldo pinjaman') return 'saldoPinjaman';
      if (h === 'saldo hutang bunga') return 'saldoHutangBunga';
      if (h === 'jaminan') return 'jaminan';
      if (h === 'keterangan jaminan' || h === 'keterangan jaminan ') return 'keteranganJaminan';
      if (h === 'cabang') return 'cabang';
      if (h === 'anggota' || h === 'no' || h === '') return null; // display-only / di-skip
      return undefined; // header tak dikenal -> abaikan
    };

    const colMap: Array<{ idx: number; key: keyof CreatePinjamanDto }> = [];
    header.forEach((h, idx) => {
      const mapped = mapHeader(h);
      if (mapped === undefined || mapped === null) return;
      colMap.push({ idx, key: mapped });
    });

    const out: CreatePinjamanDto[] = [];
    for (let r = headerIdx + 1; r < rows.length; r++) {
      const line = rows[r];
      if (!line || line.every(v => v === null || v === '')) continue;

      const dto: any = {};
      for (const { idx, key } of colMap) {
        const v = line[idx];
        switch (key) {
          case 'tglPinjam':
          case 'tglAngsurTerakhir':
            dto[key] = toDateISO(v);
            break;
          case 'tenorBulan':
            dto[key] = parseTenorBulan(v);
            break;
          case 'sukuBungaPct':
          case 'nilaiPinjaman':
          case 'saldoPinjaman':
          case 'saldoHutangBunga':
            dto[key] = (v === '' || v == null) ? undefined : Number(String(v).replace(/[^\d.-]/g, ''));
            break;
          default:
            dto[key] = v == null ? undefined : String(v).trim();
        }
      }

      // Pastikan noRek terisi: coba pakai 'rek pjmn' bila 'no rek' kosong (sudah di-handle via colMap di atas)
      if (dto.noRek) out.push(dto);
    }

    return out;
  }

  async getAgeAnalytics(opts: { year?: number; tp?: string[]; produk?: string; cabang?: string }): Promise<AgeAnalyticsResponse> {
    const match: any = {};
    if (opts.produk) match.produk = opts.produk;
    if (opts.cabang) match.cabang = opts.cabang;
    if (opts.year) {
      const y = Number(opts.year);
      match.tglPinjam = { $gte: new Date(Date.UTC(y, 0, 1)), $lt: new Date(Date.UTC(y + 1, 0, 1)) };
    }

    const TP = ['PBL', 'KRK', 'JBR', 'BWI', 'MJK', 'MGL', 'PML'];

    const pipeline: PipelineStage[] = [
      { $match: match },

      // join ke data_anggota via noAgt
      {
        $lookup: {
          from: 'data_anggota',
          localField: 'noAgt',
          foreignField: 'noAgt',
          as: 'anggota',
        },
      },
      { $unwind: { path: '$anggota', preserveNullAndEmptyArrays: true } },

      // siapkan TP & usia (fallback dari tglLahir); buang TP yang tak dikenal
      {
        $addFields: {
          _tp: '$anggota.tp',
          _usia: {
            $ifNull: [
              '$anggota.usia',
              {
                $cond: [
                  { $ifNull: ['$anggota.tglLahir', false] },
                  { $dateDiff: { startDate: '$anggota.tglLahir', endDate: '$$NOW', unit: 'year' } },
                  null,
                ],
              },
            ],
          },
        },
      },
      { $match: { _tp: { $in: TP } } }, // cegah null/unknown TP masuk ke group

      // bucket usia
      {
        $addFields: {
          _bucket: {
            $switch: {
              branches: [
                { case: { $and: [{ $ne: ['$_usia', null] }, { $lt: ['$_usia', 24] }] }, then: '<24 th' },
                { case: { $and: [{ $gte: ['$_usia', 24] }, { $lte: ['$_usia', 35] }] }, then: '24-35 th' },
                { case: { $and: [{ $gte: ['$_usia', 36] }, { $lte: ['$_usia', 45] }] }, then: '36-45 th' },
                { case: { $and: [{ $gte: ['$_usia', 46] }, { $lte: ['$_usia', 60] }] }, then: '46-60 th' },
                { case: { $gt: ['$_usia', 60] }, then: '>60 th' },
              ],
              default: 'Tidak Valid',
            },
          },
        },
      },

      // akumulasi per bucket + per TP dengan sum/cond (aman dari null)
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

      // bentuk objek perTP yang rapi
      {
        $project: {
          _id: 0,
          usia: '$_id',
          total: 1,
          perTP: {
            PBL: '$PBL', KRK: '$KRK', JBR: '$JBR', BWI: '$BWI',
            MJK: '$MJK', MGL: '$MGL', PML: '$PML',
          },
        },
      },
    ];

    const raw = await this.model.aggregate(pipeline);

    // normalisasi: isi kolom TP yang tidak ada -> 0
    const rows: AgeRow[] = [];
    let grandTotal = 0;
    const totalsPerTP: Record<TpKey, number> = { PBL: 0, KRK: 0, JBR: 0, BWI: 0, MJK: 0, MGL: 0, PML: 0 };

    const BUCKET_ORDER: AgeBucketKey[] = ['<24 th', '24-35 th', '36-45 th', '46-60 th', '>60 th', 'Tidak Valid'];

    for (const b of BUCKET_ORDER) {
      const found = raw.find((r: any) => r.usia === b);
      const perTP: Record<TpKey, number> = { PBL: 0, KRK: 0, JBR: 0, BWI: 0, MJK: 0, MGL: 0, PML: 0 } as any;
      let total = 0;

      if (found) {
        for (const tp of TP_ORDER) {
          const val = Number(found.perTP?.[tp] ?? 0);
          perTP[tp] = val;
          totalsPerTP[tp] += val;
          total += val;
        }
      }
      grandTotal += total;
      rows.push({ usia: b, total, persen: 0, perTP });
    }

    // hitung persen 2 desimal, dan kunci TOTAL per TP
    rows.forEach(r => {
      r.persen = grandTotal ? Math.round(((r.total / grandTotal) * 100) * 100) / 100 : 0;
    });

    return { totalAll: grandTotal, rows, totalsPerTP };
  }

  async getAgeVsPurpose(opts: { year?: number; tp?: string[]; produk?: string; cabang?: string }): Promise<AgeVsPurposeResp> {
    const match: any = {};
    if (opts.produk) match.produk = opts.produk;
    if (opts.cabang) match.cabang = opts.cabang;
    if (opts.year) {
      const y = Number(opts.year);
      match.tglPinjam = { $gte: new Date(Date.UTC(y, 0, 1)), $lt: new Date(Date.UTC(y + 1, 0, 1)) };
    }

    const pipeline: PipelineStage[] = [
      { $match: match },

      // join anggota untuk ambil usia/TP
      {
        $lookup: {
          from: 'data_anggota',
          localField: 'noAgt',
          foreignField: 'noAgt',
          as: 'anggota',
        },
      },
      { $unwind: { path: '$anggota', preserveNullAndEmptyArrays: true } },

      // siapkan field bantu: _tp, _usia, _bucket, _purpose
      {
        $addFields: {
          _tp: '$anggota.tp',
          _usia: {
            $ifNull: [
              '$anggota.usia',
              {
                $cond: [
                  { $ifNull: ['$anggota.tglLahir', false] },
                  { $dateDiff: { startDate: '$anggota.tglLahir', endDate: '$$NOW', unit: 'year' } },
                  null,
                ],
              },
            ],
          },
        },
      },
      // filter TP valid kalau user memfilter tp[]
      ...(opts.tp?.length ? [{ $match: { _tp: { $in: opts.tp } } } as PipelineStage] : []),

      // bucket usia
      {
        $addFields: {
          _bucket: {
            $switch: {
              branches: [
                { case: { $and: [{ $ne: ['$_usia', null] }, { $lt: ['$_usia', 24] }] }, then: '<24 th' },
                { case: { $and: [{ $gte: ['$_usia', 24] }, { $lte: ['$_usia', 35] }] }, then: '24-35 th' },
                { case: { $and: [{ $gte: ['$_usia', 36] }, { $lte: ['$_usia', 45] }] }, then: '36-45 th' },
                { case: { $and: [{ $gte: ['$_usia', 46] }, { $lte: ['$_usia', 60] }] }, then: '46-60 th' },
                { case: { $gt: ['$_usia', 60] }, then: '>60 th' },
              ],
              default: 'Tidak Valid',
            },
          },
        },
      },

      // normalisasi kategori -> PURPOSES
      {
        $addFields: {
          _kat: {
            $let: {
              vars: { k: { $toUpper: { $ifNull: ['$kategori', ''] } } },
              in: {
                $switch: {
                  branches: [
                    { case: { $eq: ['$$k', 'KESEHATAN'] }, then: 'KESEHATAN' },
                    { case: { $eq: ['$$k', 'KESEJAHTERAAN'] }, then: 'KESEJAHTERAAN' },
                    { case: { $eq: ['$$k', 'KONSUMTIF'] }, then: 'KONSUMTIF' },
                    { case: { $eq: ['$$k', 'PENDIDIKAN'] }, then: 'PENDIDIKAN' },
                    { case: { $eq: ['$$k', 'PRODUKTIF'] }, then: 'PRODUKTIF' },
                  ],
                  default: 'KOSONG',
                },
              },
            },
          },
        },
      },

      // agregasi per bucket + per purpose (tanpa arrayToObject)
      {
        $group: {
          _id: '$_bucket',
          total: { $sum: 1 },
          KESEHATAN: { $sum: { $cond: [{ $eq: ['$_kat', 'KESEHATAN'] }, 1, 0] } },
          KESEJAHTERAAN: { $sum: { $cond: [{ $eq: ['$_kat', 'KESEJAHTERAAN'] }, 1, 0] } },
          KONSUMTIF: { $sum: { $cond: [{ $eq: ['$_kat', 'KONSUMTIF'] }, 1, 0] } },
          PENDIDIKAN: { $sum: { $cond: [{ $eq: ['$_kat', 'PENDIDIKAN'] }, 1, 0] } },
          PRODUKTIF: { $sum: { $cond: [{ $eq: ['$_kat', 'PRODUKTIF'] }, 1, 0] } },
          KOSONG: { $sum: { $cond: [{ $eq: ['$_kat', 'KOSONG'] }, 1, 0] } },
        },
      },

      // bentuk output
      {
        $project: {
          _id: 0,
          usia: '$_id',
          total: 1,
          perPurpose: {
            KESEHATAN: '$KESEHATAN',
            KESEJAHTERAAN: '$KESEJAHTERAAN',
            KONSUMTIF: '$KONSUMTIF',
            PENDIDIKAN: '$PENDIDIKAN',
            PRODUKTIF: '$PRODUKTIF',
            KOSONG: '$KOSONG',
          },
        },
      },
    ];

    const raw = (await (this.model as any).aggregate(pipeline)) as AgeVsPurposeRow[];

    // urutkan bucket
    const order = new Map([['<24 th', 0], ['24-35 th', 1], ['36-45 th', 2], ['46-60 th', 3], ['>60 th', 4], ['Tidak Valid', 5]]);
    raw.sort((a, b) => (order.get(a.usia) ?? 99) - (order.get(b.usia) ?? 99));

    // hitung grand total & kolom total per kategori
    const totalAll = raw.reduce((s, r) => s + r.total, 0);
    const totalsPerPurpose: Record<(typeof PURPOSES)[number], number> = {
      KESEHATAN: 0, KESEJAHTERAAN: 0, KONSUMTIF: 0, PENDIDIKAN: 0, PRODUKTIF: 0, KOSONG: 0,
    };
    for (const r of raw) {
      for (const k of PURPOSES) totalsPerPurpose[k] += Number(r.perPurpose[k] ?? 0);
    }

    return { totalAll, totalsPerPurpose, rows: raw };
  }

  async getProfesiVsTujuan(opts: PinjamanFilterDto) {
    const match: any = this.buildMatch(opts);

    const pipe: PipelineStage[] = [
      { $match: match },
      { $lookup: { from: 'data_anggota', localField: 'noAgt', foreignField: 'noAgt', as: 'agt' } },
      { $unwind: { path: '$agt', preserveNullAndEmptyArrays: true } },

      // filter TP setelah lookup bila diberikan
      ...(opts.tp?.length ? [{ $match: { 'agt.tp': { $in: opts.tp } } }] : []),

      {
        $project: {
          profesi: { $ifNull: [{ $trim: { input: '$agt.profesi' } }, 'Kosong'] },
          tujuanN: PURPOSE_NORMALIZE('$tujuan'),
        }
      },

      {
        $facet: {
          rows: [
            { $group: { _id: { profesi: '$profesi', tujuan: '$tujuanN' }, c: { $sum: 1 } } },
            {
              $group: {
                _id: '$_id.profesi',
                items: { $push: { k: '$_id.tujuan', v: '$c' } },
                total: { $sum: '$c' }
              }
            },
            {
              $project: {
                _id: 0,
                profesi: '$_id',
                perPurpose: { $arrayToObject: '$items' },
                total: 1
              }
            },
            { $sort: { profesi: 1 } }
          ],

          totalsPerPurpose: [
            { $group: { _id: PURPOSE_NORMALIZE('$tujuan'), total: { $sum: 1 } } },
            { $project: { _id: 0, k: '$_id', v: '$total' } }
          ],

          totalAll: [{ $count: 'n' }]
        }
      }
    ];

    const [res] = await (this.model as any).aggregate(pipe).exec();
    const totalsPerPurpose = Object.fromEntries((res?.totalsPerPurpose ?? []).map((x: any) => [x.k, x.v]));
    const totalAll = res?.totalAll?.[0]?.n ?? 0;

    return {
      totalAll,
      totalsPerPurpose,      // { KESEHATAN: 21, KESEJAHTERAAN: 264, ... }
      rows: res?.rows ?? []  // [{ profesi, perPurpose: {..}, total }]
    };
  }

  /** TABEL 2 — Profesi peminjam per TP (kolom GAB = total baris) */
  async getProfesiPerTP(opts: PinjamanFilterDto) {
    const match: any = this.buildMatch(opts);

    const pipe: PipelineStage[] = [
      { $match: match },
      { $lookup: { from: 'data_anggota', localField: 'noAgt', foreignField: 'noAgt', as: 'agt' } },
      { $unwind: { path: '$agt', preserveNullAndEmptyArrays: true } },
      ...(opts.tp?.length ? [{ $match: { 'agt.tp': { $in: opts.tp } } }] : []),

      {
        $project: {
          profesi: { $ifNull: [{ $trim: { input: '$agt.profesi' } }, 'Kosong'] },
          tp: { $ifNull: ['$agt.tp', '-'] }
        }
      },

      {
        $facet: {
          rows: [
            { $group: { _id: { profesi: '$profesi', tp: '$tp' }, c: { $sum: 1 } } },
            {
              $group: {
                _id: '$_id.profesi',
                items: { $push: { k: '$_id.tp', v: '$c' } },
                total: { $sum: '$c' }
              }
            },
            {
              $project: {
                _id: 0,
                profesi: '$_id',
                perTP: { $arrayToObject: '$items' },
                total: 1
              }
            },
            { $sort: { total: -1, profesi: 1 } }
          ],

          totalsPerTP: [
            { $group: { _id: '$agt.tp', total: { $sum: 1 } } },
            { $project: { _id: 0, k: { $ifNull: ['$_id', '-'] }, v: '$total' } }
          ],

          grandTotal: [{ $count: 'n' }]
        }
      }
    ];

    const [res] = await (this.model as any).aggregate(pipe).exec();
    const totalsPerTP = Object.fromEntries((res?.totalsPerTP ?? []).map((x: any) => [x.k, x.v]));
    const grandTotal = res?.grandTotal?.[0]?.n ?? 0;

    // urutkan kolom TP yang umum
    const TP_ORDER = ['PBL', 'KRK', 'JBR', 'BWI', 'MJK', 'MGL', 'PML', '-'];
    const tps = Object.keys(totalsPerTP).sort((a, b) => TP_ORDER.indexOf(a) - TP_ORDER.indexOf(b));

    return {
      tps,                    // urutan kolom TP di frontend
      grandTotal,
      totalsPerTP,           // { PBL: 671, KRK: 299, ... }
      rows: res?.rows ?? []  // [{ profesi, perTP: {PBL:n, KRK:n,...}, total }]
    };
  }

  async getUsiaProfesiTujuan(q: UsiaProfesiTujuanFilter): Promise<UPTResponse> {
    const match: any = {};
    if (q.year) {
      match.tglPinjam = { $gte: new Date(q.year, 0, 1), $lt: new Date(q.year + 1, 0, 1) };
    }
    if (q.produk) match.produk = q.produk;
    if (q.cabang) match.cabang = q.cabang;

    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $lookup: {
          from: 'data_anggota',
          localField: 'noAgt',
          foreignField: 'noAgt',
          as: 'agt',
        },
      },
      { $unwind: { path: '$agt', preserveNullAndEmptyArrays: true } },

      // filter TP (dari data_anggota)
      ...(q.tp?.length ? [{ $match: { 'agt.tp': { $in: q.tp } } } as PipelineStage] : []),

      // hitung usia (pakai anggota.usia kalau ada; fallback dateDiff dari tglLahir)
      {
        $addFields: {
          _usiaNum: {
            $ifNull: [
              '$agt.usia',
              {
                $cond: [
                  { $ifNull: ['$agt.tglLahir', false] },
                  { $dateDiff: { startDate: '$agt.tglLahir', endDate: '$$NOW', unit: 'year' } },
                  null,
                ],
              },
            ],
          },
          _profesi: { $ifNull: [{ $trim: { input: '$agt.profesi' } }, 'Kosong'] },
        },
      },

      // bucket usia
      {
        $addFields: {
          _bucket: {
            $switch: {
              branches: [
                { case: { $and: [{ $ne: ['$_usiaNum', null] }, { $lt: ['$_usiaNum', 24] }] }, then: '<24 th' },
                { case: { $and: [{ $gte: ['$_usiaNum', 24] }, { $lte: ['$_usiaNum', 35] }] }, then: '24-35 th' },
                { case: { $and: [{ $gte: ['$_usiaNum', 36] }, { $lte: ['$_usiaNum', 45] }] }, then: '36-45 th' },
                { case: { $and: [{ $gte: ['$_usiaNum', 46] }, { $lte: ['$_usiaNum', 60] }] }, then: '46-60 th' },
                { case: { $gt: ['$_usiaNum', 60] }, then: '>60 th' },
              ],
              default: 'Tidak Valid',
            },
          },
        },
      },

      // kirim ke JS untuk klasifikasi keterangan -> purpose (normPurpose)
      {
        $project: {
          _id: 0,
          usia: '$_bucket',
          profesi: '$_profesi',
          kategori: '$kategori',
          keterangan: '$keterangan',
        },
      },
    ];

    type RowIn = { usia: string; profesi: string; kategori?: string | null; keterangan?: string | null };
    const docs = (await (this.model as any).aggregate(pipeline).exec()) as RowIn[];

    // === Reduce in-memory agar mapping purpose tetap pakai normPurpose ===
    const byAge = new Map<string, Map<string, UPTBucketRow>>();

    for (const d of docs) {
      const usia = d.usia?.replace(/\s*-\s*/g, '-') || 'Tidak Valid';
      const profesi = d.profesi?.trim() || 'Kosong';
      const pcat = normPurpose(d.kategori ?? null, d.keterangan ?? null);

      if (!byAge.has(usia)) byAge.set(usia, new Map());
      const m = byAge.get(usia)!;
      if (!m.has(profesi)) {
        m.set(profesi, {
          profesi,
          total: 0,
          perPurpose: { KESEHATAN: 0, KESEJAHTERAAN: 0, KONSUMTIF: 0, PENDIDIKAN: 0, PRODUKTIF: 0, KOSONG: 0 },
        });
      }
      const row = m.get(profesi)!;
      row.total += 1;
      row.perPurpose[pcat] += 1;
    }

    const AGE_ORDER = ['<24 th', '24-35 th', '36-45 th', '46-60 th', '>60 th', 'Tidak Valid'];
    const ages = [...byAge.keys()].sort((a, b) => AGE_ORDER.indexOf(a) - AGE_ORDER.indexOf(b));

    const buckets: UPTBucket[] = [];
    let grandTotal = 0;

    for (const usia of ages) {
      const rows = [...byAge.get(usia)!.values()].sort((a, b) => b.total - a.total);
      const subtotal = rows.reduce((s, r) => s + r.total, 0);
      grandTotal += subtotal;

      const subtotalPerPurpose = { KESEHATAN: 0, KESEJAHTERAAN: 0, KONSUMTIF: 0, PENDIDIKAN: 0, PRODUKTIF: 0, KOSONG: 0 } as Record<PurposeKey, number>;
      for (const r of rows) for (const k of PURPOSES) subtotalPerPurpose[k] += r.perPurpose[k];

      buckets.push({ usia, rows, subtotal, subtotalPerPurpose });
    }

    return { purposes: PURPOSES, buckets, grandTotal };
  }

  /**
   * Get Tujuan Pinjaman vs Kategori Pembayaran Angsuran
   * Kategori based on months since last payment (tglAngsurTerakhir)
   */
  async getTujuanPembayaran(opts: { year?: number; tp?: string[] }) {
    const match: any = {};
    if (opts.year) {
      match.tglPinjam = { $gte: new Date(opts.year, 0, 1), $lt: new Date(opts.year + 1, 0, 1) };
    }

    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $lookup: {
          from: 'data_anggota',
          localField: 'noAgt',
          foreignField: 'noAgt',
          as: 'agt',
        },
      },
      { $unwind: { path: '$agt', preserveNullAndEmptyArrays: true } },
      ...(opts.tp?.length ? [{ $match: { 'agt.tp': { $in: opts.tp } } } as PipelineStage] : []),

      {
        $project: {
          _id: 0,
          kategori: '$kategori',
          keterangan: '$keterangan',
          tglAngsurTerakhir: '$tglAngsurTerakhir',
        },
      },
    ];

    type RowIn = { kategori?: string | null; keterangan?: string | null; tglAngsurTerakhir?: Date | null };
    const docs = (await (this.model as any).aggregate(pipeline).exec()) as RowIn[];

    // Process in-memory
    const byPurpose = new Map<PurposeKey, any>();

    for (const d of docs) {
      const purpose = normPurpose(d.kategori, d.keterangan);

      if (!byPurpose.has(purpose)) {
        byPurpose.set(purpose, {
          tujuan: purpose,
          total: 0,
          breakdown: {
            LANCAR_0_3: 0,
            LANCAR_4_6: 0,
            KURANG_LANCAR: 0,
            DIRAGUKAN_7_12: 0,
            MACET_12_PLUS: 0,
          },
        });
      }

      const row = byPurpose.get(purpose)!;
      row.total += 1;

      // Calculate payment category based on months since last payment
      if (d.tglAngsurTerakhir) {
        const lastPayment = new Date(d.tglAngsurTerakhir);
        const now = new Date();
        const monthsDiff = (now.getFullYear() - lastPayment.getFullYear()) * 12 + (now.getMonth() - lastPayment.getMonth());

        if (monthsDiff <= 3) {
          row.breakdown.LANCAR_0_3 += 1;
        } else if (monthsDiff <= 6) {
          row.breakdown.LANCAR_4_6 += 1;
        } else if (monthsDiff <= 12) {
          row.breakdown.DIRAGUKAN_7_12 += 1;
        } else {
          row.breakdown.MACET_12_PLUS += 1;
        }
      } else {
        // No payment date = KURANG LANCAR
        row.breakdown.KURANG_LANCAR += 1;
      }
    }

    const rows = PURPOSES.map((p) => byPurpose.get(p)).filter((r) => r && r.total > 0);
    let grandTotal = 0;
    const totals = {
      LANCAR_0_3: 0,
      LANCAR_4_6: 0,
      KURANG_LANCAR: 0,
      DIRAGUKAN_7_12: 0,
      MACET_12_PLUS: 0,
    };

    for (const row of rows) {
      grandTotal += row.total;
      totals.LANCAR_0_3 += row.breakdown.LANCAR_0_3;
      totals.LANCAR_4_6 += row.breakdown.LANCAR_4_6;
      totals.KURANG_LANCAR += row.breakdown.KURANG_LANCAR;
      totals.DIRAGUKAN_7_12 += row.breakdown.DIRAGUKAN_7_12;
      totals.MACET_12_PLUS += row.breakdown.MACET_12_PLUS;
    }

    return { rows, grandTotal, totals };
  }
}