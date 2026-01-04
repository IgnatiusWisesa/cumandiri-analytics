// src/admin_excel/simpanan/schema/simpanan.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { JenisSimpanan } from './simpanan.types';

export type SimpananBerjangkaDocument = SimpananBerjangka & Document;

@Schema({
  collection: 'simpanan_berjangka',
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
})
export class SimpananBerjangka {
  // === Identitas dasar ===
  @Prop({
    required: true,
    enum: ['SJTA', 'SSKA', 'SMP', 'SPJ'],
    index: true,                       // index by jenis
  })
  jenis!: JenisSimpanan; // SJTA / SSKA / SMP / SPJ

  @Prop({ required: true, trim: true })
  tp!: string; // PBL / KRK / JBR / ...

  @Prop({ required: true, trim: true, index: true })
  noRek!: string; // "SJTA.2410", dst.

  @Prop({ trim: true })
  noAnggota?: string; // "14053.001.1000.037"

  @Prop({ trim: true })
  kodeAnggota?: string; // "A8", "A205", dst. (kolom Anggota)

  // === Parameter simpanan ===
  @Prop({ type: Date, required: true })
  tglBuka!: Date; // tanggal pembukaan rekening

  @Prop({ type: Number, required: true, min: 1 })
  jangkaWaktuBulan!: number; // 1 / 12 / 60 / dst.

  @Prop({ type: Number, default: 0 })
  saldoMinimum!: number; // rupiah, integer

  @Prop({ type: Number, required: true })
  bungaPersen!: number; // 5.5 => 5.5%

  @Prop({ type: Date })
  transaksiTerakhir?: Date;

  @Prop({ type: Boolean, default: false })
  perpanjangOtomatis!: boolean;

  // === Snapshot saldo per tanggal laporan ===
  @Prop({ type: Date, required: true, index: true })
  tanggalLaporan!: Date; // mis. 2025-09-30

  @Prop({ type: Number, required: true })
  saldo!: number; // saldo per tanggal laporan (Rp)

  // Metadata impor
  @Prop()
  sumberFile?: string; // nama file Excel / batch id

  // timestamps (diisi otomatis oleh Mongoose)
  @Prop()
  created_at?: Date;

  @Prop()
  updated_at?: Date;
}

export const SimpananBerjangkaSchema =
  SchemaFactory.createForClass(SimpananBerjangka);

// Unique per rekening per tanggal laporan per jenis
SimpananBerjangkaSchema.index(
  { jenis: 1, noRek: 1, tanggalLaporan: 1 },
  { unique: true },
);

/**
 * Index tambahan untuk endpoint analytics:
 * - filter by TP + tahunBuka (tglBuka)
 * - join ke anggota lewat noAnggota/kodeAnggota
 */
SimpananBerjangkaSchema.index({ tp: 1, tglBuka: 1 });
SimpananBerjangkaSchema.index({ tp: 1, tanggalLaporan: 1 });
SimpananBerjangkaSchema.index({ noAnggota: 1 });
SimpananBerjangkaSchema.index({ kodeAnggota: 1 });
