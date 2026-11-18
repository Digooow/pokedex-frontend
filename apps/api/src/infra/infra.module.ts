import { Global, Module } from '@nestjs/common';
import { StructuredLoggerService } from '../common/telemetry/structured-logger.service';
import { InfraProbesService } from './infra-probes.service';
import { KafkaService } from './kafka.service';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    StructuredLoggerService,
    PrismaService,
    RedisService,
    KafkaService,
    InfraProbesService,
  ],
  exports: [
    StructuredLoggerService,
    PrismaService,
    RedisService,
    KafkaService,
    InfraProbesService,
  ],
})
export class InfraModule {}
