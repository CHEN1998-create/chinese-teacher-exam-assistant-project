import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { TrialService } from './trial.service.js';
import { UserGuard } from '../opportunities/user.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import type { AuthenticatedRequest } from '../auth/identity.js';

/**
 * 受邀试用指标 API（v7.0 模块 7）。
 *
 * - POST /trial/events：登录用户事件摄取（invited=会话 cookie，demo=x-user-* 头）；
 *   身份取服务端，客户端不能代他人上报；
 * - GET /trial/dashboard：后台看板，仅 STAFF_ROLES（AdminGuard）；
 * - POST /trial/seed：灌演示种子，仅 STAFF_ROLES。
 */
@Controller('trial')
export class TrialController {
  constructor(private readonly service: TrialService) {}

  @Post('events')
  @UseGuards(UserGuard)
  ingest(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.ingest(req.user!.id, req.user!.role, body);
  }

  @Get('dashboard')
  @UseGuards(AdminGuard)
  dashboard() {
    return this.service.dashboard();
  }

  @Post('seed')
  @UseGuards(AdminGuard)
  seed() {
    return this.service.seedDemo();
  }
}
