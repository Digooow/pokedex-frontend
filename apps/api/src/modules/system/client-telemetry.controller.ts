import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type ClientErrorReport,
  ClientErrorReportSchema,
  type ClientRumBatch,
  ClientRumBatchSchema,
  type TelemetryIngestAck,
} from '@pokeverse/shared';
import { Public } from '../../common/decorators/public.decorator';
import type { RequestWithTrace } from '../../common/middleware/correlation.middleware';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TelemetryIngestionService } from './telemetry-ingestion.service';

@Public()
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('telemetry')
export class ClientTelemetryController {
  constructor(private readonly ingestion: TelemetryIngestionService) {}

  @Post('rum')
  @HttpCode(HttpStatus.ACCEPTED)
  ingestRum(
    @Body(new ZodValidationPipe(ClientRumBatchSchema)) body: ClientRumBatch,
    @Req() req: RequestWithTrace,
  ): TelemetryIngestAck {
    return this.ingestion.ingestRumBatch(body, req.correlationId ?? null);
  }

  @Post('errors')
  @HttpCode(HttpStatus.ACCEPTED)
  ingestClientError(
    @Body(new ZodValidationPipe(ClientErrorReportSchema))
    body: ClientErrorReport,
    @Req() req: RequestWithTrace,
  ): TelemetryIngestAck {
    return this.ingestion.ingestClientError(
      body,
      req.correlationId ?? null,
      req.traceId ?? null,
    );
  }
}
