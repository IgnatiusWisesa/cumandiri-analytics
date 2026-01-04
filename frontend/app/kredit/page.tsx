'use client';

import React, { useState, useEffect, useMemo } from 'react';

type KategoriKey = 'LANCAR' | 'MACET' | 'KOSONG';

type UPKRow = {
    profesi: string;
    total: number;
    perKategori: Record<KategoriKey, number>;
};

type UPKBucket = {
    usia: string;
    rows: UPKRow[];
    subtotal: number;
    subtotalPerKategori: Record<KategoriKey, number>;
};

type UPKResponse = {
    kategoris: KategoriKey[];
    buckets: UPKBucket[];
    grandTotal: number;
};

const int = (n: number) => (n ?? 0).toLocaleString('id-ID');

export default function KreditPage() {
    const [data, setData] = useState<UPKResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    // Filters
    const [year, setYear] = useState<string>('');
    const [tp, setTp] = useState<string>('');
    const [kategori, setKategori] = useState<string>('');

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setErr(null);

        const url = new URL('/api/kredit/analytics/usia-profesi-kategori', window.location.origin);
        if (year) url.searchParams.set('year', year);
        if (tp) url.searchParams.append('tp', tp);
        if (kategori) url.searchParams.set('kategori', kategori);

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
    }, [year, tp, kategori]);

    // Calculate max per kategori for highlighting
    const maxPerKategori = useMemo(() => {
        if (!data) return {} as Record<KategoriKey, number>;
        const out: Record<KategoriKey, number> = { LANCAR: 0, MACET: 0, KOSONG: 0 };
        for (const bucket of data.buckets) {
            for (const row of bucket.rows) {
                for (const k of data.kategoris) {
                    const v = row.perKategori[k] ?? 0;
                    if (v > out[k]) out[k] = v;
                }
            }
        }
        return out;
    }, [data]);

    if (loading) return <div className="p-6">Memuat…</div>;
    if (err) return <div className="p-6 text-red-600">Error: {err}</div>;
    if (!data) return null;

    return (
        <div className="min-h-screen bg-neutral-50 p-6">
            <div className="mx-auto max-w-7xl space-y-6">
                <h1 className="text-3xl font-bold">Klasifikasi Usia, Profesi, dan Kategori Kredit</h1>

                {/* Filters */}
                <div className="flex flex-wrap gap-3 items-end rounded-xl border bg-white p-4 shadow-sm">
                    <div>
                        <label className="block text-sm mb-1 text-neutral-600">Tahun (opsional)</label>
                        <input
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            placeholder="2025"
                            className="border rounded px-3 py-2 w-28"
                        />
                    </div>
                    <div>
                        <label className="block text-sm mb-1 text-neutral-600">TP (opsional)</label>
                        <input
                            value={tp}
                            onChange={(e) => setTp(e.target.value)}
                            placeholder="PBL"
                            className="border rounded px-3 py-2 w-28"
                        />
                    </div>
                    <div>
                        <label className="block text-sm mb-1 text-neutral-600">Kategori (opsional)</label>
                        <select
                            value={kategori}
                            onChange={(e) => setKategori(e.target.value)}
                            className="border rounded px-3 py-2"
                        >
                            <option value="">Semua</option>
                            <option value="LANCAR">Lancar</option>
                            <option value="MACET">Macet</option>
                        </select>
                    </div>
                    <button
                        onClick={() => {
                            setYear('');
                            setTp('');
                            setKategori('');
                        }}
                        className="border rounded px-3 py-2 text-sm"
                    >
                        Reset
                    </button>
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
                    <table className="w-full min-w-[900px] border-collapse text-sm">
                        <thead>
                            <tr>
                                <th className="bg-amber-200 border px-3 py-2 text-left">Usia</th>
                                <th className="bg-amber-200 border px-3 py-2 text-left">Profesi</th>
                                {data.kategoris.map((k) => (
                                    <th key={k} className="bg-amber-200 border px-3 py-2 text-center">
                                        {k === 'KOSONG' ? 'Kosong' : k.charAt(0) + k.slice(1).toLowerCase()}
                                    </th>
                                ))}
                                <th className="bg-amber-200 border px-3 py-2 text-right">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.buckets.map((bucket) => (
                                <React.Fragment key={bucket.usia}>
                                    {/* Header usia */}
                                    <tr className="bg-neutral-100 font-medium">
                                        <td className="border px-3 py-2">{bucket.usia}</td>
                                        <td className="border px-3 py-2">—</td>
                                        {data.kategoris.map((k) => (
                                            <td key={k} className="border px-3 py-2 text-center">
                                                {int(bucket.subtotalPerKategori[k] ?? 0)}
                                            </td>
                                        ))}
                                        <td className="border px-3 py-2 text-right">{int(bucket.subtotal)}</td>
                                    </tr>

                                    {/* Rows profesi */}
                                    {bucket.rows.map((r) => {
                                        const maxInRow = Math.max(0, ...data.kategoris.map((k) => r.perKategori[k] ?? 0));
                                        return (
                                            <tr key={`${bucket.usia}__${r.profesi}`}>
                                                <td className="border px-3 py-2 text-neutral-500"></td>
                                                <td className="border px-3 py-2">{r.profesi || 'Kosong'}</td>
                                                {data.kategoris.map((k) => {
                                                    const v = r.perKategori[k] ?? 0;
                                                    // Highlight: max per kategori globally OR max in this row
                                                    const isMaxGlobal = v > 0 && v === maxPerKategori[k];
                                                    const isMaxRow = v > 0 && v === maxInRow;
                                                    const bgClass = isMaxGlobal
                                                        ? 'bg-yellow-200 font-medium'
                                                        : isMaxRow
                                                            ? 'bg-green-100'
                                                            : '';
                                                    return (
                                                        <td key={k} className={`border px-3 py-2 text-center ${bgClass}`}>
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
                                <td className="border px-3 py-2">TOTAL</td>
                                <td className="border px-3 py-2">—</td>
                                {data.kategoris.map((k) => {
                                    const tot = data.buckets.reduce((s, b) => s + (b.subtotalPerKategori[k] ?? 0), 0);
                                    return (
                                        <td key={k} className="border px-3 py-2 text-center">
                                            {int(tot)}
                                        </td>
                                    );
                                })}
                                <td className="border px-3 py-2 text-right">{int(data.grandTotal)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
