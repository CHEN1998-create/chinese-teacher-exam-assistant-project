"use client";

import { useSyncExternalStore } from "react";
import { examTargetService } from "@/lib/services";
import { authService } from "@/lib/auth";
import type { ExamTarget } from "@/types";

function subscribe(callback: () => void): () => void {
  const unsubTargets = examTargetService.subscribe(callback);
  const unsubAuth = authService.subscribe(callback);
  return () => {
    unsubTargets();
    unsubAuth();
  };
}

/**
 * 当前主目标的响应式读取：
 * 目标切换/编辑/归档或登录会话变化时自动更新，
 * 保证导航与各页面读到的是同一个当前目标。
 */
export function useCurrentExamTarget(): ExamTarget | null {
  useSyncExternalStore(
    subscribe,
    () => `${examTargetService.getVersion()}:${examTargetService.getCurrent()?.id ?? ""}`,
    () => ""
  );
  return examTargetService.getCurrent();
}

/** 当前用户全部目标 + 当前主目标的响应式读取（“我的考试”页使用） */
export function useExamTargets(): {
  targets: ExamTarget[];
  current: ExamTarget | null;
} {
  useSyncExternalStore(
    subscribe,
    () =>
      `${examTargetService.getVersion()}:${authService.getSession()?.userId ?? ""}:${
        examTargetService.getCurrent()?.id ?? ""
      }`,
    () => ""
  );
  const targets = examTargetService
    .getAll()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { targets, current: examTargetService.getCurrent() };
}
