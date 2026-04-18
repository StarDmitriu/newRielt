import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as express from 'express';
import * as path from 'path';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // удаляет лишние поля
      forbidNonWhitelisted: true, // если пришли лишние поля — 400
      transform: true, // приводит типы (boolean и т.п.)
    }),
  );

  // Local replacement for Supabase Storage public files.
  app.use(
    '/media',
    express.static(path.join(process.cwd(), 'storage'), {
      fallthrough: false,
    }),
  );

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
