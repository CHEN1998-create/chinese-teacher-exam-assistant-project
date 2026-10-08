/**
 * 后台权限守卫已统一到 src/auth/admin.guard.ts（模块 8）。
 * 此处仅做转发，避免 announcements 模块改动大量 import。
 */
export { AdminGuard, ReviewGuard, STAFF_ROLES, REVIEW_ROLES } from '../auth/admin.guard.js';
