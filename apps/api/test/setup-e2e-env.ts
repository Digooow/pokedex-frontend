process.env['NODE_ENV'] ??= 'test';
process.env['API_PORT'] ??= '3000';
process.env['CORS_ORIGINS'] ??= 'http://localhost:4200,http://127.0.0.1:4200';
process.env['APP_ENCRYPTION_KEY'] ??=
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env['SESSION_TTL_SEC'] ??= '900';
process.env['REFRESH_TTL_DAYS'] ??= '7';
process.env['OTP_TTL_SEC'] ??= '600';
process.env['OTP_MAX_ATTEMPTS'] ??= '3';
process.env['COOKIE_SECURE'] ??= 'false';
process.env['COOKIE_SAMESITE'] ??= 'lax';
process.env['POKEAPI_TIMEOUT_MS'] ??= '8000';
process.env['MAIL_TRANSPORT'] ??= 'smtp';
process.env['SMTP_HOST'] ??= '127.0.0.1';
process.env['SMTP_PORT'] ??= '1025';
process.env['SMTP_SECURE'] ??= 'false';
process.env['DATABASE_URL'] ??= 'postgresql://mock:mock@127.0.0.1:5432/mock';
process.env['DATABASE_URL_UNPOOLED'] ??=
  'postgresql://mock:mock@127.0.0.1:5432/mock';
process.env['REDIS_URL'] ??= 'redis://127.0.0.1:6379';
process.env['KAFKA_BROKERS'] ??= '127.0.0.1:19092';
process.env['S3_ENABLED'] ??= 'false';
// ConfigModule.forRoot valida o env no import do AppModule (antes de qualquer beforeAll),
// então credenciais OAuth simuladas precisam existir aqui para o e2e ser hermético (sem depender do .env local).
process.env['GOOGLE_CLIENT_ID'] ??= 'e2e-google-client';
process.env['GOOGLE_CLIENT_SECRET'] ??= 'e2e-google-secret';
