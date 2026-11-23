import { Global, Module } from '@nestjs/common';
import { CryptoService } from '../common/security/crypto.service';
import { AuditTrailService } from '../common/telemetry/audit-trail.service';
import { StructuredLoggerService } from '../common/telemetry/structured-logger.service';
import { InfraProbesService } from './infra-probes.service';
import { KafkaService } from './kafka.service';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    StructuredLoggerService,
    AuditTrailService,
    CryptoService,
    PrismaService,
    RedisService,
    KafkaService,
    InfraProbesService,
  ],
  exports: [
    StructuredLoggerService,
    AuditTrailService,
    CryptoService,
    PrismaService,
    RedisService,
    KafkaService,
    InfraProbesService,
  ],
})
export class InfraModule {}
