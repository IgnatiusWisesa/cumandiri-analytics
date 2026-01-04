import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'kredit' })
export class Kredit {
    _id?: string;

    // Relasi ke anggota
    @Prop({ trim: true, index: true })
    noAgt?: string; // "No Anggota" / "NBA"

    @Prop({ type: Types.ObjectId, ref: 'DataAnggota', index: true })
    anggotaId?: Types.ObjectId;

    // Identitas kredit
    @Prop({ trim: true, index: true, unique: true })
    noRek: string; // "No Rek" - unique identifier

    // Tanggal
    @Prop() tglPinjam?: Date; // "Tgl. Pinjam"

    // Nilai & angsuran
    @Prop({ type: Number }) angsuranTetap?: number; // "Angsuran Tetap"
    @Prop({ type: Number }) nilaiPinjaman?: number; // "Nilai Pinjaman"
    @Prop({ type: Number }) sukuBungaPct?: number; // "Suku Bunga (%)"
    @Prop({ type: Number }) saldoPinjaman?: number; // "Saldo Pinjaman"

    // Status kredit (LANCAR/MACET/dll)
    @Prop({ trim: true }) statusKredit?: string; // "Kategori" di Excel (LANCAR/MACET/dll)

    // Tujuan & kategori pinjaman (sama seperti pinjaman)
    @Prop({ trim: true }) tujuan?: string; // "Tujuan"
    @Prop({ trim: true }) kategori?: string; // "KATEGORI PINJAM" (PRODUKTIF/KONSUMTIF/etc)
    @Prop({ trim: true }) keterangan?: string; // Keterangan detail
    @Prop({ trim: true }) ugl?: string; // "UGL"

    // Metadata lain
    @Prop({ trim: true }) sep25?: string; // "Sep-25" (jika ada data spesifik bulan)
}

export type KreditDocument = Kredit & Document;
export const KreditSchema = SchemaFactory.createForClass(Kredit);
