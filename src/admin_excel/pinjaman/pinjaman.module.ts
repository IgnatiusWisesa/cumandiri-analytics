import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Pinjaman, PinjamanSchema } from './schema/pinjaman.schema';
import { PinjamanService } from './pinjaman.service';
import { PinjamanController } from './pinjaman.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Pinjaman.name, schema: PinjamanSchema }]),
  ],
  controllers: [PinjamanController],
  providers: [PinjamanService],
  exports: [PinjamanService],
})
export class PinjamanModule {}