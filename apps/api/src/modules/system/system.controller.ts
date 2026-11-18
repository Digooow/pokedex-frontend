import { Controller, Get } from '@nestjs/common';
import {
  PLATFORM_MODULES,
  SystemBootstrapSchema,
  type SystemBootstrap,
} from '@pokeverse/shared';

@Controller('system')
export class SystemController {
  @Get('bootstrap')
  getBootstrap(): SystemBootstrap {
    return SystemBootstrapSchema.parse({
      service: 'pokeverse-api',
      phase: 'phase-1',
      timestamp: new Date().toISOString(),
      modules: [...PLATFORM_MODULES],
    });
  }
}
