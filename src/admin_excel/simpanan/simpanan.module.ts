import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SimpananBerjangka,
  SimpananBerjangkaSchema,
} from './schema/simpanan.schema';
import { SimpananService } from './simpanan.service';
import { SimpananController } from './simpanan.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SimpananBerjangka.name, schema: SimpananBerjangkaSchema },
    ]),
  ],
  controllers: [SimpananController],
  providers: [SimpananService],
  exports: [SimpananService],
})
export class SimpananModule {}
