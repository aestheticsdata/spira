import { Module } from "@nestjs/common";
import { TokensController } from "@tokens/tokens.controller";
import { TokensService } from "@tokens/tokens.service";

@Module({
  controllers: [TokensController],
  providers: [TokensService],
})
export class TokensModule {}
