import type { GroupPU, PinjAgeResp, ProfesiUsiaPayload, RowPU, UsiaPayload } from '../types';
import { TP_ORDER } from '../types/constants';

/**
 * Normalize Profesi × Usia data from API response
 */
export function normalizePU(raw: any): ProfesiUsiaPayload {
    const p = raw?.data ?? raw ?? {};
    const buckets: any[] = Array.isArray(p.buckets) ? p.buckets : [];
    const groups: GroupPU[] = buckets.map((b) => {
        const rows = (b.rows ?? []).map((r: any) => ({
            profesi: (r.profesi && String(r.profesi).trim()) || 'Kosong',
            jumlah: Number(r.jumlah ?? 0),
            persen: Number(r.persen ?? 0),
            perTP: { ...(r.perTP ?? {}) } as Record<string, number>,
        })) as RowPU[];

        const subtotalPerTP: Record<string, number> = {};
        for (const r of rows)
            for (const [tp, v] of Object.entries(r.perTP ?? {}))
                subtotalPerTP[tp] = (subtotalPerTP[tp] ?? 0) + Number(v ?? 0);

        return { usia: String(b.usia ?? ''), rows, subtotal: Number(b.total ?? 0), subtotalPerTP };
    });

    const tps = Array.isArray(p.tps)
        ? p.tps
        : Object.keys(
            groups.reduce((acc, g) => Object.assign(acc, g.subtotalPerTP), {} as Record<string, number>),
        );

    return { tps, groups, grandTotal: Number(p.grandTotal ?? 0) };
}

/**
 * Normalize Pinjaman Usia data from API response
 */
export function normalizePinjamanUsia(resp: PinjAgeResp): UsiaPayload {
    const rows = resp.rows.map((r) => ({
        usiaBucket: r.usia,
        jumlah: r.total,
        persen: r.persen,
        perTP: TP_ORDER.reduce((acc, tp) => {
            acc[tp] = Number(r.perTP?.[tp] ?? 0);
            return acc;
        }, {} as Record<string, number>),
    }));

    return {
        rows: [
            ...rows,
            {
                usiaBucket: 'TOTAL',
                jumlah: resp.totalAll,
                persen: 100,
                perTP: TP_ORDER.reduce((acc, tp) => {
                    acc[tp] = Number(resp.totalsPerTP?.[tp] ?? 0);
                    return acc;
                }, {} as Record<string, number>),
            },
        ],
        total: resp.totalAll,
        tps: [...TP_ORDER],
    };
}

/**
 * Normalize usia key format (e.g., "24 - 35 th" → "24-35 th")
 */
export function normUsiaKey(s: string) {
    return s.replace(/\s*-\s*/g, '-').trim();
}
