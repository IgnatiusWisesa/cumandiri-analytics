import { ApiProperty } from '@nestjs/swagger';

export class UploadExcelDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file: any;
}