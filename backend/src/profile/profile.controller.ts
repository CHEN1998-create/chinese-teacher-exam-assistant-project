import {
  Body,
  Controller,
  Get,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ProfileService } from './profile.service.js';
import { UserGuard } from '../opportunities/user.guard.js';
import type { AuthenticatedRequest } from '../auth/identity.js';

/**
 * 用户画像读写（模块 8）。
 * - GET  /profile 读取当前用户持久画像（未保存过返回 null）；
 * - PUT  /profile 幂等保存（登录迁移与用户修改均走此接口）。
 * 全部按当前会话用户隔离，无法读取他人画像。
 */
@Controller('profile')
@UseGuards(UserGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  async get(@Req() req: AuthenticatedRequest) {
    const profile = await this.profileService.getProfile(req.user!.id);
    return { profile };
  }

  @Put()
  async save(
    @Req() req: AuthenticatedRequest,
    @Body() body: { profile?: unknown },
  ) {
    if (body.profile === undefined) {
      return { error: '缺少 profile 字段' };
    }
    await this.profileService.saveProfile(req.user!.id, body.profile);
    return { ok: true };
  }
}
