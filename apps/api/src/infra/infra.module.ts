import { Global, Module } from '@nestjs/common';
import { CryptoService } from '../common/security/crypto.service';
import { AuditTrailService } from '../common/telemetry/audit-trail.service';
import { OpenTelemetryService } from '../common/telemetry/opentelemetry.service';
import { StructuredLoggerService } from '../common/telemetry/structured-logger.service';
import { TELEMETRY_METRICS_PORT } from '../common/telemetry/telemetry.port';
import { InfraProbesService } from './infra-probes.service';
import { KafkaService } from './kafka.service';
import { OBJECT_STORAGE_PORT } from './object-storage.port';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { S3ObjectStorageAdapter } from './s3-object-storage.adapter';

@Global()
@Module({
  providers: [
    StructuredLoggerService,
    OpenTelemetryService,
    { provide: TELEMETRY_METRICS_PORT, useExisting: OpenTelemetryService },
    AuditTrailService,
    CryptoService,
    PrismaService,
    RedisService,
    KafkaService,
    S3ObjectStorageAdapter,
    { provide: OBJECT_STORAGE_PORT, useExisting: S3ObjectStorageAdapter },
    InfraProbesService,
  ],
  exports: [
    StructuredLoggerService,
    OpenTelemetryService,
    TELEMETRY_METRICS_PORT,
    AuditTrailService,
    CryptoService,
    PrismaService,
    RedisService,
    KafkaService,
    S3ObjectStorageAdapter,
    OBJECT_STORAGE_PORT,
    InfraProbesService,
  ],
})
export class InfraModule {}
