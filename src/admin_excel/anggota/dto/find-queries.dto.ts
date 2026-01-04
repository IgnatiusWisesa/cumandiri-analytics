import { ApiProperty } from "@nestjs/swagger"
import { IsIn, IsNumber, IsOptional, IsString } from "class-validator"

export class FindQueriesDTO {

    @ApiProperty()
    @IsString()
    @IsOptional()
    userid?: string

    @ApiProperty()
    @IsString()
    @IsOptional()
    email?: string

    @ApiProperty()
    @IsString()
    @IsOptional()
    name?: string

    @ApiProperty()
    @IsString()
    @IsOptional()
    phone_number?: string

    @ApiProperty()
    @IsString()
    @IsOptional()
    ktp?: string

    @ApiProperty()
    @IsString()
    @IsOptional()
    npwp?: string

    @ApiProperty()
    @IsString()
    @IsOptional()
    salary?: string

    @ApiProperty()
    @IsString()
    @IsOptional()
    location?: string

    @ApiProperty()
    @IsString()
    @IsOptional()
    house_list_id?: string

    @ApiProperty()
    @IsString()
    @IsOptional()
    agent_name?: string

    @ApiProperty()
    @IsString()
    @IsOptional()
    agent_phone?: string

    @ApiProperty()
    @IsString()
    @IsOptional()
    status?: string

    @ApiProperty()
    @IsString()
    @IsOptional()
    score?: number

}