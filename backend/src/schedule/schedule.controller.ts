import {
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ScheduleService } from './schedule.service.js';
import { UserGuard } from '../opportunities/user.guard.js';

interface AuthenticatedRequest {
  user?: { id: string; role: string };
}

/**
 * 报名日程与站内提醒 API（v6.1 模块 6）。
 * 全部为登录后接口；不接短信/微信/邮件/Web Push。
 */
@Controller('schedule')
@UseGuards(UserGuard)
export class ScheduleController {
  constructor(private readonly service: ScheduleService) {}

  /** 日程：当前用户关注机会的全部时间线事件（已按版本同步去重） */
  @Get()
  getSchedule(@Req() req: AuthenticatedRequest) {
    return this.service.getSchedule(req.user!.id);
  }

  /** 站内通知列表（按创建时间倒序，最多 50 条） */
  @Get('notifications')
  listNotifications(@Req() req: AuthenticatedRequest) {
    return this.service.listNotifications(req.user!.id);
  }

  /** 标记单条通知已读 */
  @Patch('notifications/:id/read')
  markRead(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.markRead(req.user!.id, id);
  }

  /** 全部标为已读 */
  @Patch('notifications/read-all')
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.service.markAllRead(req.user!.id);
  }
}
