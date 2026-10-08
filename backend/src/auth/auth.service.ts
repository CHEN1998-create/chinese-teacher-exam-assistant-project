import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

/** 运行模式：demo 信任 x-user-id 头；invited 走服务端会话 cookie */
export type AuthMode = 'demo' | 'invited';

export function getAuthMode(): AuthMode {
  return process.env.AUTH_MODE === 'invited' ? 'invited' : 'demo';
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * 受邀用户认证服务（模块 8）。
 *
 * 安全约束：
 * - 密码只保存 bcrypt 哈希，绝不落明文；
 * - 会话 token 只以 HttpOnly Cookie 下发，库内只存 SHA-256 哈希；
 * - 任何日志都不输出密码或 token（含哈希值）。
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  }

  /**
   * 校验邮箱+密码，成功返回用户；失败返回 null。
   * 不区分“用户不存在”与“密码错误”，避免账号枚举。
   */
  async validateCredentials(
    email: string,
    password: string,
  ): Promise<{ id: string; email: string; name: string | null; role: string } | null> {
    // 按邮箱定位用户（User.id 是 uuid，凭证外键不是邮箱；邮箱唯一约束在 users 表）
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { credential: true },
    });
    // 用户不存在或未设置凭证也走一次哈希比较，保持耗时一致（弱防御时序攻击）
    if (!user?.credential) {
      await bcrypt.compare(password, '$2a$10$invalidhashinvalidhashinvalidhashinval').catch(() => undefined);
      return null;
    }
    const ok = await bcrypt.compare(password, user.credential.passwordHash);
    if (!ok) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  /** 签发会话：返回原始 token（仅用于写 cookie）与过期时间 */
  async createSession(
    userId: string,
    userAgent?: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(token),
        expiresAt,
        userAgent: userAgent?.slice(0, 255) ?? null,
      },
    });
    return { token, expiresAt };
  }

  /** 用原始 token 查会话（内部先哈希再查），返回附带用户的活跃会话或 null */
  async getSessionByToken(
    token: string,
  ): Promise<{ userId: string; role: string; email: string; name: string | null } | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      return null;
    }
    return {
      userId: session.userId,
      role: session.user.role,
      email: session.user.email,
      name: session.user.name,
    };
  }

  async revokeSession(token: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** 管理员创建受邀账号（鉴权在 controller 层完成） */
  async createUser(input: {
    email: string;
    name?: string;
    role: string;
    password: string;
  }): Promise<{ id: string; email: string; name: string | null; role: string }> {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await this.hashPassword(input.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name?.trim() || null,
        role: input.role,
        credential: { create: { passwordHash } },
      },
    });
    this.logger.log(`created user ${user.id} role=${user.role}`);
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  async deleteUser(userId: string): Promise<void> {
    // User 级联删除 Credential/Session/UserProfile；Follows/Plans 无外键，需显式清理
    await this.prisma.$transaction([
      this.prisma.followedOpportunity.deleteMany({ where: { userId } }),
      this.prisma.opportunityCorrection.deleteMany({ where: { userId } }),
      this.prisma.timelineEvent.deleteMany({ where: { userId } }),
      this.prisma.notificationRecord.deleteMany({ where: { userId } }),
      this.prisma.dailyPlan.deleteMany({ where: { userId } }),
      this.prisma.taskFeedback.deleteMany({ where: { userId } }),
      this.prisma.weeklyPlan.deleteMany({ where: { userId } }),
      this.prisma.userProfile.deleteMany({ where: { userId } }),
      this.prisma.session.deleteMany({ where: { userId } }),
      this.prisma.credential.deleteMany({ where: { userId } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);
    this.logger.log(`deleted user ${userId}`);
  }
}
