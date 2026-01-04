import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { useContainer } from 'class-validator';
import * as dotenv from 'dotenv';
import * as requestIp from 'request-ip';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // console.log()
  // Registering the request-ip middleware to capture client IP address
  app.use(requestIp.mw());

  // Enable CORS with credentials
  app.enableCors({
    origin: ['http://localhost:3001', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Set global pipes for validation
  app.useGlobalPipes(new ValidationPipe());

  // Set container for class-validator
  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  const config = new DocumentBuilder()
    .setTitle('CU Mandiri Admin Excel API')
    .setDescription('API untuk upload & kelola Data Anggota')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  app.use((req, _res, next) => {
    console.log('[REQ]', req.method, req.url);
    next();
  });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();