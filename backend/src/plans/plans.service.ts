import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';

/**
 * 学习计划服务端存储（模块 8）。
 *
 * 采用“按目标快照同步”模型：前端每次计划变更后 PUT 全量快照，
 * 服务端删除该用户+目标下的旧周计划并重建（级联日计划与反馈）。
 * 所有读写均按 userId + examTargetId 强过滤，杜绝跨用户读取。
 */
/**
 * JSON 快照字段安全转换（不可信请求体 → 数据库值）：
 * 仅接受 JSON 原始类型，其余一律按缺省处理，绝不产生 "[object Object]" 或 Invalid Date 脏数据。
 */
function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function toTextOrNull(value: unknown): string | null {
  const text = toText(value);
  return text === '' ? null : text;
}

function toDateOrNow(value: unknown): Date {
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot(userId: string, examTargetId: string) {
    const weekly = await this.prisma.weeklyPlan.findMany({
      where: { userId, examTargetId },
      orderBy: { createdAt: 'desc' },
    });
    const weeklyIds = weekly.map((w) => w.id);
    const daily = weeklyIds.length
      ? await this.prisma.dailyPlan.findMany({
          where: { weeklyPlanId: { in: weeklyIds } },
          orderBy: { date: 'asc' },
        })
      : [];
    const feedbacks = weeklyIds.length
      ? await this.prisma.taskFeedback.findMany({
          where: { weeklyPlanId: { in: weeklyIds } },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    return { weeklyPlans: weekly, dailyPlans: daily, feedbacks };
  }

  async syncSnapshot(
    userId: string,
    examTargetId: string,
    input: {
      weeklyPlans: Array<Record<string, unknown>>;
      dailyPlans: Array<Record<string, unknown>>;
      feedbacks: Array<Record<string, unknown>>;
    },
  ): Promise<void> {
    const existing = await this.prisma.weeklyPlan.findMany({
      where: { userId, examTargetId },
      select: { id: true },
    });
    const existingIds = existing.map((w) => w.id);

    await this.prisma.$transaction([
      // 先删旧的全部（级联 daily + feedback）
      ...existingIds.map((id) =>
        this.prisma.weeklyPlan.delete({ where: { id } }),
      ),
      // 重建周计划
      ...input.weeklyPlans.map((w) =>
        this.prisma.weeklyPlan.create({
          data: {
            id: String(w.id),
            userId,
            examTargetId,
            weekNumber: Number(w.weekNumber),
            startDate: String(w.startDate),
            endDate: String(w.endDate),
            focus: String(w.focus),
            status: String(w.status),
            version: Number(w.version),
            previousVersionId: toTextOrNull(w.previousVersionId),
            generationReason: toText(w.generationReason),
            adjustments: (w.adjustments ?? []) as never,
            reviews: (w.reviews ?? []) as never,
            createdAt: toDateOrNow(w.createdAt),
            updatedAt: toDateOrNow(w.updatedAt),
          },
        }),
      ),
      // 重建日计划
      ...input.dailyPlans.map((d) =>
        this.prisma.dailyPlan.create({
          data: {
            id: String(d.id),
            weeklyPlanId: String(d.weeklyPlanId),
            userId,
            date: String(d.date),
            dayOfWeek: Number(d.dayOfWeek),
            tasks: d.tasks as never,
            totalEstimatedTime: Number(d.totalEstimatedTime),
            isMinimumViable: Boolean(d.isMinimumViable),
            availableMinutes: Number(d.availableMinutes),
            adjustmentNote: toTextOrNull(d.adjustmentNote),
            createdAt: toDateOrNow(d.createdAt),
            updatedAt: toDateOrNow(d.updatedAt),
          },
        }),
      ),
      // 重建反馈
      ...input.feedbacks.map((f) =>
        this.prisma.taskFeedback.create({
          data: {
            id: String(f.id),
            userId,
            taskId: String(f.taskId),
            weeklyPlanId: String(f.weeklyPlanId),
            weeklyVersion: Number(f.weeklyVersion),
            dailyPlanId: String(f.dailyPlanId),
            date: String(f.date),
            status: String(f.status),
            actualTime: f.actualTime != null ? Number(f.actualTime) : null,
            incompleteReason: toTextOrNull(f.incompleteReason),
            errorTypes: (f.errorTypes ?? []) as never,
            hasSecondPractice: Boolean(f.hasSecondPractice),
            notes: toTextOrNull(f.notes),
            createdAt: toDateOrNow(f.createdAt),
            updatedAt: toDateOrNow(f.updatedAt),
          },
        }),
      ),
    ]);
  }
}
