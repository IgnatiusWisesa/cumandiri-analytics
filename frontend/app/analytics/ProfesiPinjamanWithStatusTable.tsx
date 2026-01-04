'use client';

import React, { useState, useEffect } from 'react';

const TP_ORDER = ['PBL', 'KRK', 'JBR', 'BWI', 'MJK', 'MGL', 'PML'] as const;
const STATUS_ORDER = ['LANCAR', 'KURANG LANCAR', 'DIRAGUKAN', 'MACET'] as const;

type TpKey = typeof TP_ORDER[number];
type StatusKey = typeof STATUS_ORDER[number];

type StatusBreakdown = Record<StatusKey, number>;

type ProfesiRowWithStatus = {
    profesi: string;
    perTP: Record<string, number>;
    perTPStatus: Record<string, StatusBreakdown>;
    total: number;
};

type ProfesiPerTPWithStatusResp = {
    tps: string[];
    grandTotal: number;
    totalsPerTP: Record<string, number>;
    rows: ProfesiRowWithStatus[];
};

const int = (n: number) => (n ?? 0).toLocaleString('id-ID');

interface Props {
    year?: number;
    tp?: string[];
}

export default function ProfesiPinjamanWithStatusTable({ year, tp }: Props) {
    const [data, setData] = useState<ProfesiPerTPWithStatusResp | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setErr(null);

        const url = new URL('/api/pinjaman/analytics/profesi-tp-status', window.location.origin);
        if (year) url.searchParams.set('year', String(year));
        if (tp?.length) tp.forEach((t) => url.searchParams.append('tp', t));

        fetch(url.toString(), { credentials: 'include', cache: 'no-store' })
            .then(async (r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json() as Promise<ProfesiPerTPWithStatusResp>;
            })
            .then((d) => {
                if (alive) setData(d);
            })
            .catch((e) => {
                if (alive) setErr(e.message || 'Gagal memuat');
            })
            .finally(() => {
                if (alive) setLoading(false);
            });

        return () => {
            alive = false;
        };
    }, [year, tp]);

    if (loading) return <div className="p-4 text-sm text-neutral-500">Memuat…</div>;
    if (err) return <div className="p-4 text-sm text-red-600">Error: {err}</div>;
    if (!data || data.grandTotal === 0) return <div className="p-4 text-sm text-neutral-500">Tidak ada data</div>;

    return (
        <div className="space-y-2">
            <h3 className="font-semibold text-lg">Klasifikasi Profesi Pinjaman per TP dengan Status</h3>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                    <thead>
                        <tr>
                            <th rowSpan={2} className="bg-amber-200 border px-2 py-2 text-left">Profesi</th>
                            {TP_ORDER.map((tp) => (
                                <th key={tp} colSpan={5} className="bg-amber-200 border px-2 py-1 text-center">
                                    {tp}
                                </th>
                            ))}
                            <th rowSpan={2} className="bg-amber-200 border px-2 py-2 text-right">Jumlah</th>
                        </tr>
                        <tr>
                            {TP_ORDER.map((tp) => (
                                <React.Fragment key={`${tp}-sub`}>
                                    <th className="bg-amber-100 border px-1 py-1 text-center text-[10px]">JP</th>
                                    <th className="bg-amber-100 border px-1 py-1 text-center text-[10px]">L</th>
                                    <th className="bg-amber-100 border px-1 py-1 text-center text-[10px]">KL</th>
                                    <th className="bg-amber-100 border px-1 py-1 text-center text-[10px]">D</th>
                                    <th className="bg-amber-100 border px-1 py-1 text-center text-[10px]">M</th>
                                </React.Fragment>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((row) => (
                            <tr key={row.profesi}>
                                <td className="border px-2 py-1">{row.profesi || 'Kosong'}</td>
                                {TP_ORDER.map((tpKey) => {
                                    const total = row.perTP[tpKey] || 0;
                                    const status = row.perTPStatus[tpKey] || { LANCAR: 0, 'KURANG LANCAR': 0, DIRAGUKAN: 0, MACET: 0 };
                                    return (
                                        <React.Fragment key={`${row.profesi}-${tpKey}`}>
                                            <td className="border px-1 py-1 text-center text-[10px]">{total || '-'}</td>
                                            <td className="border px-1 py-1 text-center text-[10px]">{status.LANCAR || '-'}</td>
                                            <td className="border px-1 py-1 text-center text-[10px]">{status['KURANG LANCAR'] || '-'}</td>
                                            <td className="border px-1 py-1 text-center text-[10px]">{status.DIRAGUKAN || '-'}</td>
                                            <td className="border px-1 py-1 text-center text-[10px]">{status.MACET || '-'}</td>
                                        </React.Fragment>
                                    );
                                })}
                                <td className="border px-2 py-1 text-right font-medium">{int(row.total)}</td>
                            </tr>
                        ))}

                        {/* Total row */}
                        <tr className="bg-amber-100 font-semibold">
                            <td className="border px-2 py-1">JUMLAH</td>
                            {TP_ORDER.map((tpKey) => {
                                const total = data.totalsPerTP[tpKey] || 0;
                                const statusTotals = data.rows.reduce((acc, row) => {
                                    const s = row.perTPStatus[tpKey];
                                    if (s) {
                                        acc.LANCAR += s.LANCAR || 0;
                                        acc['KURANG LANCAR'] += s['KURANG LANCAR'] || 0;
                                        acc.DIRAGUKAN += s.DIRAGUKAN || 0;
                                        acc.MACET += s.MACET || 0;
                                    }
                                    return acc;
                                }, { LANCAR: 0, 'KURANG LANCAR': 0, DIRAGUKAN: 0, MACET: 0 } as StatusBreakdown);

                                return (
                                    <React.Fragment key={`total-${tpKey}`}>
                                        <td className="border px-1 py-1 text-center text-[10px]">{int(total)}</td>
                                        <td className="border px-1 py-1 text-center text-[10px]">{int(statusTotals.LANCAR)}</td>
                                        <td className="border px-1 py-1 text-center text-[10px]">{int(statusTotals['KURANG LANCAR'])}</td>
                                        <td className="border px-1 py-1 text-center text-[10px]">{int(statusTotals.DIRAGUKAN)}</td>
                                        <td className="border px-1 py-1 text-center text-[10px]">{int(statusTotals.MACET)}</td>
                                    </React.Fragment>
                                );
                            })}
                            <td className="border px-2 py-1 text-right">{int(data.grandTotal)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
