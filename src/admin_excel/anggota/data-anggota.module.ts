import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DataAnggotaController } from './data-anggota.controller';
import { DataAnggotaService } from './data-anggota.service';
import { DataAnggota, DataAnggotaSchema } from './schema/data-anggota.schema';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
    MongooseModule.forFeature([{ name: DataAnggota.name, schema: DataAnggotaSchema }]),
  ],
  controllers: [DataAnggotaController],
  providers: [DataAnggotaService],
  exports: [DataAnggotaService],
})
export class DataAnggotaModule {}
