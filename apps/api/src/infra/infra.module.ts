import { Global, Module } from '@nestjs/common';
import { InfraProbesService } from './infra-probes.service';

@Global()
@Module({
  providers: [InfraProbesService],
  exports: [InfraProbesService],
})
export class InfraModule {}
