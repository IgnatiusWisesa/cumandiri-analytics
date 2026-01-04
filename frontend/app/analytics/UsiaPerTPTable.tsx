'use client';

import React, { useState, useEffect } from 'react';

const TP_ORDER = ['PBL', 'KRK', 'JBR', 'BWI', 'MJK', 'MGL', 'PML'] as const;
const AGE_ORDER = ['<24 th', '24-35 th', '36-45 th', '46-60 th', '>60 th'] as const;

type TpKey = typeof TP_ORDER[number];
type AgeKey = typeof AGE_ORDER[number];

type AgeRow = {
    usia: AgeKey;
    total: number;
    persen: number;
    perTP: Record<TpKey, number>;
};

type AgeAnalyticsResponse = {
    totalAll: number;
    rows: AgeRow[];
    totalsPerTP: Record<TpKey, number>;
};

const int = (n: number) => (n ?? 0).toLocaleString('id-ID');
const pct = (n: number) => `${((n ?? 0) / 100).toFixed(2)}%`;

interface Props {
    year?: number;
    tp?: string[];
    title: string;
    endpoint: string; // '/api/kredit/analytics/usia' or '/api/pinjaman/analytics/usia'
}

export default function UsiaPerTPTable({ year, tp, title, endpoint }: Props) {
    const [data, setData] = useState<AgeAnalyticsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setErr(null);

        const url = new URL(endpoint, window.location.origin);
        if (year) url.searchParams.set('year', String(year));
        if (tp?.length) tp.forEach((t) => url.searchParams.append('tp', t));

        fetch(url.toString(), { credentials: 'include', cache: 'no-store' })
            .then(async (r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json() as Promise<AgeAnalyticsResponse>;
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
    }, [year, tp, endpoint]);

    if (loading) return <div className="p-4 text-sm text-neutral-500">Memuat…</div>;
    if (err) return <div className="p-4 text-sm text-red-600">Error: {err}</div>;
    if (!data || data.totalAll === 0) return <div className="p-4 text-sm text-neutral-500">Tidak ada data</div>;

    return (
        <div className="space-y-2">
            <h3 className="font-semibold text-lg">{title}</h3>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr>
                            <th className="bg-amber-200 border px-3 py-2 text-left">Usia</th>
                            {TP_ORDER.map((tp) => (
                                <th key={tp} className="bg-amber-200 border px-3 py-2 text-center">
                                    {tp}
                                </th>
                            ))}
                            <th className="bg-amber-200 border px-3 py-2 text-right">Jumlah</th>
                            <th className="bg-amber-200 border px-3 py-2 text-right">%</th>
                        </tr>
                    </thead>
                    <tbody>
                        {AGE_ORDER.map((ageKey) => {
                            const row = data.rows.find((r) => r.usia === ageKey);
                            if (!row || row.total === 0) return null;

                            return (
                                <tr key={ageKey}>
                                    <td className="border px-3 py-2">{ageKey}</td>
                                    {TP_ORDER.map((tp) => (
                                        <td key={tp} className="border px-3 py-2 text-center">
                                            {row.perTP[tp] || '-'}
                                        </td>
                                    ))}
                                    <td className="border px-3 py-2 text-right font-medium">{int(row.total)}</td>
                                    <td className="border px-3 py-2 text-right">{pct(row.persen)}</td>
                                </tr>
                            );
                        })}

                        {/* Total row */}
                        <tr className="bg-amber-100 font-semibold">
                            <td className="border px-3 py-2">JUMLAH</td>
                            {TP_ORDER.map((tp) => (
                                <td key={tp} className="border px-3 py-2 text-center">
                                    {int(data.totalsPerTP[tp] ?? 0)}
                                </td>
                            ))}
                            <td className="border px-3 py-2 text-right">{int(data.totalAll)}</td>
                            <td className="border px-3 py-2 text-right">100.00%</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
