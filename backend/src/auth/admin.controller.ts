import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { AuthService } from './auth.service.js';
import { AdminGuard } from './admin.guard.js';
import type { AuthenticatedRequest } from './identity.js';

/**
 * 管理员账号管理（模块 8）。
 * 受邀阶段不开放公开注册，账号只能由管理员通过本接口创建；
 * 权限由 AdminGuard 在服务端强制校验。
 */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('users')
  @UseGuards(AdminGuard)
  async createUser(
    @Body()
    body: {
      email?: unknown;
      name?: unknown;
      role?: unknown;
      password?: unknown;
    },
  ) {
    const email = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || password.length < 6) {
      return { error: '邮箱不能为空，密码至少 6 位' };
    }
    const role =
      typeof body.role === 'string' &&
      ['user', 'exam_reviewer', 'resource_reviewer', 'admin'].includes(body.role)
        ? body.role
        : 'user';
    const existing = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existing) {
      return { error: '该邮箱已存在' };
    }
    const user = await this.authService.createUser({
      email,
      name: typeof body.name === 'string' ? body.name : undefined,
      role,
      password,
    });
    return { user };
  }

  @Get('users')
  @UseGuards(AdminGuard)
  async listUsers() {
    const users = await this.prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return { users };
  }

  /**
   * 首个管理员引导命令的服务端等价接口。
   * 仅当系统中尚无任何管理员时，可用 ADMIN_BOOTSTRAP_TOKEN 创建首个管理员；
   * 一旦存在管理员，本接口永久禁用。
   */
  @Post('bootstrap-admin')
  async bootstrapAdmin(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: { email?: unknown; password?: unknown; token?: unknown },
  ) {
    const hasAdmin = await this.prisma.user.findFirst({
      where: { role: 'admin' },
    });
    if (hasAdmin) return { error: '系统已存在管理员，引导接口已关闭' };
    const expected = process.env.ADMIN_BOOTSTRAP_TOKEN;
    if (!expected || body.token !== expected) {
      return { error: '引导令牌无效' };
    }
    const email = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || password.length < 8) {
      return { error: '邮箱不能为空，管理员密码至少 8 位' };
    }
    const user = await this.authService.createUser({
      email,
      role: 'admin',
      password,
    });
    return { user };
  }
}
