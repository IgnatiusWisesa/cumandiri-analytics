// Data Anggota Types
export type RowUsia = {
    usiaBucket: string;
    jumlah: number;
    persen: number;
    perTP: Record<string, number>
};

export type RowProfesi = {
    profesi: string;
    jumlah: number;
    persen: number;
    perTP: Record<string, number>
};

export type UsiaPayload = {
    rows: RowUsia[];
    total: number;
    tps: string[]
};

export type ProfesiPayload = {
    rows: RowProfesi[];
    total: number;
    tps: string[]
};

export type RowPU = {
    profesi: string;
    jumlah: number;
    persen: number;
    perTP: Record<string, number>
};

export type GroupPU = {
    usia: string;
    rows: RowPU[];
    subtotal: number;
    subtotalPerTP: Record<string, number>
};

export type ProfesiUsiaPayload = {
    tps: string[];
    groups: GroupPU[];
    grandTotal: number
};

// Pinjaman Types
export type PinjAgeResp = {
    totalAll: number;
    rows: { usia: string; total: number; persen: number; perTP: Record<string, number> }[];
    totalsPerTP: Record<string, number>;
};

export type PurposeKey = 'KESEHATAN' | 'KESEJAHTERAAN' | 'KONSUMTIF' | 'PENDIDIKAN' | 'PRODUKTIF' | 'KOSONG';

export type ApiRow = {
    usia: string;
    total: number;
    perPurpose: Record<PurposeKey, number>
};

export type ApiResp = {
    totalAll: number;
    totalsPerPurpose: Record<PurposeKey, number>;
    rows: ApiRow[]
};

export type ProfesiVsTujuanRow = {
    profesi: string;
    perPurpose: Record<PurposeKey, number>;
    total: number;
};

export type ProfesiVsTujuanResp = {
    totalAll: number;
    totalsPerPurpose: Record<PurposeKey, number>;
    rows: ProfesiVsTujuanRow[];
};

export type ProfesiPerTPRow = {
    profesi: string;
    perTP: Record<string, number>;
    total: number;
};

export type ProfesiPerTPResp = {
    tps: string[];
    grandTotal: number;
    totalsPerTP: Record<string, number>;
    rows: ProfesiPerTPRow[];
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

// Simpanan Berjangka Types
export type JenisKey = 'SJTA' | 'SSKA' | 'SMP' | 'SPJ';

export type UsiaJenisRow = {
    usia: string;
    perJenis: Record<JenisKey, number>;
    total: number;
    percent: number;
};

export type UsiaJenisResp = {
    jenisList: JenisKey[];
    totalAll: number;
    totalsPerJenis: Record<JenisKey, number>;
    rows: UsiaJenisRow[];
};

export type SimpananProfesiRow = {
    profesi: string;
    perJenis: Record<JenisKey, number>;
    total: number;
    persen: number;
};

export type SimpananProfesiAnalyticsResp = {
    jenisList: JenisKey[];
    totalAll: number;
    totalsPerJenis: Record<JenisKey, number>;
    rows: SimpananProfesiRow[];
};

export type UsiaPerTPRowSB = {
    usia: string;
    perTP: Record<string, number>;
    total: number;
    persen: number;
};

export type UsiaPerTPRespSB = {
    tps: string[];
    totalAll: number;
    totalsPerTP: Record<string, number>;
    rows: UsiaPerTPRowSB[];
};

export type ProfesiPerTPRowSB = {
    profesi: string;
    perTP: Record<string, number>;
    total: number;
    persen: number;
};

export type ProfesiPerTPRespSB = {
    tps: string[];
    totalAll: number;
    totalsPerTP: Record<string, number>;
    rows: ProfesiPerTPRowSB[];
};
