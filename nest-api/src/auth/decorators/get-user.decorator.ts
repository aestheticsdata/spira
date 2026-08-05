import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { SessionUser } from "@auth/guards/session-auth.guard";

export const GetUserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<{ user: SessionUser }>();
  return request.user.id;
});
