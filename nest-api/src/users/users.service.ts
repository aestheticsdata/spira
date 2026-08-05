import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { compare, hash } from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";

const BCRYPT_ROUNDS = 12;

export interface AuthenticatedUser {
  id: string;
  username: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async signIn(username: string, password: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { username } });

    // Compare against a dummy hash when the account is unknown so the response
    // time does not distinguish "no such user" from "wrong password".
    const hashToCheck = user?.passwordHash ?? `$2a$${BCRYPT_ROUNDS}$${"0".repeat(53)}`;
    const valid = await compare(password, hashToCheck);

    if (!user || !valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.toAuthenticatedUser(user);
  }

  async findById(id: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new UnauthorizedException("Session required");
    }
    return this.toAuthenticatedUser(user);
  }

  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new UnauthorizedException("Session required");
    }

    const valid = await compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException("Current password is incorrect");
    }

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await hash(newPassword, BCRYPT_ROUNDS) },
    });
  }

  private toAuthenticatedUser(user: { id: string; username: string }): AuthenticatedUser {
    return { id: user.id, username: user.username };
  }
}
