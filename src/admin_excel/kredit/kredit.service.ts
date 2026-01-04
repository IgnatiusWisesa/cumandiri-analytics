import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateWriteOpResult, PipelineStage } from 'mongoose';
import * as XLSX from 'xlsx';
import { Kredit, KreditDocument } from './schema/kredit.schema';
import { CreateKreditDto } from './dto/create-kredit.dto';
import { KreditFilterDto } from './dto/kredit-filter.dto';

const TP_ORDER = ['PBL', 'KRK', 'JBR', 'BWI', 'MJK', 'MGL', 'PML'] as const;
type TpKey = typeof TP_ORDER[number];

export type AgeBucketKey = '<24 th' | '24-35 th' | '36-45 th' | '46-60 th' | '>60 th' | 'Tidak Valid';

export interface AgeRow {
    usia: AgeBucketKey;
    total: number;
    persen: number;
    perTP: Record<TpKey, number>;
}

export interface AgeAnalyticsResponse {
    totalAll: number;
    rows: AgeRow[];
    totalsPerTP: Record<TpKey, number>;
}

// Usia × Profesi × Kategori types
export type KategoriKey = 'LANCAR' | 'MACET' | 'KOSONG';

export type UPKRow = {
    profesi: string;
    total: number;
    perKategori: Record<KategoriKey, number>;
};

export type UPKBucket = {
    usia: string;
    rows: UPKRow[];
    subtotal: number;
    subtotalPerKategori: Record<KategoriKey, number>;
};

export type UPKResponse = {
    kategoris: KategoriKey[];
    buckets: UPKBucket[];
    grandTotal: number;
};

// Purpose classification (same as pinjaman)
export type PurposeKey = 'KESEHATAN' | 'KESEJAHTERAAN' | 'KONSUMTIF' | 'PENDIDIKAN' | 'PRODUKTIF' | 'KOSONG';
const PURPOSES: PurposeKey[] = ['KESEHATAN', 'KESEJAHTERAAN', 'KONSUMTIF', 'PENDIDIKAN', 'PRODUKTIF', 'KOSONG'];

const RX: Record<PurposeKey, RegExp> = {
    KESEHATAN: /kesehat|berobat|operas|rumah\s*sakit|obat|bpjs|melahirkan|rawat|perawatan|behel|gigi|cek\s*kesehat/i,
    PENDIDIKAN: /pendidik|sekolah|kuliah|ukt|spp|wisuda|seragam|biaya\s*anak|kampus/i,
    PRODUKTIF: /modal|usaha|dagang|stok|kulakan|warung|toko|konter|bengkel|ternak|sapi|ayam|kambing|kebun|sawah|pupuk|alat\s*(kerja|usaha)|proyek|katering|konveksi|salon|fotocopy|angkut|galon|mebel|percetakan|online\s*shop|depo|kios|ruko/i,
    KESEJAHTERAAN: /renovas|bangun\s*rumah|perbaikan\s*(rumah|atap|talang|dapur)|pagar|pondasi|kanopi|kontrakan|kos\-?kos|sewa\s*(rumah|ruko|kios)|pernikahan|aqiqah|haj(i|atan)|umroh|lebaran|hari\s*raya|sertifikat|pbb|pajak|sertipikat|akta/i,
    KONSUMTIF: /hp|handphone|smartphone|laptop|tv|kulkas|mesin\s*cuci|motor|mobil|seped(a|a\s*listrik)|elektronik|travel|jalan|rekreasi|fashion|kosmetik|emas|smartwatch/i,
    KOSONG: /.^/,
};

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

// Usia × Profesi × Purpose (kategori pinjaman) types
export type UPPRow = {
    profesi: string;
    total: number;
    perPurpose: Record<PurposeKey, number>;
};

export type UPPBucket = {
    usia: string;
    rows: UPPRow[];
    subtotal: number;
    subtotalPerPurpose: Record<PurposeKey, number>;
};

export type UPPResponse = {
    purposes: PurposeKey[];
    buckets: UPPBucket[];
    grandTotal: number;
};

@Injectable()
export class KreditService {
    constructor(
        @InjectModel(Kredit.name) private readonly model: Model<KreditDocument>,
    ) { }

    async findAll(filter = {}, limit = 100, skip = 0) {
        return this.model.find(filter).limit(limit).skip(skip).sort({ tglPinjam: -1 }).lean();
    }

    async createOne(dto: CreateKreditDto) {
        await this.model.updateOne({ noRek: dto.noRek }, { $set: dto }, { upsert: true });
        return this.model.findOne({ noRek: dto.noRek }).lean();
    }

    /**
     * Bulk upsert using bulkWrite for accurate upsertedCount
     */
    async bulkUpsert(items: CreateKreditDto[]) {
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
     * Parse Excel kredit:
     * - Detect 1904 date system
     * - Flexible header mapping (lowercase & trim)
     * - Skip duplicate columns (usia, profesi, tp - these come from data_anggota join)
     * - Use noRek as unique identifier
     */
    parseExcel(buffer: Buffer, sheetName?: string): CreateKreditDto[] {
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
                let y = +m[3];
                if (y < 100) y += y >= 50 ? 1900 : 2000;
                return new Date(Date.UTC(y, +m[2] - 1, +m[1])).toISOString();
            }
            const d2 = new Date(s);
            return isNaN(+d2) ? undefined : new Date(Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate())).toISOString();
        };

        const norm = (s: any) =>
            String(s ?? '')
                .toLowerCase()
                .replace(/\./g, '')
                .replace(/\//g, ' / ')
                .replace(/\s+/g, ' ')
                .trim();

        // Read as array-of-arrays to find header row
        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null }) as any[][];
        if (!rows.length) return [];

        // Find header row: must have key columns
        const headerKeywords = ['no rek', 'nilai pinjaman', 'saldo pinjaman', 'angsuran tetap'];
        let headerIdx = -1;
        for (let i = 0; i < rows.length; i++) {
            const line = rows[i].map(norm);
            const hit = headerKeywords.filter((k) => line.some((cell) => cell.includes(k))).length;
            if (hit >= 2) {
                headerIdx = i;
                break;
            }
        }
        if (headerIdx < 0) {
            throw new Error('Header tabel tidak ditemukan. Pastikan memilih sheet yang benar atau perbaiki template.');
        }

        const header = rows[headerIdx].map(norm);

        // Map header to DTO fields
        // IMPORTANT: Skip usia, profesi, tp (these will come from data_anggota join)
        const mapHeader = (h: string): keyof CreateKreditDto | null | undefined => {
            if (h === 'no anggota' || h === 'nba') return 'noAgt';
            if (h === 'no rek' || h === 'no. rek.' || h === 'no rek.') return 'noRek';
            if (h === 'tgl pinjam' || h === 'tgl. pinjam' || h === 'tgl pinjaman') return 'tglPinjam';
            if (h === 'angsuran tetap') return 'angsuranTetap';
            if (h === 'nilai pinjaman') return 'nilaiPinjaman';
            if (h === 'suku bunga (%)' || h === 'suku bunga %' || h === 'suku bunga') return 'sukuBungaPct';
            if (h === 'saldo pinjaman') return 'saldoPinjaman';

            // Status kredit (LANCAR/MACET/dll)
            if (h === 'kategori' && !h.includes('pinjam')) return 'statusKredit'; // "Kategori" column (LANCAR/MACET)

            // Tujuan & kategori pinjaman
            if (h === 'tujuan') return 'tujuan';
            if (h === 'kategori pinjam' || h === 'kategori pinjaman') return 'kategori'; // PRODUKTIF/KONSUMTIF/etc
            if (h === 'keterangan' || h === 'keterangan jaminan') return 'keterangan';

            if (h === 'ugl') return 'ugl';
            if (h === 'sep-25' || h === 'sep 25') return 'sep25';

            // SKIP these columns - they come from data_anggota
            if (h === 'usia' || h === 'profesi' || h === 'tp' || h === 'nama') return null;

            // Display-only columns
            if (h === 'anggota' || h === 'no' || h === '') return null;

            return undefined; // unknown header - ignore
        };

        const colMap: Array<{ idx: number; key: keyof CreateKreditDto }> = [];
        header.forEach((h, idx) => {
            const mapped = mapHeader(h);
            if (mapped === undefined || mapped === null) return;
            colMap.push({ idx, key: mapped });
        });

        const out: CreateKreditDto[] = [];
        for (let r = headerIdx + 1; r < rows.length; r++) {
            const line = rows[r];
            if (!line || line.every((v) => v === null || v === '')) continue;

            const dto: any = {};
            for (const { idx, key } of colMap) {
                const v = line[idx];
                switch (key) {
                    case 'tglPinjam':
                        dto[key] = toDateISO(v);
                        break;
                    case 'angsuranTetap':
                    case 'nilaiPinjaman':
                    case 'sukuBungaPct':
                    case 'saldoPinjaman':
                        dto[key] = v === '' || v == null ? undefined : Number(String(v).replace(/[^\d.-]/g, ''));
                        break;
                    default:
                        dto[key] = v == null ? undefined : String(v).trim();
                }
            }

            // Ensure noRek is present
            if (dto.noRek) out.push(dto);
        }

        return out;
    }

    /**
     * Get age analytics for kredit
     * Join with data_anggota to get usia, profesi, tp
     */
    async getAgeAnalytics(opts: { year?: number; tp?: string[]; kategori?: string; ugl?: string }): Promise<AgeAnalyticsResponse> {
        const match: any = {};
        if (opts.kategori) match.kategori = opts.kategori;
        if (opts.ugl) match.ugl = opts.ugl;
        if (opts.year) {
            const y = Number(opts.year);
            match.tglPinjam = { $gte: new Date(Date.UTC(y, 0, 1)), $lt: new Date(Date.UTC(y + 1, 0, 1)) };
        }

        const TP = ['PBL', 'KRK', 'JBR', 'BWI', 'MJK', 'MGL', 'PML'];

        const pipeline: PipelineStage[] = [
            { $match: match },

            // Join to data_anggota via noAgt
            {
                $lookup: {
                    from: 'data_anggota',
                    localField: 'noAgt',
                    foreignField: 'noAgt',
                    as: 'anggota',
                },
            },
            { $unwind: { path: '$anggota', preserveNullAndEmptyArrays: true } },

            // Prepare TP & usia (fallback from tglLahir)
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
            { $match: { _tp: { $in: TP } } }, // Filter valid TP

            // Bucket usia
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

            // Group by bucket + TP
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

            // Shape output
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

        const raw = await this.model.aggregate(pipeline);

        // Normalize: fill missing TP columns with 0
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

        // Calculate percentage (2 decimals)
        rows.forEach((r) => {
            r.persen = grandTotal ? Math.round(((r.total / grandTotal) * 100) * 100) / 100 : 0;
        });

        return { totalAll: grandTotal, rows, totalsPerTP };
    }

    /**
     * Get age analytics with status kredit breakdown per TP
     */
    async getAgeAnalyticsWithStatus(opts: { year?: number; tp?: string[]; ugl?: string }) {
        const match: any = {};
        if (opts.ugl) match.ugl = opts.ugl;
        if (opts.year) {
            const y = Number(opts.year);
            match.tglPinjam = { $gte: new Date(Date.UTC(y, 0, 1)), $lt: new Date(Date.UTC(y + 1, 0, 1)) };
        }

        const pipeline: PipelineStage[] = [
            { $match: match },
            {
                $lookup: {
                    from: 'data_anggota',
                    localField: 'noAgt',
                    foreignField: 'noAgt',
                    as: 'anggota',
                },
            },
            { $unwind: { path: '$anggota', preserveNullAndEmptyArrays: true } },
            ...(opts.tp?.length ? [{ $match: { 'anggota.tp': { $in: opts.tp } } } as PipelineStage] : []),

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
                    _status: { $ifNull: [{ $toUpper: { $trim: { input: '$statusKredit' } } }, 'KOSONG'] },
                },
            },
            { $match: { _tp: { $in: TP_ORDER } } },

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

            {
                $project: {
                    _id: 0,
                    usia: '$_bucket',
                    tp: '$_tp',
                    status: '$_status',
                },
            },
        ];

        type RowIn = { usia: string; tp: string; status: string };
        const docs = (await (this.model as any).aggregate(pipeline).exec()) as RowIn[];

        // Process in-memory
        const byAge = new Map<string, any>();

        for (const d of docs) {
            const usia = d.usia;
            const tp = d.tp;
            const status = d.status;

            if (!byAge.has(usia)) {
                byAge.set(usia, {
                    usia,
                    total: 0,
                    perTP: {} as Record<TpKey, number>,
                    perTPStatus: {} as Record<TpKey, Record<string, number>>,
                });
            }

            const row = byAge.get(usia)!;
            row.total += 1;
            row.perTP[tp] = (row.perTP[tp] || 0) + 1;

            if (!row.perTPStatus[tp]) {
                row.perTPStatus[tp] = { LANCAR: 0, 'KURANG LANCAR': 0, DIRAGUKAN: 0, MACET: 0, KOSONG: 0 };
            }
            row.perTPStatus[tp][status] = (row.perTPStatus[tp][status] || 0) + 1;
        }

        const BUCKET_ORDER: AgeBucketKey[] = ['<24 th', '24-35 th', '36-45 th', '46-60 th', '>60 th', 'Tidak Valid'];
        const rows: any[] = [];
        let grandTotal = 0;
        const totalsPerTP: Record<TpKey, number> = { PBL: 0, KRK: 0, JBR: 0, BWI: 0, MJK: 0, MGL: 0, PML: 0 };
        const totalsPerStatus = { LANCAR: 0, 'KURANG LANCAR': 0, DIRAGUKAN: 0, MACET: 0, KOSONG: 0 };

        for (const b of BUCKET_ORDER) {
            const found = byAge.get(b);
            if (found) {
                grandTotal += found.total;
                for (const tp of TP_ORDER) {
                    totalsPerTP[tp] += found.perTP[tp] || 0;
                    const s = found.perTPStatus[tp];
                    if (s) {
                        totalsPerStatus.LANCAR += s.LANCAR || 0;
                        totalsPerStatus['KURANG LANCAR'] += s['KURANG LANCAR'] || 0;
                        totalsPerStatus.DIRAGUKAN += s.DIRAGUKAN || 0;
                        totalsPerStatus.MACET += s.MACET || 0;
                        totalsPerStatus.KOSONG += s.KOSONG || 0;
                    }
                }
                rows.push(found);
            }
        }

        rows.forEach((r) => {
            r.persen = grandTotal ? Math.round(((r.total / grandTotal) * 100) * 100) / 100 : 0;
        });

        return { totalAll: grandTotal, rows, totalsPerTP, totalsPerStatus };
    }

    /**
     * Get Usia × Profesi × Tujuan (kategori pinjaman) analytics for kredit
     * Uses normPurpose to classify kategori & keterangan into PRODUKTIF/KONSUMTIF/etc
     */
    async getUsiaProfesiTujuan(opts: { year?: number; tp?: string[]; kategori?: string; ugl?: string }): Promise<UPPResponse> {
        const match: any = {};
        if (opts.year) {
            match.tglPinjam = { $gte: new Date(opts.year, 0, 1), $lt: new Date(opts.year + 1, 0, 1) };
        }
        if (opts.ugl) match.ugl = opts.ugl;

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
            ...(opts.tp?.length ? [{ $match: { 'agt.tp': { $in: opts.tp } } } as PipelineStage] : []),

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

            // project untuk processing di JS
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

        // Reduce in-memory using normPurpose
        const byAge = new Map<string, Map<string, UPPRow>>();

        for (const d of docs) {
            const usia = d.usia?.replace(/\s*-\s*/g, '-') || 'Tidak Valid';
            const profesi = d.profesi?.trim() || 'Kosong';
            const purpose = normPurpose(d.kategori, d.keterangan);

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
            row.perPurpose[purpose] += 1;
        }

        const AGE_ORDER = ['<24 th', '24-35 th', '36-45 th', '46-60 th', '>60 th', 'Tidak Valid'];
        const ages = [...byAge.keys()].sort((a, b) => AGE_ORDER.indexOf(a) - AGE_ORDER.indexOf(b));

        const buckets: UPPBucket[] = [];
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
     * Get Profesi per TP analytics for kredit
     */
    async getProfesiPerTP(opts: { year?: number; tp?: string[]; ugl?: string }) {
        const match: any = {};
        if (opts.year) {
            match.tglPinjam = { $gte: new Date(opts.year, 0, 1), $lt: new Date(opts.year + 1, 0, 1) };
        }
        if (opts.ugl) match.ugl = opts.ugl;

        const pipe: PipelineStage[] = [
            { $match: match },
            { $lookup: { from: 'data_anggota', localField: 'noAgt', foreignField: 'noAgt', as: 'agt' } },
            { $unwind: { path: '$agt', preserveNullAndEmptyArrays: true } },
            ...(opts.tp?.length ? [{ $match: { 'agt.tp': { $in: opts.tp } } } as PipelineStage] : []),

            {
                $project: {
                    profesi: { $ifNull: [{ $trim: { input: '$agt.profesi' } }, 'Kosong'] },
                    tp: { $ifNull: ['$agt.tp', '-'] },
                },
            },

            {
                $facet: {
                    rows: [
                        { $group: { _id: { profesi: '$profesi', tp: '$tp' }, c: { $sum: 1 } } },
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
                                perTP: { $arrayToObject: '$items' },
                                total: 1,
                            },
                        },
                        { $sort: { total: -1, profesi: 1 } },
                    ],

                    totalsPerTP: [
                        { $group: { _id: '$tp', total: { $sum: 1 } } },
                        { $project: { _id: 0, k: { $ifNull: ['$_id', '-'] }, v: '$total' } },
                    ],

                    grandTotal: [{ $count: 'n' }],
                },
            },
        ];

        const [res] = await (this.model as any).aggregate(pipe).exec();
        const totalsPerTP = Object.fromEntries((res?.totalsPerTP ?? []).map((x: any) => [x.k, x.v]));
        const grandTotal = res?.grandTotal?.[0]?.n ?? 0;

        const tps = Object.keys(totalsPerTP).sort((a, b) => TP_ORDER.indexOf(a as TpKey) - TP_ORDER.indexOf(b as TpKey));

        return {
            tps,
            grandTotal,
            totalsPerTP,
            rows: res?.rows ?? [],
        };
    }

    /**
     * Get Profesi per TP with status kredit breakdown
     */
    async getProfesiPerTPWithStatus(opts: { year?: number; tp?: string[]; ugl?: string }) {
        const match: any = {};
        if (opts.year) {
            match.tglPinjam = { $gte: new Date(opts.year, 0, 1), $lt: new Date(opts.year + 1, 0, 1) };
        }
        if (opts.ugl) match.ugl = opts.ugl;

        const pipe: PipelineStage[] = [
            { $match: match },
            { $lookup: { from: 'data_anggota', localField: 'noAgt', foreignField: 'noAgt', as: 'agt' } },
            { $unwind: { path: '$agt', preserveNullAndEmptyArrays: true } },
            ...(opts.tp?.length ? [{ $match: { 'agt.tp': { $in: opts.tp } } } as PipelineStage] : []),

            {
                $project: {
                    profesi: { $ifNull: [{ $trim: { input: '$agt.profesi' } }, 'Kosong'] },
                    tp: { $ifNull: ['$agt.tp', '-'] },
                    status: { $ifNull: [{ $toUpper: { $trim: { input: '$statusKredit' } } }, 'KOSONG'] },
                },
            },
        ];

        type RowIn = { profesi: string; tp: string; status: string };
        const docs = (await (this.model as any).aggregate(pipe).exec()) as RowIn[];

        // Process in-memory
        const byProfesi = new Map<string, any>();

        for (const d of docs) {
            const profesi = d.profesi;
            const tp = d.tp;
            const status = d.status;

            if (!byProfesi.has(profesi)) {
                byProfesi.set(profesi, {
                    profesi,
                    total: 0,
                    perTP: {} as Record<string, number>,
                    perTPStatus: {} as Record<string, Record<string, number>>,
                });
            }

            const row = byProfesi.get(profesi)!;
            row.total += 1;
            row.perTP[tp] = (row.perTP[tp] || 0) + 1;

            if (!row.perTPStatus[tp]) {
                row.perTPStatus[tp] = { LANCAR: 0, 'KURANG LANCAR': 0, DIRAGUKAN: 0, MACET: 0, KOSONG: 0 };
            }
            row.perTPStatus[tp][status] = (row.perTPStatus[tp][status] || 0) + 1;
        }

        const rows = [...byProfesi.values()].sort((a, b) => b.total - a.total);
        let grandTotal = 0;
        const totalsPerTP: Record<string, number> = {};

        for (const row of rows) {
            grandTotal += row.total;
            for (const tp of Object.keys(row.perTP)) {
                totalsPerTP[tp] = (totalsPerTP[tp] || 0) + row.perTP[tp];
            }
        }

        const tps = Object.keys(totalsPerTP).sort((a, b) => TP_ORDER.indexOf(a as TpKey) - TP_ORDER.indexOf(b as TpKey));

        return {
            tps,
            grandTotal,
            totalsPerTP,
            rows,
        };
    }
}
