import {
  Body,
  Controller,
  Get,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PlansService } from './plans.service.js';
import { UserGuard } from '../opportunities/user.guard.js';
import type { AuthenticatedRequest } from '../auth/identity.js';

/**
 * 学习计划服务端接口（模块 8）。
 * - GET /plans?examTargetId=  读取当前用户在该目标下的全部计划快照；
 * - PUT /plans/sync           全量替换该目标下的周计划/日计划/反馈。
 * 全部按会话用户隔离，无法读取或覆盖他人计划。
 */
@Controller('plans')
@UseGuards(UserGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  async get(
    @Req() req: AuthenticatedRequest,
    @Query('examTargetId') examTargetId: string,
  ) {
    if (!examTargetId) return { error: '缺少 examTargetId' };
    return this.plansService.getSnapshot(req.user!.id, examTargetId);
  }

  @Put('sync')
  async sync(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      examTargetId?: unknown;
      weeklyPlans?: unknown;
      dailyPlans?: unknown;
      feedbacks?: unknown;
    },
  ) {
    const examTargetId =
      typeof body.examTargetId === 'string' ? body.examTargetId : '';
    if (!examTargetId) return { error: '缺少 examTargetId' };
    const weeklyPlans = Array.isArray(body.weeklyPlans)
      ? (body.weeklyPlans as Array<Record<string, unknown>>)
      : [];
    const dailyPlans = Array.isArray(body.dailyPlans)
      ? (body.dailyPlans as Array<Record<string, unknown>>)
      : [];
    const feedbacks = Array.isArray(body.feedbacks)
      ? (body.feedbacks as Array<Record<string, unknown>>)
      : [];
    await this.plansService.syncSnapshot(req.user!.id, examTargetId, {
      weeklyPlans,
      dailyPlans,
      feedbacks,
    });
    return { ok: true };
  }
}
