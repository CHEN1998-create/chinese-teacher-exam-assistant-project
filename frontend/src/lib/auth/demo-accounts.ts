import { User } from "@/types";
import { mockUser } from "@/lib/mock-data";

/**
 * 演示账号清单（仅用于 Demo 登录，不是真实账号体系）。
 * 接入真实认证后删除本文件，由后端负责账号校验。
 */
export interface DemoAccount {
  /** 登录邮箱 */
  account: string;
  /** 演示密码，明文仅用于本地模拟，真实项目禁止这样存储 */
  password: string;
  /** 账号用途说明（展示在登录页） */
  description: string;
  user: User;
}

const staffNotifications = {
  studyReminder: false,
  examUpdate: true,
  resourceUpdate: true,
  weeklyReport: false,
};

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    account: "student@demo.app",
    password: "demo1234",
    description: "备考用户",
    user: { ...mockUser },
  },
  {
    account: "exam@demo.app",
    password: "demo1234",
    description: "考情审核员",
    user: {
      id: "u-002",
      name: "考情审核员",
      role: "exam_reviewer",
      dailyAvailableTime: 0,
      notificationSettings: staffNotifications,
      createdAt: "2026-09-20T08:00:00Z",
      updatedAt: "2026-09-20T08:00:00Z",
    },
  },
  {
    account: "resource@demo.app",
    password: "demo1234",
    description: "资源审核员",
    user: {
      id: "u-003",
      name: "资源审核员",
      role: "resource_reviewer",
      dailyAvailableTime: 0,
      notificationSettings: staffNotifications,
      createdAt: "2026-09-20T08:00:00Z",
      updatedAt: "2026-09-20T08:00:00Z",
    },
  },
  {
    account: "admin@demo.app",
    password: "demo1234",
    description: "管理员",
    user: {
      id: "u-004",
      name: "系统管理员",
      role: "admin",
      dailyAvailableTime: 0,
      notificationSettings: staffNotifications,
      createdAt: "2026-09-20T08:00:00Z",
      updatedAt: "2026-09-20T08:00:00Z",
    },
  },
];
