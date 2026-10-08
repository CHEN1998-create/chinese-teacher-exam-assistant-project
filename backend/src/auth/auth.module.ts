import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { AdminController } from './admin.controller.js';
import { SessionAuthGuard } from './session.guard.js';

@Module({
  controllers: [AuthController, AdminController],
  providers: [AuthService, SessionAuthGuard],
  exports: [AuthService, SessionAuthGuard],
})
export class AuthModule {}
