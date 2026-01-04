import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KreditController } from './kredit.controller';
import { KreditService } from './kredit.service';
import { Kredit, KreditSchema } from './schema/kredit.schema';

@Module({
    imports: [MongooseModule.forFeature([{ name: Kredit.name, schema: KreditSchema }])],
    controllers: [KreditController],
    providers: [KreditService],
    exports: [KreditService],
})
export class KreditModule { }
