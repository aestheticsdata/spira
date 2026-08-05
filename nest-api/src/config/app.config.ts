import { registerAs } from "@nestjs/config";

export interface AppConfig {
  port: number;
  frontendUrl: string;
}

export default registerAs("app", (): AppConfig => ({
  port: parseInt(process.env.PORT!, 10),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3004",
}));
