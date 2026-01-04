'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
  LineChart,
  Line,
} from 'recharts';

/* ======= CONSTS ======= */
const TP_COLORS: Record<string, string> = {
  PBL: '#1f77b4', KRK: '#ff7f0e', JBR: '#7f7f7f', BWI: '#f2c94c',
  MJK: '#2ca02c', MGL: '#27ae60', PML: '#2c3e50',
};
const PIE_COLORS = ['#4e79a7','#f28e2c','#e15759','#76b7b2','#59a14f','#edc949'];
const TP_ORDER = ['PBL','KRK','JBR','BWI','MJK','MGL','PML'] as const;
const pct = (n:number)=> (n/100).toLocaleString('id-ID',{style:'percent',minimumFractionDigits:2});
const int = (n:number)=> (n ?? 0).toLocaleString('id-ID');
const sum = (xs:number[]) => xs.reduce((a,b)=>a+b,0);
const AGE_ORDER = ['<24 th','24-35 th','36-45 th','46-60 th','>60 th'] as const;
const AGE_COLORS: Record<(typeof AGE_ORDER)[number], string> = {
  '<24 th':   '#4e79a7',
  '24-35 th': '#f28e2c',
  '36-45 th': '#7f7f7f',
  '46-60 th': '#f1c232',
  '>60 th':   '#5DA5DA',
};

/* ======= SIMPANAN BERJANGKA CONSTS ======= */
const JENIS_LIST = ['SJTA','SSKA','SMP','SPJ'] as const;
type JenisKey = (typeof JENIS_LIST)[number];
const JENIS_COLORS: Record<JenisKey,string> = {
  SJTA: '#4e79a7',
  SSKA: '#f28e2c',
  SMP:  '#59a14f',
  SPJ:  '#e15759',
};

/* ======= TYPES (data anggota / pinjaman) ======= */
type RowUsia = { usiaBucket: string; jumlah: number; persen: number; perTP: Record<string, number> };
type RowProfesi = { profesi: string; jumlah: number; persen: number; perTP: Record<string, number> };
type UsiaPayload = { rows: RowUsia[]; total: number; tps: string[] };
type ProfesiPayload = { rows: RowProfesi[]; total: number; tps: string[] };

type RowPU = { profesi: string; jumlah: number; persen: number; perTP: Record<string, number> };
type GroupPU = { usia: string; rows: RowPU[]; subtotal: number; subtotalPerTP: Record<string, number> };
type ProfesiUsiaPayload = { tps: string[]; groups: GroupPU[]; grandTotal: number };

type PinjAgeResp = {
  totalAll: number;
  rows: { usia: string; total: number; persen: number; perTP: Record<string, number> }[];
  totalsPerTP: Record<string, number>;
};

type PurposeKey = 'KESEHATAN' | 'KESEJAHTERAAN' | 'KONSUMTIF' | 'PENDIDIKAN' | 'PRODUKTIF' | 'KOSONG';
type ApiRow = { usia: string; total: number; perPurpose: Record<PurposeKey, number> };
type ApiResp = { totalAll: number; totalsPerPurpose: Record<PurposeKey, number>; rows: ApiRow[] };

const PURPOSE_ORDER: PurposeKey[] = ['KESEHATAN','KESEJAHTERAAN','KONSUMTIF','PENDIDIKAN','PRODUKTIF','KOSONG'];

type ProfesiVsTujuanRow = {
  profesi: string;
  perPurpose: Record<PurposeKey, number>;
  total: number;
};

type ProfesiVsTujuanResp = {
  totalAll: number;
  totalsPerPurpose: Record<PurposeKey, number>;
  rows: ProfesiVsTujuanRow[];
};

type ProfesiPerTPRow = {
  profesi: string;
  perTP: Record<string, number>; // { PBL: 164, KRK: 93, ... }
  total: number;                 // kolom GAB
};

type ProfesiPerTPResp = {
  tps: string[];                 // urutan kolom TP
  grandTotal: number;            // total GAB
  totalsPerTP: Record<string, number>;
  rows: ProfesiPerTPRow[];
};

type UPTBucketRow = {
  profesi: string;
  total: number;
  perPurpose: Record<PurposeKey, number>;
};

type UPTBucket = {
  usia: string;
  rows: UPTBucketRow[];
  subtotal: number;
  subtotalPerPurpose: Record<PurposeKey, number>;
};

type UPTResponse = {
  purposes: PurposeKey[];
  buckets: UPTBucket[];
  grandTotal: number;
};

/* ======= TYPES (Simpanan Berjangka) ======= */
type UsiaJenisRow = {
  usia: string;
  perJenis: Record<JenisKey, number>;
  total: number;
  percent: number; // 0–100
};
type UsiaJenisResp = {
  jenisList: JenisKey[];
  totalAll: number;
  totalsPerJenis: Record<JenisKey, number>;
  rows: UsiaJenisRow[];
};

type SimpananProfesiRow = {
  profesi: string;
  perJenis: Record<JenisKey, number>;
  total: number;
  persen: number;
};
type SimpananProfesiAnalyticsResp = {
  jenisList: JenisKey[];
  totalAll: number;
  totalsPerJenis: Record<JenisKey, number>;
  rows: SimpananProfesiRow[];
};

type UsiaPerTPRowSB = {
  usia: string;
  perTP: Record<string, number>;
  total: number;
  persen: number;
};
type UsiaPerTPRespSB = {
  tps: string[];
  totalAll: number;
  totalsPerTP: Record<string, number>;
  rows: UsiaPerTPRowSB[];
};

type ProfesiPerTPRowSB = {
  profesi: string;
  perTP: Record<string, number>;
  total: number;
  persen: number;
};
type ProfesiPerTPRespSB = {
  tps: string[];
  totalAll: number;
  totalsPerTP: Record<string, number>;
  rows: ProfesiPerTPRowSB[];
};

/* ======= HELPERS ======= */
function normalizePU(raw: any): ProfesiUsiaPayload {
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
    for (const r of rows) for (const [tp, v] of Object.entries(r.perTP ?? {}))
      subtotalPerTP[tp] = (subtotalPerTP[tp] ?? 0) + Number(v ?? 0);

    return { usia: String(b.usia ?? ''), rows, subtotal: Number(b.total ?? 0), subtotalPerTP };
  });

  const tps = Array.isArray(p.tps)
    ? p.tps
    : Object.keys(groups.reduce((acc, g) => Object.assign(acc, g.subtotalPerTP), {} as Record<string, number>));

  return { tps, groups, grandTotal: Number(p.grandTotal ?? 0) };
}

function normalizePinjamanUsia(resp: PinjAgeResp): UsiaPayload {
  const rows = resp.rows.map(r => ({
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
        perTP: TP_ORDER.reduce((acc, tp) => { acc[tp] = Number(resp.totalsPerTP?.[tp] ?? 0); return acc; }, {} as Record<string, number>),
      },
    ],
    total: resp.totalAll,
    tps: [...TP_ORDER],
  };
}

function normUsiaKey(s: string) {
  // samakan "24 - 35 th" <-> "24-35 th"
  return s.replace(/\s*-\s*/g, '-').trim();
}

/* ======= PAGE ======= */
export default function Page() {
  // data-anggota
  const [usia, setUsia] = useState<UsiaPayload|null>(null);
  const [profesi, setProfesi] = useState<ProfesiPayload|null>(null);
  const [tahun, setTahun] = useState<string>('');
  const [profUsia, setProfUsia] = useState<ProfesiUsiaPayload|null>(null);

  // pinjaman usia
  const [usiaPinjaman, setUsiaPinjaman] = useState<UsiaPayload|null>(null);
  const [tahunPinj, setTahunPinj] = useState<string>('');

  // usia vs tujuan pinjaman
  const [uvt, setUvt] = useState<ApiResp | null>(null);
  const [pvt, setPvt] = useState<ProfesiVsTujuanResp | null>(null);
  const [pptp, setPptp] = useState<ProfesiPerTPResp | null>(null);
  const [year, setYear] = useState<string>('');
  const [tp, setTp] = useState<string>('');      // single input; bisa di-extend ke multi append
  const [produk, setProduk] = useState<string>('');
  const [cabang, setCabang] = useState<string>('');
  const [upt, setUpt] = useState<UPTResponse | null>(null);

  // simpanan berjangka (filters)
  const [jenis, setJenis] = useState<JenisKey | ''>('');
  const [tanggalLaporan, setTanggalLaporan] = useState<string>('');
  const [tpFilter, setTpFilter] = useState<string>('');

  // simpanan berjangka (data)
  const [usiaJenis, setUsiaJenis] = useState<UsiaJenisResp | null>(null);
  const [profesiJenis, setProfesiJenis] = useState<SimpananProfesiAnalyticsResp | null>(null);
  const [usiaTPSb, setUsiaTPSb] = useState<UsiaPerTPRespSB | null>(null);
  const [profesiTPSb, setProfesiTPSb] = useState<ProfesiPerTPRespSB | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string|null>(null);
  const [loadingSimpanan, setLoadingSimpanan] = useState(false);
  const [errSimpanan, setErrSimpanan] = useState<string | null>(null);

  /* ---- fetch data-anggota (usia, profesi, profesi×usia) ---- */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const qs = tahun ? `?tahunGabung=${encodeURIComponent(tahun)}` : '';
        const [rUsia, rProf, rPU] = await Promise.all([
          fetch(`/api/data-anggota/analytics`, { credentials: 'include' }),
          fetch(`/api/data-anggota/analytics/profesi`, { credentials: 'include' }),
          fetch(`/api/data-anggota/profesi-usia${qs}`, { credentials: 'include' }),
        ]);
        if (!rUsia.ok) throw new Error(`HTTP ${rUsia.status} (usia)`);
        if (!rProf.ok) throw new Error(`HTTP ${rProf.status} (profesi)`);
        if (!rPU.ok)   throw new Error(`HTTP ${rPU.status} (profesi-usia)`);

        const [jUsia, jProf, jPU] = await Promise.all([rUsia.json(), rProf.json(), rPU.json()]);
        if (!alive) return;
        setUsia(jUsia.usia as UsiaPayload);
        setProfesi(jProf as ProfesiPayload);
        setProfUsia(normalizePU(jPU));
        setErr(null);
      } catch (e:any) {
        if (alive) setErr(e?.message ?? 'Gagal memuat data');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [tahun]);

  /* ---- fetch pinjaman/analytics/usia ---- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const url = new URL('/api/pinjaman/analytics/usia', window.location.origin);
        if (tahunPinj) url.searchParams.set('year', tahunPinj);
        const r = await fetch(url.toString(), { credentials: 'include', cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status} (pinjaman-usia)`);
        const j = await r.json();
        if (!alive) return;
        setUsiaPinjaman(normalizePinjamanUsia(j));
      } catch {}
    })();
    return () => { alive = false; };
  }, [tahunPinj]);

  /* ---- fetch pinjaman/analytics/usia-vs-tujuan ---- */
  useEffect(() => {
    const url = new URL('/api/pinjaman/analytics/usia-vs-tujuan', window.location.origin);
    if (year)   url.searchParams.set('year', year);
    if (tp)     url.searchParams.append('tp', tp);
    if (produk) url.searchParams.set('produk', produk);
    if (cabang) url.searchParams.set('cabang', cabang);

    setLoading(true);
    setErr(null);
    fetch(url.toString(), { cache: 'no-store', credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiResp>;
      })
      .then(setUvt)
      .catch((e) => setErr(e.message || 'Gagal memuat'))
      .finally(() => setLoading(false));
  }, [year, tp, produk, cabang]);

  /* ---- fetch pinjaman/profesi-vs-tujuan & profesi-per-tp ---- */
  useEffect(() => {
    const url1 = new URL('/api/pinjaman/analytics/profesi-vs-tujuan', window.location.origin);
    const url2 = new URL('/api/pinjaman/analytics/profesi-per-tp', window.location.origin);
    if (year)   { url1.searchParams.set('year', year);   url2.searchParams.set('year', year); }
    if (tp)     { url1.searchParams.append('tp', tp);    url2.searchParams.append('tp', tp); }
    if (produk) { url1.searchParams.set('produk', produk); url2.searchParams.set('produk', produk); }
    if (cabang) { url1.searchParams.set('cabang', cabang); url2.searchParams.set('cabang', cabang); }

    Promise.all([
      fetch(url1.toString(), { credentials:'include', cache:'no-store' }),
      fetch(url2.toString(), { credentials:'include', cache:'no-store' }),
    ])
    .then(async ([a,b]) => {
      if (!a.ok) throw new Error(`profesi-vs-tujuan HTTP ${a.status}`);
      if (!b.ok) throw new Error(`profesi-per-tp HTTP ${b.status}`);
      const j1 = await a.json() as ProfesiVsTujuanResp;
      const j2 = await b.json() as ProfesiPerTPResp;
      setPvt(j1); setPptp(j2);
    })
    .catch((e:any) => setErr(e.message || 'Gagal memuat tabel profesi'))
    // tidak setLoading di sini supaya tidak ganggu loader utama
  }, [year, tp, produk, cabang]);

  /* ---- fetch pinjaman/analytics/usia-profesi-tujuan ---- */
  useEffect(() => {
    const url = new URL('/api/pinjaman/analytics/usia-profesi-tujuan', window.location.origin);
    if (year)   url.searchParams.set('year', year);
    if (tp)     url.searchParams.append('tp', tp);
    if (produk) url.searchParams.set('produk', produk);
    if (cabang) url.searchParams.set('cabang', cabang);

    fetch(url.toString(), { credentials: 'include', cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<UPTResponse>; })
      .then(setUpt)
      .catch(e => setErr(e.message || 'Gagal memuat UPT'));
  }, [year, tp, produk, cabang]);

  /* ---- fetch Simpanan Berjangka analytics ---- */
  useEffect(() => {
    let alive = true;
    setLoadingSimpanan(true);
    setErrSimpanan(null);

    const paramsBase = new URLSearchParams();
    if (jenis) paramsBase.set('jenis', jenis);
    if (tanggalLaporan) paramsBase.set('tanggalLaporan', tanggalLaporan);

    const paramsTP = new URLSearchParams(paramsBase);
    if (tpFilter.trim()) paramsTP.set('tp', tpFilter.trim());

    const qsBase = paramsBase.toString();
    const qsTP = paramsTP.toString();
    const baseUrl = '/api/simpanan-berjangka/analytics';

    (async () => {
      try {
        const [rUsiaJenis, rProfJenis, rUsiaTP, rProfTP] = await Promise.all([
          fetch(`${baseUrl}/usia${qsBase ? `?${qsBase}` : ''}`, { credentials: 'include', cache: 'no-store' }),
          fetch(`${baseUrl}/profesi${qsBase ? `?${qsBase}` : ''}`, { credentials: 'include', cache: 'no-store' }),
          fetch(`${baseUrl}/usia-tp${qsTP ? `?${qsTP}` : ''}`, { credentials: 'include', cache: 'no-store' }),
          fetch(`${baseUrl}/profesi-tp${qsTP ? `?${qsTP}` : ''}`, { credentials: 'include', cache: 'no-store' }),
        ]);

        if (!alive) return;

        if (!rUsiaJenis.ok) throw new Error(`Usia×Jenis HTTP ${rUsiaJenis.status}`);
        if (!rProfJenis.ok) throw new Error(`Profesi×Jenis HTTP ${rProfJenis.status}`);
        if (!rUsiaTP.ok)    throw new Error(`Usia×TP HTTP ${rUsiaTP.status}`);
        if (!rProfTP.ok)    throw new Error(`Profesi×TP HTTP ${rProfTP.status}`);

        const [jUsiaJenis, jProfJenis, jUsiaTP, jProfTP] = await Promise.all([
          rUsiaJenis.json(),
          rProfJenis.json(),
          rUsiaTP.json(),
          rProfTP.json(),
        ]);

        if (!alive) return;

        setUsiaJenis(jUsiaJenis as UsiaJenisResp);
        setProfesiJenis(jProfJenis as SimpananProfesiAnalyticsResp);
        setUsiaTPSb(jUsiaTP as UsiaPerTPRespSB);
        setProfesiTPSb(jProfTP as ProfesiPerTPRespSB);
        setErrSimpanan(null);
      } catch (e:any) {
        if (alive) setErrSimpanan(e?.message ?? 'Gagal memuat data simpanan berjangka');
      } finally {
        if (alive) setLoadingSimpanan(false);
      }
    })();

    return () => { alive = false; };
  }, [jenis, tanggalLaporan, tpFilter]);

  /* ---- memo helpers: data-anggota / pinjaman ---- */
  const pu: ProfesiUsiaPayload = profUsia ?? { tps: [], groups: [], grandTotal: 0 };
  const rowsUsia = usia?.rows ?? [];
  const tpsUsia  = usia?.tps  ?? [];
  const maxUsiaPerTP = useMemo(() => {
    const out: Record<string, number> = {};
    for (const tp of tpsUsia)
      out[tp] = Math.max(0, ...rowsUsia.filter(r => r.usiaBucket !== 'TOTAL').map(r => r.perTP[tp] ?? 0));
    return out;
  }, [rowsUsia, tpsUsia]);

  const chartUsia = rowsUsia.filter(r => r.usiaBucket !== 'TOTAL')
    .map(r => ({ usia: r.usiaBucket, ...tpsUsia.reduce((acc, tp) => { acc[tp] = r.perTP[tp] ?? 0; return acc; }, {} as Record<string, number>) }));
  const pieUsia = rowsUsia.filter(r => r.usiaBucket !== 'TOTAL').map(r => ({ name: r.usiaBucket, value: r.persen }));

  const rowsProf = profesi?.rows ?? [];
  const tpsProf  = profesi?.tps  ?? [];
  const maxProfPerTP = useMemo(() => {
    const out: Record<string, number> = {};
    for (const tp of tpsProf) out[tp] = Math.max(0, ...rowsProf.map(r => r.perTP[tp] ?? 0));
    return out;
  }, [rowsProf, tpsProf]);

  const chartProf = rowsProf.map(r => ({ profesi: r.profesi, ...tpsProf.reduce((a,tp)=>{a[tp]=r.perTP[tp]??0;return a;},{} as Record<string,number>)}));

  const rowsUvt = useMemo(() => {
    if (!uvt) return [];
    const order = new Map([['<24 th',0],['24-35 th',1],['36-45 th',2],['46-60 th',3],['>60 th',4]]);
    return [...uvt.rows]
      .map(r => ({ ...r, usia: normUsiaKey(r.usia) }))
      .sort((a,b)=>(order.get(a.usia)??99)-(order.get(b.usia)??99));
  }, [uvt]);

  const lineData = useMemo(() => {
    if (!uvt) return [];
    // pivot: per purpose → nilai tiap usia
    return PURPOSE_ORDER.map((p) => {
      const row: any = { purpose: p === 'KOSONG' ? 'data kosong' : (p[0] + p.slice(1).toLowerCase()) };
      for (const age of AGE_ORDER) {
        const r = rowsUvt.find(x => x.usia === age);
        row[age] = r ? (r.perPurpose as any)[p] ?? 0 : 0;
      }
      return row;
    });
  }, [uvt, rowsUvt]);

  const maxPurpose: Record<PurposeKey, number> = useMemo(() => {
    if (!pvt) return {} as any;
    const out: any = {};
    for (const k of PURPOSE_ORDER) out[k] = Math.max(0, ...pvt.rows.map(r => r.perPurpose[k] ?? 0));
    return out;
  }, [pvt]);

  const maxPerTP: Record<string, number> = useMemo(() => {
    if (!pptp) return {};
    const out: Record<string, number> = {};
    for (const tp of (pptp?.tps ?? [])) out[tp] = Math.max(0, ...pptp.rows.map(r => r.perTP[tp] ?? 0));
    return out;
  }, [pptp]);

  /* ---- memo helpers: Simpanan Berjangka ---- */
  const usiaRowsSb = useMemo(() => {
    if (!usiaJenis) return [];
    const order = new Map([
      ['<24 th', 0],
      ['24-35 th', 1],
      ['36-45 th', 2],
      ['46-60 th', 3],
      ['>60 th', 4],
      ['Tidak Valid', 5],
    ]);
    return [...usiaJenis.rows].sort(
      (a, b) => (order.get(a.usia) ?? 99) - (order.get(b.usia) ?? 99),
    );
  }, [usiaJenis]);

  const usiaChartSb = useMemo(() => {
    return usiaRowsSb.map((r) => {
      const row: any = { usia: r.usia };
      for (const j of JENIS_LIST) row[j] = r.perJenis[j] ?? 0;
      return row;
    });
  }, [usiaRowsSb]);

  const maxUsiaPerJenisSb: Record<JenisKey, number> = useMemo(() => {
    const out: any = {};
    if (!usiaJenis) return out;
    for (const j of JENIS_LIST) {
      out[j] = Math.max(0, ...usiaJenis.rows.map((r) => r.perJenis[j] ?? 0));
    }
    return out;
  }, [usiaJenis]);

  const profesiRowsSb = profesiJenis?.rows ?? [];
  const profesiChartSb = useMemo(() => {
    return profesiRowsSb.map((r) => {
      const row: any = { profesi: r.profesi || 'Kosong' };
      for (const j of JENIS_LIST) row[j] = r.perJenis[j] ?? 0;
      return row;
    });
  }, [profesiRowsSb]);

  const maxProfesiPerJenisSb: Record<JenisKey, number> = useMemo(() => {
    const out: any = {};
    if (!profesiJenis) return out;
    for (const j of JENIS_LIST) {
      out[j] = Math.max(0, ...profesiJenis.rows.map((r) => r.perJenis[j] ?? 0));
    }
    return out;
  }, [profesiJenis]);

  const usiaTPRowsSb = usiaTPSb?.rows ?? [];
  const maxUsiaPerTPSb: Record<string, number> = useMemo(() => {
    const out: Record<string, number> = {};
    if (!usiaTPSb) return out;
    for (const tp of usiaTPSb.tps) {
      out[tp] = Math.max(
        0,
        ...usiaTPSb.rows
          .filter((r) => r.usia !== 'TOTAL')
          .map((r) => r.perTP[tp] ?? 0),
      );
    }
    return out;
  }, [usiaTPSb]);

  const profesiTPRowsSb = profesiTPSb?.rows ?? [];
  const maxProfesiPerTPSb: Record<string, number> = useMemo(() => {
    const out: Record<string, number> = {};
    if (!profesiTPSb) return out;
    for (const tp of profesiTPSb.tps) {
      out[tp] = Math.max(0, ...profesiTPSb.rows.map((r) => r.perTP[tp] ?? 0));
    }
    return out;
  }, [profesiTPSb]);

  /* ---- render ---- */
  if (loading && !usia && !profesi && !uvt) return <div className="p-6">Memuat…</div>;
  if (err) return <div className="p-6 text-red-600">Error: {err}</div>;
  if (!usia || !profesi) return null;

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-6xl space-y-10">

        {/* ===================== USIA ANGGOTA ===================== */}
        <section>
          <h1 className="mb-4 text-2xl font-semibold">Klasifikasi Usia Keseluruhan Anggota</h1>
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-[1] bg-amber-400/90 px-3 py-2 text-left">USIA</th>
                  <th className="bg-amber-400/90 px-3 py-2 text-right">JUMLAH</th>
                  <th className="bg-amber-400/90 px-3 py-2 text-right">%</th>
                  {tpsUsia.map(tp => <th key={tp} className="bg-amber-400/90 px-3 py-2 text-right">{tp}</th>)}
                </tr>
              </thead>
              <tbody>
                {rowsUsia.map(r => {
                  const isTotal = r.usiaBucket === 'TOTAL';
                  const rowClass = isTotal
                    ? 'bg-amber-200 font-semibold'
                    : r.usiaBucket === '36 - 45 th' ? 'bg-green-200'
                    : r.usiaBucket === '46 - 60 th' ? 'bg-orange-100' : 'bg-white';
                  return (
                    <tr key={r.usiaBucket} className={`${rowClass} border-b last:border-b-0`}>
                      <td className="sticky left-0 z-[1] px-3 py-2">{r.usiaBucket}</td>
                      <td className="px-3 py-2 text-right">{int(r.jumlah)}</td>
                      <td className="px-3 py-2 text-right">{pct(r.persen)}</td>
                      {tpsUsia.map(tp => {
                        const v = r.perTP[tp] ?? 0;
                        const isMaxCell = !isTotal && v === maxUsiaPerTP[tp] && v > 0;
                        return (
                          <td key={tp} className={`px-3 py-2 text-right ${isMaxCell ? 'bg-green-300 font-medium' : ''}`}>
                            {int(v)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Charts USIA */}
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-base font-semibold">USIA ANGGOTA (Stacked per TP)</h2>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartUsia} margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="usia" /><YAxis />
                    <Tooltip formatter={(v:any)=> int(Number(v))} /><Legend />
                    {tpsUsia.map(tp => <Bar key={tp} dataKey={tp} stackId="usia" fill={TP_COLORS[tp] || '#8884d8'} />)}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-base font-semibold">Klasifikasi Usia Anggota (%)</h2>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip formatter={(v:any)=>(Number(v)/100).toLocaleString('id-ID',{style:'percent'})} />
                    <Legend />
                    <Pie data={pieUsia} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="80%"
                         label={({ name, value }: any) => `${name} ${Math.round(value)}%`}>
                      {pieUsia.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== PROFESI ===================== */}
        <section>
          <h1 className="mb-4 text-2xl font-semibold">Klasifikasi Anggota Berdasarkan Profesi</h1>
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-[1] bg-amber-400/90 px-3 py-2 text-left">PROFESI</th>
                  <th className="bg-amber-400/90 px-3 py-2 text-right">JUMLAH</th>
                  <th className="bg-amber-400/90 px-3 py-2 text-right">%</th>
                  {tpsProf.map(tp => <th key={tp} className="bg-amber-400/90 px-3 py-2 text-right">{tp}</th>)}
                </tr>
              </thead>
              <tbody>
                {rowsProf.map(r => {
                  const vMax = Object.fromEntries(tpsProf.map(tp => [tp, Math.max(0, ...rowsProf.map(x => x.perTP[tp] ?? 0))]));
                  return (
                    <tr key={r.profesi} className="border-b last:border-b-0">
                      <td className="sticky left-0 z-[1] bg-white px-3 py-2">{r.profesi}</td>
                      <td className="px-3 py-2 text-right">{int(r.jumlah)}</td>
                      <td className="px-3 py-2 text-right">{pct(r.persen)}</td>
                      {tpsProf.map(tp => {
                        const v = r.perTP[tp] ?? 0;
                        const isMaxCell = v === (vMax as any)[tp] && v > 0;
                        return <td key={tp} className={`px-3 py-2 text-right ${isMaxCell ? 'bg-green-300 font-medium' : ''}`}>{int(v)}</td>;
                      })}
                    </tr>
                  );
                })}
                <tr className="bg-amber-200 font-semibold">
                  <td className="sticky left-0 z-[1] px-3 py-2">JUMLAH</td>
                  <td className="px-3 py-2 text-right">{int(profesi.total)}</td>
                  <td className="px-3 py-2 text-right">{pct(100)}</td>
                  {tpsProf.map(tp => <td key={tp} className="px-3 py-2 text-right">
                    {int(rowsProf.reduce((s, r) => s + (r.perTP[tp] ?? 0), 0))}
                  </td>)}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-base font-semibold">PROFESI (Stacked per TP)</h2>
            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartProf} margin={{ top: 8, right: 16, left: 0, bottom: 64 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="profesi" interval={0} angle={-30} textAnchor="end" height={70}/>
                  <YAxis />
                  <Tooltip formatter={(v:any)=> (Number(v)).toLocaleString('id-ID')} />
                  <Legend />
                  {tpsProf.map(tp => <Bar key={tp} dataKey={tp} stackId="prof" fill={TP_COLORS[tp] || '#8884d8'} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* ===================== PROFESI × USIA ===================== */}
        <section>
          <div className="mb-3 flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Klasifikasi PROFESI × USIA (per TP)</h1>
            <div className="ml-auto flex items-center gap-2">
              <label className="text-sm text-neutral-600">Tahun gabung:</label>
              <select value={tahun} onChange={(e)=> setTahun(e.target.value)} className="rounded-md border px-2 py-1 text-sm">
                <option value="">Semua</option><option value="2024">2024</option><option value="2025">2025</option>
              </select>
            </div>
          </div>

          {!profUsia ? (
            <div className="rounded-xl border bg-white p-4 shadow-sm">Memuat data PROFESI × USIA…</div>
          ) : pu.groups.length === 0 ? (
            <div className="rounded-xl border bg-white p-4 shadow-sm text-neutral-600">Tidak ada data untuk filter.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table className="w-full min-w-[1100px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="bg-amber-400/90 px-3 py-2 text-left">Usia</th>
                    <th className="bg-amber-400/90 px-3 py-2 text-left">Profesi</th>
                    <th className="bg-amber-400/90 px-3 py-2 text-right">Jumlah</th>
                    <th className="bg-amber-400/90 px-3 py-2 text-right">%</th>
                    {pu.tps.map(tp => <th key={tp} className="bg-amber-400/90 px-3 py-2 text-right">{tp}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {pu.groups.map((g) => (
                    <React.Fragment key={g.usia}>
                      <tr className="bg-neutral-100 font-medium">
                        <td className="px-3 py-2">{g.usia}</td><td className="px-3 py-2">—</td>
                        <td className="px-3 py-2 text-right">{int(g.subtotal)}</td>
                        <td className="px-3 py-2 text-right">{pct((g.subtotal / Math.max(1, pu.grandTotal)) * 100)}</td>
                        {pu.tps.map(tp => <td key={tp} className="px-3 py-2 text-right">{int(g.subtotalPerTP[tp] ?? 0)}</td>)}
                      </tr>
                      {g.rows.map((r) => (
                        <tr key={`${g.usia}__${r.profesi}`} className="border-b last:border-b-0">
                          <td className="px-3 py-2 text-neutral-500"></td>
                          <td className="px-3 py-2">{r.profesi}</td>
                          <td className="px-3 py-2 text-right">{int(r.jumlah)}</td>
                          <td className="px-3 py-2 text-right">{pct(r.persen)}</td>
                          {pu.tps.map(tp => <td key={tp} className="px-3 py-2 text-right">{int(r.perTP[tp] ?? 0)}</td>)}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                  <tr className="bg-amber-200 font-semibold">
                    <td className="px-3 py-2">TOTAL</td><td className="px-3 py-2">—</td>
                    <td className="px-3 py-2 text-right">{int(pu.grandTotal)}</td>
                    <td className="px-3 py-2 text-right">{pct(100)}</td>
                    {pu.tps.map(tp => <td key={tp} className="px-3 py-2 text-right">
                      {int(sum(pu.groups.map(g => g.subtotalPerTP[tp] ?? 0)))}
                    </td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ===================== USIA PEMINJAM ===================== */}
        <section>
          <div className="mb-3 flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Klasifikasi Usia Peminjam</h1>
            <div className="ml-auto flex items-center gap-2">
              <label className="text-sm text-neutral-600">Tahun pinjam:</label>
              <input value={tahunPinj} onChange={(e)=> setTahunPinj(e.target.value)}
                     placeholder="mis. 2025" className="rounded-md border px-2 py-1 text-sm w-28" />
              <button onClick={()=>setTahunPinj('')} className="text-sm rounded-md border px-2 py-1">Reset</button>
            </div>
          </div>

          {!usiaPinjaman ? (
            <div className="rounded-xl border bg-white p-4 shadow-sm">Memuat data usia peminjam…</div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-[1] bg-amber-400/90 px-3 py-2 text-left">USIA</th>
                      <th className="bg-amber-400/90 px-3 py-2 text-right">JUMLAH</th>
                      <th className="bg-amber-400/90 px-3 py-2 text-right">%</th>
                      {usiaPinjaman.tps.map(tp => <th key={tp} className="bg-amber-400/90 px-3 py-2 text-right">{tp}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {usiaPinjaman.rows.map(r => {
                      const isTotal = r.usiaBucket === 'TOTAL';
                      const rowClass = isTotal ? 'bg-amber-200 font-semibold'
                        : r.usiaBucket === '36-45 th' ? 'bg-green-200'
                        : r.usiaBucket === '46-60 th' ? 'bg-yellow-100'
                        : r.usiaBucket === '>60 th' ? 'bg-orange-100' : '';
                      const maxPerTPRow: Record<string, number> = Object.fromEntries(
                        usiaPinjaman.tps.map(tp => [tp, Math.max(0, ...usiaPinjaman.rows.filter(x=>x.usiaBucket!=='TOTAL').map(x=>x.perTP[tp] ?? 0))])
                      );
                      return (
                        <tr key={r.usiaBucket} className={`${rowClass} border-b last:border-b-0`}>
                          <td className="sticky left-0 z-[1] px-3 py-2">{r.usiaBucket}</td>
                          <td className="px-3 py-2 text-right">{int(r.jumlah)}</td>
                          <td className="px-3 py-2 text-right">{pct(r.persen)}</td>
                          {usiaPinjaman.tps.map(tp => {
                            const v = r.perTP[tp] ?? 0;
                            const isMaxCell = !isTotal && v === maxPerTPRow[tp] && v > 0;
                            return <td key={tp} className={`px-3 py-2 text-right ${isMaxCell ? 'bg-green-300 font-medium' : ''}`}>{int(v)}</td>;
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-base font-semibold">USIA PEMINJAM (Stacked per TP)</h2>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={usiaPinjaman.rows.filter(r=>r.usiaBucket!=='TOTAL').map(r => ({
                        usia: r.usiaBucket,
                        ...usiaPinjaman.tps.reduce((acc, tp) => { acc[tp] = r.perTP[tp] ?? 0; return acc; }, {} as Record<string,number>)
                      }))}
                      margin={{ top: 8, right: 16, left: 0, bottom: 16 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="usia" /><YAxis />
                      <Tooltip formatter={(v:any)=> int(Number(v))} /><Legend />
                      {usiaPinjaman.tps.map(tp => <Bar key={tp} dataKey={tp} stackId="usia-pinj" fill={TP_COLORS[tp] || '#8884d8'} />)}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ===================== USIA × TUJUAN PINJAMAN ===================== */}
        <section>
          <h1 className="text-2xl font-semibold mb-3">Klasifikasi USIA dibanding TUJUAN PINJAMAN</h1>

          {/* Filter */}
          <div className="mb-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-sm mb-1 text-neutral-600">Tahun (opsional)</label>
              <input value={year} onChange={(e)=>setYear(e.target.value)} placeholder="2025" className="border rounded px-3 py-2 w-28" />
            </div>
            <div>
              <label className="block text-sm mb-1 text-neutral-600">TP (opsional)</label>
              <input value={tp} onChange={(e)=>setTp(e.target.value)} placeholder="mis. PBL" className="border rounded px-3 py-2 w-28" />
            </div>
            <div>
              <label className="block text-sm mb-1 text-neutral-600">Produk (opsional)</label>
              <input value={produk} onChange={(e)=>setProduk(e.target.value)} placeholder="PUMA / PINJAMAN UMUM" className="border rounded px-3 py-2 w-56" />
            </div>
            <div>
              <label className="block text-sm mb-1 text-neutral-600">Cabang (opsional)</label>
              <input value={cabang} onChange={(e)=>setCabang(e.target.value)} placeholder="PBL / KRK / ..." className="border rounded px-3 py-2 w-28" />
            </div>
            <button onClick={()=>{ setYear(''); setTp(''); setProduk(''); setCabang(''); }} className="border rounded px-3 py-2 text-sm">Reset</button>
          </div>

          {!uvt ? (
            <div className="rounded-xl border bg-white p-4 shadow-sm">Memuat usia × tujuan…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] border-collapse w-full text-sm">
                <thead>
                  <tr>
                    <th className="bg-amber-200 border px-3 py-2"></th>
                    <th colSpan={PURPOSE_ORDER.length} className="bg-amber-300 border px-3 py-2 text-center font-semibold">
                      TUJUAN PINJAMAN
                    </th>
                  </tr>
                  <tr>
                    <th className="bg-amber-100 border px-3 py-2 text-left">USIA</th>
                    {PURPOSE_ORDER.map(p =>
                      <th key={p} className="bg-amber-100 border px-3 py-2 text-center">
                        {p === 'KOSONG' ? 'data kosong' : (p[0] + p.slice(1).toLowerCase())}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rowsUvt.map(r => {
                    const rowBg =
                      r.usia === '46-60 th' ? 'bg-yellow-100'
                        : (r.usia === '24-35 th' || r.usia === '36-45 th') ? 'bg-green-100'
                        : r.usia === '>60 th' ? 'bg-orange-100' : '';
                    return (
                      <tr key={r.usia} className={rowBg}>
                        <td className="border px-3 py-2 font-medium">{r.usia}</td>
                        {PURPOSE_ORDER.map(p =>
                          <td key={p} className="border px-3 py-2 text-center">{int(r.perPurpose[p] ?? 0)}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-base font-semibold">USIA × TUJUAN PINJAMAN (Line)</h2>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="purpose" />
                  <YAxis />
                  <Tooltip formatter={(v: any) => (Number(v)).toLocaleString('id-ID')} />
                  <Legend />
                  {AGE_ORDER.map(age => (
                    <Line
                      key={age}
                      type="monotone"
                      dataKey={age}
                      stroke={AGE_COLORS[age]}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

        </section>

        {/* ===================== PROFESI × TUJUAN PINJAMAN ===================== */}
        <section>
          <h1 className="text-2xl font-semibold mb-3">6. KLASIFIKASI PROFESI DIBANDING TUJUAN PINJAMAN</h1>

          {!pvt ? (
            <div className="rounded-xl border bg-white p-4 shadow-sm">Memuat tabel…</div>
          ) : (
            <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
              <table className="min-w-[900px] w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="bg-amber-200 border px-3 py-2 text-left">Profesi</th>
                    {PURPOSE_ORDER.map(pk => (
                      <th key={pk} className="bg-amber-200 border px-3 py-2 text-center">
                        {pk==='KOSONG'?'Kosong':pk.charAt(0)+pk.slice(1).toLowerCase()}
                      </th>
                    ))}
                    <th className="bg-amber-200 border px-3 py-2 text-right">JML</th>
                  </tr>
                </thead>
                <tbody>
                  {pvt.rows.map(r => (
                    <tr key={r.profesi}>
                      <td className="border px-3 py-2">{r.profesi}</td>
                      {PURPOSE_ORDER.map(pk => {
                        const v = r.perPurpose[pk] ?? 0;
                        const isMaxCell = v > 0 && v === maxPurpose[pk];
                        return (
                          <td key={pk} className={`border px-3 py-2 text-center ${isMaxCell?'bg-yellow-100 font-medium':''}`}>
                            {int(v)}
                          </td>
                        );
                      })}
                      <td className="border px-3 py-2 text-right font-medium">{int(r.total)}</td>
                    </tr>
                  ))}
                  <tr className="bg-amber-100 font-semibold">
                    <td className="border px-3 py-2">JUMLAH</td>
                    {PURPOSE_ORDER.map(pk => (
                      <td key={pk} className="border px-3 py-2 text-center">{int(pvt.totalsPerPurpose[pk] ?? 0)}</td>
                    ))}
                    <td className="border px-3 py-2 text-right">{int(pvt.totalAll)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ===================== PROFESI PEMINJAM PER TP ===================== */}
        <section>
          <h1 className="text-2xl font-semibold mb-3">PROFESI PEMINJAM</h1>

          {!pptp ? (
            <div className="rounded-xl border bg-white p-4 shadow-sm">Memuat tabel…</div>
          ) : (
            <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
              <table className="min-w-[900px] w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="bg-sky-100 border px-3 py-2 text-left">Profesi</th>
                    <th className="bg-sky-100 border px-3 py-2 text-right">GAB</th>
                    {pptp.tps.map(tp => (
                      <th key={tp} className="bg-sky-100 border px-3 py-2 text-right">{tp}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pptp.rows.map(r => (
                    <tr key={r.profesi} className={r.profesi==='Wiraswasta' ? 'bg-green-100' : ''}>
                      <td className="border px-3 py-2">{r.profesi}</td>
                      <td className="border px-3 py-2 text-right font-medium">{int(r.total)}</td>
                      {pptp.tps.map(tp => {
                        const v = r.perTP[tp] ?? 0;
                        const isMaxCell = v > 0 && v === maxPerTP[tp];
                        return (
                          <td key={tp} className={`border px-3 py-2 text-right ${isMaxCell?'bg-green-200 font-medium':''}`}>
                            {int(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="bg-amber-100 font-semibold">
                    <td className="border px-3 py-2">JUMLAH</td>
                    <td className="border px-3 py-2 text-right">{int(pptp.grandTotal)}</td>
                    {pptp.tps.map(tp => (
                      <td key={tp} className="border px-3 py-2 text-right">{int(pptp.totalsPerTP[tp] ?? 0)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
        
        {/* ===================== USIA × PROFESI × TUJUAN PINJAMAN ===================== */}
        <section>
          <h1 className="text-2xl font-semibold mb-3">Klasifikasi Usia × Profesi × Tujuan Pinjaman</h1>

          {!upt ? (
            <div className="rounded-xl border bg-white p-4 shadow-sm">Memuat tabel…</div>
          ) : upt.buckets.length === 0 ? (
            <div className="rounded-xl border bg-white p-4 shadow-sm text-neutral-600">Tidak ada data untuk filter.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table className="min-w-[1100px] w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="bg-amber-200 border px-3 py-2 text-left">Usia</th>
                    <th className="bg-amber-200 border px-3 py-2 text-left">Profesi</th>
                    {upt.purposes.map(p => (
                      <th key={p} className="bg-amber-200 border px-3 py-2 text-center">
                        {p === 'KOSONG' ? 'Kosong' : p[0] + p.slice(1).toLowerCase()}
                      </th>
                    ))}
                    <th className="bg-amber-200 border px-3 py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {upt.buckets.map(b => (
                    <React.Fragment key={b.usia}>
                      {/* header usia */}
                      <tr className="bg-neutral-100 font-medium">
                        <td className="border px-3 py-2">{b.usia}</td>
                        <td className="border px-3 py-2">—</td>
                        {upt.purposes.map(p => (
                          <td key={p} className="border px-3 py-2 text-center">
                            { (b.subtotalPerPurpose[p] ?? 0).toLocaleString('id-ID') }
                          </td>
                        ))}
                        <td className="border px-3 py-2 text-right">{ b.subtotal.toLocaleString('id-ID') }</td>
                      </tr>

                      {/* baris profesi */}
                      {b.rows.map(r => {
                        const maxInRow = Math.max(0, ...upt.purposes.map(p => r.perPurpose[p] ?? 0));
                        return (
                          <tr key={`${b.usia}__${r.profesi}`}>
                            <td className="border px-3 py-2 text-neutral-500"></td>
                            <td className="border px-3 py-2">{r.profesi || 'Kosong'}</td>
                            {upt.purposes.map(p => {
                              const v = r.perPurpose[p] ?? 0;
                              const hl = v > 0 && v === maxInRow ? 'bg-yellow-100 font-medium' : '';
                              return (
                                <td key={p} className={`border px-3 py-2 text-center ${hl}`}>
                                  {v === 0 ? '-' : v.toLocaleString('id-ID')}
                                </td>
                              );
                            })}
                            <td className="border px-3 py-2 text-right">{r.total.toLocaleString('id-ID')}</td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}

                  {/* grand total */}
                  <tr className="bg-amber-100 font-semibold">
                    <td className="border px-3 py-2">TOTAL</td>
                    <td className="border px-3 py-2">—</td>
                    {upt.purposes.map(p => {
                      const tot = upt.buckets.reduce((s, b) => s + (b.subtotalPerPurpose[p] ?? 0), 0);
                      return <td key={p} className="border px-3 py-2 text-center">{tot.toLocaleString('id-ID')}</td>;
                    })}
                    <td className="border px-3 py-2 text-right">{upt.grandTotal.toLocaleString('id-ID')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ===================== ANALITIK SIMPANAN BERJANGKA ===================== */}
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h1 className="mb-4 text-xl font-semibold">Analitik Simpanan Berjangka</h1>
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <div>
              <label className="mb-1 block text-neutral-600">Jenis</label>
              <select
                value={jenis}
                onChange={(e) =>
                  setJenis(e.target.value ? (e.target.value as JenisKey) : '')
                }
                className="w-40 rounded-md border px-2 py-1"
              >
                <option value="">Semua</option>
                {JENIS_LIST.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-neutral-600">Tanggal Laporan</label>
              <input
                type="date"
                value={tanggalLaporan}
                onChange={(e) => setTanggalLaporan(e.target.value)}
                className="rounded-md border px-2 py-1"
              />
            </div>

            <div>
              <label className="mb-1 block text-neutral-600">Filter TP (opsional)</label>
              <input
                type="text"
                placeholder="mis. PBL,KRK"
                value={tpFilter}
                onChange={(e) => setTpFilter(e.target.value)}
                className="w-40 rounded-md border px-2 py-1"
              />
            </div>

            <button
              onClick={() => {
                setJenis('');
                setTanggalLaporan('');
                setTpFilter('');
              }}
              className="ml-auto rounded-md border px-3 py-2 text-xs"
            >
              Reset filter
            </button>
          </div>

          {loadingSimpanan && (
            <p className="mt-3 text-xs text-neutral-500">Memuat analitik simpanan berjangka…</p>
          )}
          {errSimpanan && (
            <p className="mt-2 text-xs text-red-600">Error: {errSimpanan}</p>
          )}
        </section>

        {/* USIA × JENIS SIMPANAN */}
        <section>
          <h2 className="mb-3 text-2xl font-semibold">
            1. Klasifikasi Simpanan Berjangka dibanding Usia (per Jenis)
          </h2>

          {!usiaJenis ? (
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              Tidak ada data usia simpanan berjangka.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-[1] bg-amber-400/90 px-3 py-2 text-left">
                        USIA
                      </th>
                      <th className="bg-amber-400/90 px-3 py-2 text-right">
                        JUMLAH
                      </th>
                      <th className="bg-amber-400/90 px-3 py-2 text-right">
                        %
                      </th>
                      {JENIS_LIST.map((j) => (
                        <th
                          key={j}
                          className="bg-amber-400/90 px-3 py-2 text-right"
                        >
                          {j}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usiaRowsSb.map((r) => {
                      const rowBg =
                        r.usia === '36-45 th'
                          ? 'bg-green-100'
                          : r.usia === '46-60 th'
                          ? 'bg-yellow-100'
                          : r.usia === '>60 th'
                          ? 'bg-orange-100'
                          : '';
                      return (
                        <tr
                          key={r.usia}
                          className={`${rowBg} border-b last:border-b-0`}
                        >
                          <td className="sticky left-0 z-[1] bg-white px-3 py-2">
                            {r.usia}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {int(r.total)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {pct(r.percent)}
                          </td>
                          {JENIS_LIST.map((j) => {
                            const v = r.perJenis[j] ?? 0;
                            const isMaxCell =
                              v > 0 && v === maxUsiaPerJenisSb[j];
                            return (
                              <td
                                key={j}
                                className={`px-3 py-2 text-right ${
                                  isMaxCell ? 'bg-green-200 font-medium' : ''
                                }`}
                              >
                                {int(v)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    <tr className="bg-amber-200 font-semibold">
                      <td className="sticky left-0 z-[1] px-3 py-2">
                        TOTAL
                      </td>
                      <td className="px-3 py-2 text-right">
                        {int(usiaJenis.totalAll)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {pct(100)}
                      </td>
                      {JENIS_LIST.map((j) => (
                        <td
                          key={j}
                          className="px-3 py-2 text-right"
                        >
                          {int(usiaJenis.totalsPerJenis[j] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Chart */}
              <div className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-base font-semibold">
                  USIA × JENIS SIMPANAN (Stacked Bar)
                </h3>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={usiaChartSb}
                      margin={{ top: 8, right: 16, left: 0, bottom: 24 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="usia" />
                      <YAxis />
                      <Tooltip
                        formatter={(v: any) =>
                          int(Number(v))
                        }
                      />
                      <Legend />
                      {JENIS_LIST.map((j) => (
                        <Bar
                          key={j}
                          dataKey={j}
                          stackId="usia-jenis"
                          fill={JENIS_COLORS[j] || '#8884d8'}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </section>

        {/* PROFESI × JENIS SIMPANAN */}
        <section>
          <h2 className="mb-3 text-2xl font-semibold">
            2. Klasifikasi Simpanan Berjangka berdasarkan Profesi (per Jenis)
          </h2>

          {!profesiJenis ? (
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              Tidak ada data profesi simpanan berjangka.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-[1] bg-amber-400/90 px-3 py-2 text-left">
                        PROFESI
                      </th>
                      <th className="bg-amber-400/90 px-3 py-2 text-right">
                        JUMLAH
                      </th>
                      <th className="bg-amber-400/90 px-3 py-2 text-right">
                        %
                      </th>
                      {JENIS_LIST.map((j) => (
                        <th
                          key={j}
                          className="bg-amber-400/90 px-3 py-2 text-right"
                        >
                          {j}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profesiRowsSb.map((r) => (
                      <tr
                        key={r.profesi}
                        className="border-b last:border-b-0"
                      >
                        <td className="sticky left-0 z-[1] bg-white px-3 py-2">
                          {r.profesi || 'Kosong'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {int(r.total)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {pct(r.persen)}
                        </td>
                        {JENIS_LIST.map((j) => {
                          const v = r.perJenis[j] ?? 0;
                          const isMaxCell =
                            v > 0 &&
                            v === maxProfesiPerJenisSb[j];
                          return (
                            <td
                              key={j}
                              className={`px-3 py-2 text-right ${
                                isMaxCell ? 'bg-green-200 font-medium' : ''
                              }`}
                            >
                              {int(v)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="bg-amber-200 font-semibold">
                      <td className="sticky left-0 z-[1] px-3 py-2">
                        JUMLAH
                      </td>
                      <td className="px-3 py-2 text-right">
                        {int(profesiJenis.totalAll)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {pct(100)}
                      </td>
                      {JENIS_LIST.map((j) => (
                        <td
                          key={j}
                          className="px-3 py-2 text-right"
                        >
                          {int(profesiJenis.totalsPerJenis[j] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-base font-semibold">
                  PROFESI × JENIS SIMPANAN (Stacked Bar)
                </h3>
                <div className="h-96 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={profesiChartSb}
                      margin={{
                        top: 8,
                        right: 16,
                        left: 0,
                        bottom: 80,
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="profesi"
                        interval={0}
                        angle={-30}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis />
                      <Tooltip
                        formatter={(v: any) =>
                          int(Number(v))
                        }
                      />
                      <Legend />
                      {JENIS_LIST.map((j) => (
                        <Bar
                          key={j}
                          dataKey={j}
                          stackId="prof-jenis"
                          fill={JENIS_COLORS[j] || '#8884d8'}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </section>

        {/* USIA × TP SIMPANAN */}
        <section>
          <h2 className="mb-3 text-2xl font-semibold">
            3. Klasifikasi Simpanan Berjangka dibanding Usia (per TP)
          </h2>
          {!usiaTPSb ? (
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              Tidak ada data usia per TP untuk simpanan berjangka (cek filter TP).
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-[1] bg-sky-100 px-3 py-2 text-left">
                      USIA
                    </th>
                    <th className="bg-sky-100 px-3 py-2 text-right">
                      JUMLAH
                    </th>
                    <th className="bg-sky-100 px-3 py-2 text-right">
                      %
                    </th>
                    {usiaTPSb.tps.map((tp) => (
                      <th
                        key={tp}
                        className="bg-sky-100 px-3 py-2 text-right"
                      >
                        {tp}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usiaTPRowsSb.map((r) => {
                    const isTotal = r.usia === 'TOTAL';
                    const rowBg = isTotal ? 'bg-amber-100' : '';
                    return (
                      <tr
                        key={r.usia}
                        className={`${rowBg} border-b last:border-b-0`}
                      >
                        <td className="sticky left-0 z-[1] bg-white px-3 py-2">
                          {r.usia}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {int(r.total)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {pct(r.persen)}
                        </td>
                        {usiaTPSb.tps.map((tp) => {
                          const v = r.perTP[tp] ?? 0;
                          const isMaxCell =
                            !isTotal &&
                            v > 0 &&
                            v === maxUsiaPerTPSb[tp];
                          return (
                            <td
                              key={tp}
                              className={`px-3 py-2 text-right ${
                                isMaxCell ? 'bg-green-200 font-medium' : ''
                              }`}
                            >
                              {int(v)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr className="bg-amber-200 font-semibold">
                    <td className="sticky left-0 z-[1] px-3 py-2">
                      JUMLAH
                    </td>
                    <td className="px-3 py-2 text-right">
                      {int(usiaTPSb.totalAll)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {pct(100)}
                    </td>
                    {usiaTPSb.tps.map((tp) => (
                      <td
                        key={tp}
                        className="px-3 py-2 text-right"
                      >
                        {int(usiaTPSb.totalsPerTP[tp] ?? 0)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* PROFESI × TP SIMPANAN */}
        <section>
          <h2 className="mb-3 text-2xl font-semibold">
            4. Klasifikasi Profesi Pemilik Simpanan Berjangka (per TP)
          </h2>

          {!profesiTPSb ? (
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              Tidak ada data profesi per TP untuk simpanan berjangka (cek filter TP).
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="bg-sky-100 border px-3 py-2 text-left">
                      PROFESI
                    </th>
                    <th className="bg-sky-100 border px-3 py-2 text-right">
                      GAB
                    </th>
                    {profesiTPSb.tps.map((tp) => (
                      <th
                        key={tp}
                        className="bg-sky-100 border px-3 py-2 text-right"
                      >
                        {tp}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {profesiTPRowsSb.map((r) => (
                    <tr key={r.profesi}>
                      <td className="border px-3 py-2">
                        {r.profesi || 'Kosong'}
                      </td>
                      <td className="border px-3 py-2 text-right font-medium">
                        {int(r.total)}
                      </td>
                      {profesiTPSb.tps.map((tp) => {
                        const v = r.perTP[tp] ?? 0;
                        const isMaxCell =
                          v > 0 && v === maxProfesiPerTPSb[tp];
                        return (
                          <td
                            key={tp}
                            className={`border px-3 py-2 text-right ${
                              isMaxCell ? 'bg-green-200 font-medium' : ''
                            }`}
                          >
                            {int(v)}
                          </td>
                        );
                      })}
                  </tr>
                  ))}
                  <tr className="bg-amber-100 font-semibold">
                    <td className="border px-3 py-2">JUMLAH</td>
                    <td className="border px-3 py-2 text-right">
                      {int(profesiTPSb.totalAll)}
                    </td>
                    {profesiTPSb.tps.map((tp) => (
                      <td
                        key={tp}
                        className="border px-3 py-2 text-right"
                      >
                        {int(profesiTPSb.totalsPerTP[tp] ?? 0)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ===================== EXPORT ===================== */}
        <div>
          <button
            onClick={async () => {
              const r = await fetch('/api/data-anggota/analytics/export', { credentials: 'include' });
              if (!r.ok) return;
              const b = await r.blob();
              const url = URL.createObjectURL(b);
              const a = document.createElement('a');
              a.href = url; a.download = `ANALISA_${new Date().toISOString().slice(0,10)}.xlsx`;
              document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
            }}
            className="rounded-2xl bg-amber-500 px-4 py-2 text-white shadow hover:bg-amber-600"
          >
            Download Excel
          </button>
        </div>
      </div>
    </div>
  );
}
