import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';

/**
 * 用户基础画像服务（模块 8）。
 * 画像以 JSON 整体 upsert，不做字段级拆分；匹配接口按需读取。
 * 不保存身份证号、社保账号等敏感信息。
 */
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<unknown> {
    const row = await this.prisma.userProfile.findUnique({ where: { userId } });
    return row?.profile ?? null;
  }

  /** 幂等保存：同用户重复 PUT 只更新一条记录，不产生重复 */
  async saveProfile(userId: string, profile: unknown): Promise<void> {
    await this.prisma.userProfile.upsert({
      where: { userId },
      update: { profile: profile as never },
      create: { userId, profile: profile as never },
    });
  }
}
