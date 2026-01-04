// src/pinjaman/schema/pinjaman.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'pinjaman' })
export class Pinjaman {
  _id?: string;

  // Relasi ke anggota
  @Prop({ trim: true, index: true })        // opsi A: referensi by noAgt (NBA)
  noAgt?: string;                            // contoh: "14053.001.1000.031"

  @Prop({ type: Types.ObjectId, ref: 'DataAnggota', index: true })
  anggotaId?: Types.ObjectId;                // opsi B: relasi by ObjectId

  // Identitas pinjaman
  @Prop({ trim: true, index: true, unique: true })
  noRek: string;                             // "REK PJMN" (akun pinjaman)

  @Prop({ trim: true })
  produk?: string;                           // mis. "Kredit Produktif"

  // Tanggal & tenor
  @Prop() tglPinjam?: Date;                  // "Tgl. Pinjam"
  @Prop() tglAngsurTerakhir?: Date;          // "Tgl. Angsur Terakhir"
  @Prop({ type: Number }) tenorBulan?: number; // "Jangka Waktu" dalam bulan

  // Skema bunga & angsuran
  @Prop({ type: Number }) sukuBungaPct?: number; // 12.5 = 12.5%
  @Prop({ trim: true }) jenisAngsuran?: string;  // mis. "ANUITAS"/"FLAT"
  @Prop({ trim: true }) sppSpk?: string;         // "SPP/SPK"

  // Tujuan & kategori pinjaman
  @Prop({ trim: true }) tujuan?: string;         // "Tujuan"
  @Prop({ trim: true }) kategori?: string;       // "PRODUKTIF"/"KONSUMTIF" (kategori PINJAMAN)

  // Nilai & saldo
  @Prop({ type: Number }) nilaiPinjaman?: number;
  @Prop({ type: Number }) saldoPinjaman?: number;
  @Prop({ type: Number }) saldoHutangBunga?: number;

  // Status pinjaman (LANCAR/MACET/dll)
  @Prop({ trim: true }) statusPinjaman?: string; // "Kategori" di Excel (LANCAR/MACET/dll)

  // Jaminan
  @Prop({ trim: true }) jaminan?: string;
  @Prop({ trim: true }) keteranganJaminan?: string;

  // Metadata lain dari sumber
  @Prop({ trim: true }) nba?: string;           // jika sumber tetap mencantumkan field "NBA"
  @Prop({ trim: true }) cabang?: string;        // simpan hanya jika berbeda konsep dari TP
}

export type PinjamanDocument = Pinjaman & Document;
export const PinjamanSchema = SchemaFactory.createForClass(Pinjaman);
