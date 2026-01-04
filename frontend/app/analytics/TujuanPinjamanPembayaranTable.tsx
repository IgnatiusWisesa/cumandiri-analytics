'use client';

import React, { useState, useEffect } from 'react';

const PURPOSE_ORDER = ['KONSUMTIF', 'KESEJAHTERAAN', 'PENDIDIKAN', 'PRODUKTIF', 'KESEHATAN', 'KOSONG'] as const;
type PurposeKey = typeof PURPOSE_ORDER[number];

type PaymentCategoryBreakdown = {
    'LANCAR_0_3': number;
    'LANCAR_4_6': number;
    'KURANG_LANCAR': number;
    'DIRAGUKAN_7_12': number;
    'MACET_12_PLUS': number;
};

type TujuanRow = {
    tujuan: PurposeKey;
    total: number;
    breakdown: PaymentCategoryBreakdown;
};

type TujuanPembayaranResponse = {
    rows: TujuanRow[];
    grandTotal: number;
    totals: PaymentCategoryBreakdown;
};

const int = (n: number) => (n ?? 0).toLocaleString('id-ID');

interface Props {
    year?: number;
    tp?: string[];
}

export default function TujuanPinjamanPembayaranTable({ year, tp }: Props) {
    const [data, setData] = useState<TujuanPembayaranResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setErr(null);

        const url = new URL('/api/pinjaman/analytics/tujuan-pembayaran', window.location.origin);
        if (year) url.searchParams.set('year', String(year));
        if (tp?.length) tp.forEach((t) => url.searchParams.append('tp', t));

        fetch(url.toString(), { credentials: 'include', cache: 'no-store' })
            .then(async (r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json() as Promise<TujuanPembayaranResponse>;
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
            <h3 className="font-semibold text-lg">13. Klasifikasi Tujuan Pinjaman dibanding Kategori Pembayaran Angsuran</h3>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr>
                            <th rowSpan={2} className="bg-amber-200 border px-3 py-2 text-left">Tujuan Pinjaman</th>
                            <th rowSpan={2} className="bg-amber-200 border px-3 py-2 text-right">Jumlah Pinjaman</th>
                            <th colSpan={2} className="bg-amber-200 border px-3 py-2 text-center">LANCAR</th>
                            <th rowSpan={2} className="bg-amber-200 border px-3 py-2 text-center">KURANG LANCAR</th>
                            <th rowSpan={2} className="bg-amber-200 border px-3 py-2 text-center">DIRAGUKAN<br />7-12 BLN</th>
                            <th rowSpan={2} className="bg-amber-200 border px-3 py-2 text-center">MACET<br />&gt;12 BLN</th>
                        </tr>
                        <tr>
                            <th className="bg-amber-100 border px-3 py-2 text-center">0-3 BLN</th>
                            <th className="bg-amber-100 border px-3 py-2 text-center">4-6 BLN</th>
                        </tr>
                    </thead>
                    <tbody>
                        {PURPOSE_ORDER.map((purpose) => {
                            const row = data.rows.find((r) => r.tujuan === purpose);
                            if (!row || row.total === 0) return null;

                            return (
                                <tr key={purpose}>
                                    <td className="border px-3 py-2">{purpose}</td>
                                    <td className="border px-3 py-2 text-right font-medium">{int(row.total)}</td>
                                    <td className="border px-3 py-2 text-center">{row.breakdown.LANCAR_0_3 || '-'}</td>
                                    <td className="border px-3 py-2 text-center">{row.breakdown.LANCAR_4_6 || '-'}</td>
                                    <td className="border px-3 py-2 text-center">{row.breakdown.KURANG_LANCAR || '-'}</td>
                                    <td className="border px-3 py-2 text-center">{row.breakdown.DIRAGUKAN_7_12 || '-'}</td>
                                    <td className="border px-3 py-2 text-center">{row.breakdown.MACET_12_PLUS || '-'}</td>
                                </tr>
                            );
                        })}

                        {/* Total row */}
                        <tr className="bg-amber-100 font-semibold">
                            <td className="border px-3 py-2">JUMLAH</td>
                            <td className="border px-3 py-2 text-right">{int(data.grandTotal)}</td>
                            <td className="border px-3 py-2 text-center">{int(data.totals.LANCAR_0_3)}</td>
                            <td className="border px-3 py-2 text-center">{int(data.totals.LANCAR_4_6)}</td>
                            <td className="border px-3 py-2 text-center">{int(data.totals.KURANG_LANCAR)}</td>
                            <td className="border px-3 py-2 text-center">{int(data.totals.DIRAGUKAN_7_12)}</td>
                            <td className="border px-3 py-2 text-center">{int(data.totals.MACET_12_PLUS)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
