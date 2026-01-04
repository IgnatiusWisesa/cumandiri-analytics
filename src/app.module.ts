import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import * as dotenv from 'dotenv';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import { DataAnggotaModule } from './admin_excel/anggota/data-anggota.module';
import { PinjamanModule } from './admin_excel/pinjaman/pinjaman.module';
import { SimpananModule } from './admin_excel/simpanan/simpanan.module';
import { KreditModule } from './admin_excel/kredit/kredit.module';

dotenv.config();

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGO_CONNECTION_STRING),
    CacheModule.register({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DataAnggotaModule,
    PinjamanModule,
    SimpananModule,
    KreditModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
