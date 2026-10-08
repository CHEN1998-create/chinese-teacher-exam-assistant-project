import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthController } from './health.controller.js';
import { InternalTokenGuard } from './internal-token.guard.js';
import { PrismaModule } from './prisma.module.js';
import { AnnouncementsModule } from './announcements/announcements.module.js';
import { OpportunitiesModule } from './opportunities/opportunities.module.js';
import { ScheduleModule } from './schedule/schedule.module.js';
import { AuthModule } from './auth/auth.module.js';
import { SessionAuthGuard } from './auth/session.guard.js';
import { ProfileModule } from './profile/profile.module.js';
import { PlansModule } from './plans/plans.module.js';
import { TrialModule } from './trial/trial.module.js';

@Module({
  imports: [PrismaModule, AnnouncementsModule, OpportunitiesModule, ScheduleModule, AuthModule, ProfileModule, PlansModule, TrialModule],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: InternalTokenGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
  ],
})
export class AppModule {}
