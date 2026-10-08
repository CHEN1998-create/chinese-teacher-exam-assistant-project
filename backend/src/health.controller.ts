import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'up', time: new Date().toISOString() };
    } catch {
      return { status: 'degraded', db: 'down', time: new Date().toISOString() };
    }
  }
}
