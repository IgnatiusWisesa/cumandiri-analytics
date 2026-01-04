import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'data_anggota' })
export class DataAnggota {
  _id?: string;

  @Prop({ required: true, index: true, unique: true })
  noAgt: string; // "14503.001.1000.004" dll

  @Prop({ required: true, trim: true })
  nama: string;

  @Prop({ trim: true })
  tp?: string; // PBL / dst

  @Prop({ enum: ['L', 'P'], trim: true })
  jk?: 'L' | 'P';

  @Prop()
  tglLahir?: Date;

  @Prop()
  usia?: number;

  @Prop({ trim: true })
  pekerjaan?: string;

  @Prop({ trim: true })
  profesi?: string;

  @Prop({ trim: true })
  bidangUsaha?: string;

  @Prop({ trim: true })
  namaInstansi?: string;

  @Prop({ type: Number, index: true })
  tahunGabung?: number;

  @Prop() tglMasuk?: Date;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export type DataAnggotaDocument = DataAnggota & Document;
export const DataAnggotaSchema = SchemaFactory.createForClass(DataAnggota);
