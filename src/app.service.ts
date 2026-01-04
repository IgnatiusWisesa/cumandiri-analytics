import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): any {
    return { statusCode:200, responseMessage : 'Api is up and running!'};
  }

}
