import { Controller, Get } from '@nestjs/common';
import {
  PLATFORM_MODULES,
  SystemBootstrapSchema,
  type SystemBootstrap,
} from '@pokeverse/shared';
import { Public } from '../../common/decorators/public.decorator';

const DEFAULT_PHASE: SystemBootstrap['phase'] = 'phase-2b';

@Public()
@Controller('system')
export class SystemController {
  @Get('bootstrap')
  getBootstrap(): SystemBootstrap {
    const parsedPhase = SystemBootstrapSchema.shape.phase.safeParse(
      process.env['POKEVERSE_PHASE']?.trim(),
    );

    return SystemBootstrapSchema.parse({
      service: 'pokeverse-api',
      phase: parsedPhase.success ? parsedPhase.data : DEFAULT_PHASE,
      timestamp: new Date().toISOString(),
      modules: [...PLATFORM_MODULES],
    });
  }
}
