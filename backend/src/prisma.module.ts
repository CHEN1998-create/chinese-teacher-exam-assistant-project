import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * 全局数据访问模块：各 feature 模块直接注入 PrismaService，
 * 无需在每个 @Module 中重复声明。
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
