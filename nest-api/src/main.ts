import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ValidationPipe } from "@nestjs/common";
import { json, urlencoded, Request, Response, NextFunction } from "express";
import session from "express-session";
import { RedisStore } from "connect-redis";
import { AppModule } from "./app.module";
import { AppConfig } from "@config/app.config";
import { formatRouteLog } from "@infrastructure/logger";
import { RedisService, SESSION_PREFIX } from "@redis/redis.service";

import type { Application } from "express";

/**
 * Rolling TTL: refreshed on every authenticated request, so a session used at
 * least once within this window never expires in practice (COS-456). 400 days
 * is the practical ceiling — modern browsers cap any cookie's Expires/Max-Age
 * there, regardless of httpOnly.
 */
const SESSION_TTL_SECONDS = 400 * 24 * 60 * 60;

/**
 * The Linear CSV arrives as text in a JSON body (COS-455), and a real export is
 * far past the 100kb express defaults to. Raised for that one path rather than
 * globally: every other endpoint takes a small object, and a megabyte ceiling
 * on all of them is free surface for nothing.
 */
const IMPORT_BODY_LIMIT = "24mb";
const DEFAULT_BODY_LIMIT = "1mb";

async function bootstrap() {
  // Nest's own parsers are declined so the two below can be registered in this
  // order; `body-parser` marks a request it has read, so the general pair that
  // follows leaves an already-parsed import body alone.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  (app.getHttpAdapter().getInstance() as Application).set("trust proxy", 1);

  app.use("/api/migration", json({ limit: IMPORT_BODY_LIMIT }));
  app.use(json({ limit: DEFAULT_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: DEFAULT_BODY_LIMIT }));

  const redisService = app.get<RedisService>(RedisService);
  const redisStore = new RedisStore({
    client: redisService.getClient(),
    prefix: SESSION_PREFIX,
    ttl: SESSION_TTL_SECONDS,
  });

  // Behind a plain-HTTP proxy, set COOKIE_SECURE=false in the environment.
  const cookieSecure = process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production";

  app.use(
    session({
      name: "spira.sid",
      store: redisStore,
      secret: process.env.SESSION_SECRET as string,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      proxy: true, // required for a Secure cookie behind a reverse proxy
      cookie: {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: "lax",
        maxAge: SESSION_TTL_SECONDS * 1000,
      },
    }),
  );

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const configService = app.get(ConfigService);
  const appConfig = configService.getOrThrow<AppConfig>("app");

  app.enableCors({
    origin: appConfig.frontendUrl,
    credentials: true,
  });

  app.setGlobalPrefix("api");

  app.use("/api", (req: Request, _res: Response, next: NextFunction) => {
    const url = req.originalUrl ?? req.url ?? req.path ?? "";
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? req.socket?.remoteAddress ?? "?";
    const userAgent = (req.headers["user-agent"] ?? "unknown").slice(0, 60);
    console.log(formatRouteLog(req.method, url, "Nest", { ip, userAgent }));
    next();
  });

  await app.listen(appConfig.port);
}

void bootstrap();
