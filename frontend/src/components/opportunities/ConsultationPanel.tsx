"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import type {
  ConsultationTemplateDTO,
  ContactInfoDTO,
} from "@/lib/opportunities/api-types";
import { safeOfficialLink } from "@/lib/links/official";

interface ConsultationPanelProps {
  templates: ConsultationTemplateDTO[];
  contact: ContactInfoDTO;
  /** 当前 follow 已记录的咨询结论：{ dimensionKey: note } */
  notes: Record<string, string> | null;
  busy: boolean;
  onSaveNote: (dimensionKey: string, note: string) => void;
}

/**
 * 官方联系信息与咨询模板（模块 6）。
 * - 对每个「需官方确认」维度提供可复制的问题模板；
 * - 用户可自行记录咨询结论，标注「你自行记录，非官方事实」，不影响匹配结论。
 */
export function ConsultationPanel({
  templates,
  contact,
  notes,
  busy,
  onSaveNote,
}: ConsultationPanelProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // 剪贴板不可用时静默降级
    }
  };

  const draftFor = (key: string) =>
    drafts[key] ?? notes?.[key] ?? "";

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-canvas p-3">
        <p className="text-xs font-semibold text-ink">官方联系信息</p>
        <p className="mt-1 text-sm text-ink-muted">{contact.publisher}</p>
        {contact.contactInfo ? (
          <p className="mt-0.5 text-sm text-ink-muted">{contact.contactInfo}</p>
        ) : (
          <p className="mt-0.5 text-xs text-ink-muted">
            联系电话/邮箱请见公告原文末尾「报名咨询」栏目
          </p>
        )}
        {safeOfficialLink(contact.officialUrl) ? (
          <a href={safeOfficialLink(contact.officialUrl)!} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-brand underline">
            打开官方公告原文
          </a>
        ) : (
          <p className="mt-1 text-xs text-warn">虚构示例，无可访问的官方公告；请勿据此联系或报名。</p>
        )}
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-ink-muted">
          当前没有需要向招聘单位确认的歧义项。
        </p>
      ) : (
        <ul className="space-y-3">
          {templates.map((t) => (
            <li
              key={t.dimensionKey}
              className="rounded-lg border border-line p-3"
            >
              <p className="text-sm font-medium text-ink">
                关于「{t.dimensionLabel}」
              </p>
              <div className="mt-2 rounded bg-warn-soft p-2 text-xs leading-5 text-amber-900">
                {t.question}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => copy(t.dimensionKey, t.question)}
              >
                {copiedKey === t.dimensionKey ? "已复制" : "复制问题"}
              </Button>

              <div className="mt-3">
                <Textarea
                  label="我已咨询，结论是（仅自己可见，不作为官方事实）"
                  value={draftFor(t.dimensionKey)}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [t.dimensionKey]: e.target.value }))
                  }
                  onBlur={() => {
                    const v = draftFor(t.dimensionKey);
                    if (v !== (notes?.[t.dimensionKey] ?? "")) {
                      onSaveNote(t.dimensionKey, v);
                    }
                  }}
                  placeholder="如：电话确认后，对方表示汉语言文学师范专业符合……"
                  maxLength={300}
                  disabled={busy}
                />
                {notes?.[t.dimensionKey] && (
                  <p className="mt-1 text-[11px] text-ink-muted">
                    你自行记录的咨询结论，未经官方公示，不影响系统匹配判断。
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
