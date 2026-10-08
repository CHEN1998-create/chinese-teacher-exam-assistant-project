import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AnnouncementsService } from './announcements.service.js';
import { AdminGuard, ReviewGuard } from './admin.guard.js';
import type { ReviewAction } from './domain.js';

interface AuthenticatedRequest {
  user?: { id: string; role: string };
  headers: Record<string, string | string[] | undefined>;
}

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  // ==================== 管理员：提交来源 ====================

  @Post('sources')
  @UseGuards(AdminGuard)
  async submitSource(
    @Body()
    body: {
      publisher: string;
      officialUrl: string;
      sourceType: string;
      content: string;
      mimeType: string;
      regionCode?: string;
      announcementId?: string;
    },
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user!.id;
    return this.service.submitSource(body, userId);
  }

  // ==================== 管理员：执行提取 ====================

  @Post('runs/:id/extract')
  @UseGuards(AdminGuard)
  async runExtraction(@Param('id') id: string) {
    return this.service.runExtraction(id);
  }

  // ==================== 管理员：任务列表与详情 ====================

  @Get('runs')
  @UseGuards(AdminGuard)
  async listRuns(@Query('status') status?: string, @Query('announcementId') announcementId?: string) {
    return this.service.listRuns({ status, announcementId });
  }

  @Get('runs/:id')
  @UseGuards(AdminGuard)
  async getRun(@Param('id') id: string) {
    return this.service.getRun(id);
  }

  @Get('snapshots/:id/content')
  @UseGuards(AdminGuard)
  async getSnapshotContent(@Param('id') id: string) {
    return this.service.getSnapshotContent(id);
  }

  // ==================== 审核员：提交审核 ====================

  @Post('runs/:id/review')
  @UseGuards(ReviewGuard)
  async submitReview(
    @Param('id') id: string,
    @Body()
    body: {
      action: ReviewAction;
      reason: string;
      editedFields?: Array<{ field: string; value: string; anchor?: object }>;
    },
    @Req() req: AuthenticatedRequest,
  ) {
    const reviewerName =
      (Array.isArray(req.headers['x-user-name'])
        ? req.headers['x-user-name'][0]
        : req.headers['x-user-name']) ?? '审核员';
    return this.service.submitReview(
      {
        runId: id,
        action: body.action,
        reason: body.reason,
        editedFields: body.editedFields as never,
      },
      { id: req.user!.id, name: reviewerName },
    );
  }

  // ==================== 审核员：发布 ====================

  @Post('runs/:id/publish')
  @UseGuards(ReviewGuard)
  async publish(@Param('id') id: string) {
    return this.service.publish(id);
  }

  // ==================== 管理员：重试失败任务 ====================

  @Post('runs/:id/retry')
  @UseGuards(AdminGuard)
  async retryRun(@Param('id') id: string) {
    return this.service.retryRun(id);
  }

  // ==================== 版本：公开只读 ====================

  @Get(':announcementId/versions')
  async listVersions(@Param('announcementId') announcementId: string) {
    return this.service.listVersions(announcementId);
  }

  @Get(':announcementId/versions/diff')
  @UseGuards(AdminGuard)
  async getVersionDiff(
    @Param('announcementId') announcementId: string,
    @Query('v1') v1: string,
    @Query('v2') v2: string,
  ) {
    return this.service.getVersionDiff(announcementId, Number(v1), Number(v2));
  }

  @Get(':announcementId/published')
  async getPublishedVersion(@Param('announcementId') announcementId: string) {
    return this.service.getPublishedVersion(announcementId);
  }
}
