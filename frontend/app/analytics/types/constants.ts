import type { JenisKey, PurposeKey } from './index';

// TP (Tempat Pelayanan) Colors & Order
export const TP_COLORS: Record<string, string> = {
    PBL: '#1f77b4',
    KRK: '#ff7f0e',
    JBR: '#7f7f7f',
    BWI: '#f2c94c',
    MJK: '#2ca02c',
    MGL: '#27ae60',
    PML: '#2c3e50',
};

export const TP_ORDER = ['PBL', 'KRK', 'JBR', 'BWI', 'MJK', 'MGL', 'PML'] as const;

// Age Colors & Order
export const AGE_ORDER = ['<24 th', '24-35 th', '36-45 th', '46-60 th', '>60 th'] as const;

export const AGE_COLORS: Record<(typeof AGE_ORDER)[number], string> = {
    '<24 th': '#4e79a7',
    '24-35 th': '#f28e2c',
    '36-45 th': '#7f7f7f',
    '46-60 th': '#f1c232',
    '>60 th': '#5DA5DA',
};

// Pie Chart Colors
export const PIE_COLORS = ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949'];

// Simpanan Berjangka
export const JENIS_LIST: readonly JenisKey[] = ['SJTA', 'SSKA', 'SMP', 'SPJ'];

export const JENIS_COLORS: Record<JenisKey, string> = {
    SJTA: '#4e79a7',
    SSKA: '#f28e2c',
    SMP: '#59a14f',
    SPJ: '#e15759',
};

// Pinjaman Purpose
export const PURPOSE_ORDER: PurposeKey[] = [
    'KESEHATAN',
    'KESEJAHTERAAN',
    'KONSUMTIF',
    'PENDIDIKAN',
    'PRODUKTIF',
    'KOSONG',
];
