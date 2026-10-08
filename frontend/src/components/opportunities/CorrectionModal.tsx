"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select, Textarea, Input } from "@/components/ui/Input";

const FIELD_OPTIONS = [
  { value: "major", label: "专业目录 / 资格条件" },
  { value: "timeline", label: "报名时间 / 考试安排" },
  { value: "headcount", label: "招聘人数 / 岗位信息" },
  { value: "evidence", label: "官方来源或原文摘录" },
  { value: "other", label: "其他问题" },
];

interface CorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  submitting: boolean;
  onSubmit: (input: {
    fieldPath: string;
    content: string;
    contact?: string;
  }) => void;
}

/**
 * 详情第三层纠错入口（PRD 7.10）：
 * 提交后只在后台留痕，由运营核对并走模块 2 发布新版本，不会自动改判。
 */
export function CorrectionModal({
  isOpen,
  onClose,
  submitting,
  onSubmit,
}: CorrectionModalProps) {
  const [fieldPath, setFieldPath] = useState("");
  const [content, setContent] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");

  const reset = () => {
    setFieldPath("");
    setContent("");
    setContact("");
    setError("");
  };

  const handleSubmit = () => {
    if (!fieldPath) {
      setError("请选择要纠错的内容位置。");
      return;
    }
    if (content.trim().length < 5) {
      setError("请填写至少 5 个字的说明，便于我们核对官方原文。");
      return;
    }
    onSubmit({
      fieldPath,
      content: content.trim(),
      contact: contact.trim() || undefined,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        onClose();
        reset();
      }}
      title="提交信息纠错"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              onClose();
              reset();
            }}
            disabled={submitting}
          >
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "提交中…" : "提交纠错"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          如果你发现页面内容与官方公告不一致，请指出位置并说明。我们会核对官方原文；
          确认有误的，将通过新版本更正，不会直接改动结论。
        </p>
        <Select
          label="问题位置"
          placeholder="选择要纠错的内容"
          options={FIELD_OPTIONS}
          value={fieldPath}
          onChange={(e) => {
            setFieldPath(e.target.value);
            setError("");
          }}
        />
        <Textarea
          label="纠错说明（至少 5 个字）"
          value={content}
          maxLength={1000}
          onChange={(e) => {
            setContent(e.target.value);
            setError("");
          }}
          placeholder="例如：补充公告里初中语文岗位实际扩招到 10 人，页面仍是 8 人。"
        />
        <Input
          label="联系方式（可选）"
          value={contact}
          maxLength={200}
          onChange={(e) => setContact(e.target.value)}
          placeholder="需要回访时使用，不会公开展示"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
