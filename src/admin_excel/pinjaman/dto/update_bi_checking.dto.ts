import { Prop } from "@nestjs/mongoose";
import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";


export class UpdateBICheckingDTO {

    @ApiProperty()
    @Prop()
    @IsString()
    @IsOptional()
    userid?: string

    @ApiProperty()
    @Prop()
    @IsString()
    @IsOptional()
    email?: string

    @ApiProperty()
    @Prop()
    @IsString()
    @IsOptional()
    name?: string

    @ApiProperty()
    @Prop()
    @IsString()
    @IsOptional()
    phone_number?: string

    @ApiProperty()
    @Prop()
    @IsString()
    @IsOptional()
    ktp?: string

    @ApiProperty()
    @Prop()
    @IsString()
    @IsOptional()
    npwp?: string

    @ApiProperty()
    @Prop()
    @IsString()
    @IsOptional()
    salary?: string

    @ApiProperty()
    @Prop()
    @IsString()
    @IsOptional()
    location?: string

    @ApiProperty()
    @Prop()
    @IsString()
    @IsOptional()
    house_list_id?: string

    @ApiProperty()
    @Prop()
    @IsString()
    @IsOptional()
    agent_name?: string

    @ApiProperty()
    @Prop()
    @IsString()
    @IsOptional()
    agent_phone?: string

}

export class UpdateStatusBICheckingDTO {

    @ApiProperty()
    @Prop()
    @IsString()
    @IsOptional()
    status?: string

    @ApiProperty()
    @Prop()
    @IsString()
    @IsOptional()
    score?: string

}