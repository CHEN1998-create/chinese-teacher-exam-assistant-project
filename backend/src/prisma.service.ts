import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // 数据库暂时不可达时不让整个进程崩溃：健康检查会返回 degraded，
    // Prisma 在首次真实查询时自动尝试连接（模块 0A：反代冒烟与韧性）。
    try {
      await this.$connect();
    } catch (error) {
      this.logger.warn(
        `启动时数据库连接失败，服务继续启动并将在查询时重试：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect().catch(() => undefined);
  }
}
