import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { SessionAuthGuard } from './session.guard.js';
import { PrismaService } from '../prisma.service.js';
import type { AuthenticatedRequest } from './identity.js';

const COOKIE_NAME = 'sid';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cookieOptions(req: AuthenticatedRequest) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // secure 仅在真实 HTTPS 请求下开启（由 trust proxy 解析 X-Forwarded-Proto 得到 req.secure）。
    // 不再按 TRUST_PROXY/NODE_ENV 静态判断——否则 HTTP 演示环境登录会因 secure cookie 失效。
    // HTTPS 生产（Caddy 终止 TLS）时 Caddy 会置 X-Forwarded-Proto: https，req.secure 自动为 true。
    secure: req.secure,
    path: '/',
    maxAge: COOKIE_MAX_AGE_MS,
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  async login(
    @Body() body: { email?: unknown; password?: unknown },
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) {
      throw new UnauthorizedException('邮箱和密码不能为空');
    }
    const user = await this.authService.validateCredentials(email, password);
    if (!user) {
      throw new UnauthorizedException('邮箱或密码不正确');
    }
    const { token } = await this.authService.createSession(
      user.id,
      req.headers['user-agent'] as string | undefined,
    );
    res.cookie(COOKIE_NAME, token, cookieOptions(req));
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  @Get('session')
  @UseGuards(SessionAuthGuard)
  session(@Req() req: AuthenticatedRequest) {
    if (!req.user) throw new UnauthorizedException('未登录');
    return {
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
      },
    };
  }

  @Post('logout')
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (token) {
      await this.authService.revokeSession(token);
    }
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  }

  /** 注销账号：删除用户及其全部级联数据（凭证、会话、画像、关注、计划、通知） */
  @Delete('account')
  @UseGuards(SessionAuthGuard)
  async deregister(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!req.user) throw new UnauthorizedException('未登录');
    await this.authService.deleteUser(req.user.id);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  }

  /**
   * 删除测试数据但保留账号：清空画像、关注、计划、反馈、通知、日程、纠错，
   * 便于受邀测试用户重置环境而无需重新建号。
   */
  @Delete('test-data')
  @UseGuards(SessionAuthGuard)
  async deleteTestData(@Req() req: AuthenticatedRequest) {
    if (!req.user) throw new UnauthorizedException('未登录');
    const userId = req.user.id;
    await this.prisma.$transaction([
      this.prisma.userProfile.deleteMany({ where: { userId } }),
      this.prisma.followedOpportunity.deleteMany({ where: { userId } }),
      this.prisma.opportunityCorrection.deleteMany({ where: { userId } }),
      this.prisma.timelineEvent.deleteMany({ where: { userId } }),
      this.prisma.notificationRecord.deleteMany({ where: { userId } }),
      this.prisma.taskFeedback.deleteMany({ where: { userId } }),
      this.prisma.dailyPlan.deleteMany({ where: { userId } }),
      this.prisma.weeklyPlan.deleteMany({ where: { userId } }),
    ]);
    return { ok: true };
  }
}
