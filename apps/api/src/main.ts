import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApiApp } from './app.setup';
import { StructuredLoggerService } from './common/telemetry/structured-logger.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(StructuredLoggerService);
  app.useLogger(logger);

  const { port } = configureApiApp(app);
  await app.listen(port, '0.0.0.0');
  logger.emitEvent(
    'info',
    `pokeverse-api listening on http://127.0.0.1:${port}`,
    {
      context: 'Bootstrap',
    },
  );
}

void bootstrap();
