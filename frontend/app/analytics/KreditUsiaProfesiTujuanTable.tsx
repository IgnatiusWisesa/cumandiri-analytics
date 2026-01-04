'use client';

import React, { useState, useEffect, useMemo } from 'react';

type PurposeKey = 'KESEHATAN' | 'KESEJAHTERAAN' | 'KONSUMTIF' | 'PENDIDIKAN' | 'PRODUKTIF' | 'KOSONG';

type UPKRow = {
    profesi: string;
    total: number;
    perPurpose: Record<PurposeKey, number>;
};

type UPKBucket = {
    usia: string;
    rows: UPKRow[];
    subtotal: number;
    subtotalPerPurpose: Record<PurposeKey, number>;
};

type UPKResponse = {
    purposes: PurposeKey[];
    buckets: UPKBucket[];
    grandTotal: number;
};

const int = (n: number) => (n ?? 0).toLocaleString('id-ID');

const PURPOSE_ORDER: PurposeKey[] = ['KESEHATAN', 'KESEJAHTERAAN', 'KONSUMTIF', 'PENDIDIKAN', 'PRODUKTIF', 'KOSONG'];

interface Props {
    year?: number;
    tp?: string[];
}

export default function KreditUsiaProfesiTujuanTable({ year, tp }: Props) {
    const [data, setData] = useState<UPKResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setErr(null);

        const url = new URL('/api/kredit/analytics/usia-profesi-tujuan', window.location.origin);
        if (year) url.searchParams.set('year', String(year));
        if (tp?.length) tp.forEach((t) => url.searchParams.append('tp', t));

        fetch(url.toString(), { credentials: 'include', cache: 'no-store' })
            .then(async (r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json() as Promise<UPKResponse>;
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

    // Calculate max per purpose for highlighting
    const maxPerPurpose = useMemo(() => {
        if (!data) return {} as Record<PurposeKey, number>;
        const out: Record<PurposeKey, number> = {
            KESEHATAN: 0,
            KESEJAHTERAAN: 0,
            KONSUMTIF: 0,
            PENDIDIKAN: 0,
            PRODUKTIF: 0,
            KOSONG: 0,
        };
        for (const bucket of data.buckets) {
            for (const row of bucket.rows) {
                for (const p of PURPOSE_ORDER) {
                    const v = row.perPurpose[p] ?? 0;
                    if (v > out[p]) out[p] = v;
                }
            }
        }
        return out;
    }, [data]);

    if (loading) return <div className="p-4 text-sm text-neutral-500">Memuat data kredit…</div>;
    if (err) return <div className="p-4 text-sm text-red-600">Error: {err}</div>;
    if (!data || data.grandTotal === 0) return <div className="p-4 text-sm text-neutral-500">Tidak ada data kredit</div>;

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                    <tr>
                        <th className="bg-amber-200 border px-3 py-2 text-left">Usia</th>
                        <th className="bg-amber-200 border px-3 py-2 text-left">Profesi</th>
                        {PURPOSE_ORDER.map((p) => (
                            <th key={p} className="bg-amber-200 border px-3 py-2 text-center">
                                {p === 'KOSONG' ? 'Kosong' : p.charAt(0) + p.slice(1).toLowerCase()}
                            </th>
                        ))}
                        <th className="bg-amber-200 border px-3 py-2 text-right">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {data.buckets.map((bucket) => (
                        <React.Fragment key={bucket.usia}>
                            {/* Header usia */}
                            <tr className="bg-neutral-100 font-medium">
                                <td className="border px-3 py-2">{bucket.usia}</td>
                                <td className="border px-3 py-2">—</td>
                                {PURPOSE_ORDER.map((p) => (
                                    <td key={p} className="border px-3 py-2 text-center">
                                        {int(bucket.subtotalPerPurpose[p] ?? 0)}
                                    </td>
                                ))}
                                <td className="border px-3 py-2 text-right">{int(bucket.subtotal)}</td>
                            </tr>

                            {/* Rows profesi */}
                            {bucket.rows.map((r) => {
                                const maxInRow = Math.max(0, ...PURPOSE_ORDER.map((p) => r.perPurpose[p] ?? 0));
                                return (
                                    <tr key={`${bucket.usia}__${r.profesi}`}>
                                        <td className="border px-3 py-2 text-neutral-500"></td>
                                        <td className="border px-3 py-2">{r.profesi || 'Kosong'}</td>
                                        {PURPOSE_ORDER.map((p) => {
                                            const v = r.perPurpose[p] ?? 0;
                                            // Highlight: max per purpose globally OR max in this row
                                            const isMaxGlobal = v > 0 && v === maxPerPurpose[p];
                                            const isMaxRow = v > 0 && v === maxInRow;
                                            const bgClass = isMaxGlobal
                                                ? 'bg-yellow-200 font-medium'
                                                : isMaxRow
                                                    ? 'bg-green-100'
                                                    : '';
                                            return (
                                                <td key={p} className={`border px-3 py-2 text-center ${bgClass}`}>
                                                    {v === 0 ? '-' : int(v)}
                                                </td>
                                            );
                                        })}
                                        <td className="border px-3 py-2 text-right">{int(r.total)}</td>
                                    </tr>
                                );
                            })}
                        </React.Fragment>
                    ))}

                    {/* Grand total */}
                    <tr className="bg-amber-100 font-semibold">
                        <td className="border px-3 py-2">JUMLAH</td>
                        <td className="border px-3 py-2">—</td>
                        {PURPOSE_ORDER.map((p) => {
                            const tot = data.buckets.reduce((s, b) => s + (b.subtotalPerPurpose[p] ?? 0), 0);
                            return (
                                <td key={p} className="border px-3 py-2 text-center">
                                    {int(tot)}
                                </td>
                            );
                        })}
                        <td className="border px-3 py-2 text-right">{int(data.grandTotal)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
