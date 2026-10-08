import { Module } from '@nestjs/common';
import { OpportunitiesController } from './opportunities.controller.js';
import { OpportunitiesService } from './opportunities.service.js';
import { ProfileModule } from '../profile/profile.module.js';

@Module({
  imports: [ProfileModule],
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
