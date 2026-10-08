/**
 * 用户语言词表（模块 0A 第九节）：
 *
 * 把开发语言替换为用户表达。技术字段名与数据库枚举不要求改名，但
 * 用户可见页面必须使用本词表给出的表达。
 *
 * 全仓搜索用户端可见文案时，错误、空状态和帮助文本中不得出现 Mock、
 * 后端、API、数据库、localStorage 等实现术语。管理后台与开发日志可
 * 保留准确技术用语。
 *
 * 使用方式：
 *   import { USER_COPY } from "@/lib/ux/userCopy";
 *   USER_COPY.MATCH_STATUS.UNKNOWN       // "还不能判断"
 *   USER_COPY.UNKNOWN_BACKEND             // "内容暂时没有加载出来"
 */

export const USER_COPY = {
  /** 业务概念替换（第九节表） */
  CONCEPT: {
    BASIC_PROFILE: "你的报考信息",
    MATCH_DIMENSION: "报考条件",
    PUBLISHED_RESULT_REFRESH: "根据最新公告重新核对",
    PRIMARY_GOAL: "主要备考目标",
    COVERAGE_SOURCE: "信息来源",
    RULE_VERSION: "判断依据更新于",
    SERVER_FINAL_RESULT: "最新结果",
  },

  /** 匹配状态的用户表达 */
  MATCH_STATUS: {
    /** UNKNOWN → 还不能判断；不得变成"不符合" */
    UNKNOWN: "还不能判断",
    /** MANUAL_REVIEW → 建议向招聘单位确认 */
    MANUAL_REVIEW: "建议向招聘单位确认",
    /** GATE_FAILED → 这个机会暂时不能推荐 */
    GATE_FAILED: "这个机会暂时不能推荐",
    MATCHED: "可能符合",
    NOT_MATCHED: "暂不符合",
  } as Record<string, string>,

  /** 存储与本地化 */
  STORAGE: {
    /** localStorage 的用户表达 */
    LOCAL_ONLY: "仅保存在这台设备",
    /** 同步到账号的提示 */
    SYNCED: "已登录，已同步到你的账号",
  },

  /** 加载/错误/空状态的用户表达 */
  LOAD: {
    LOADING: "正在获取……",
    LOADING_LONG: "内容较多，正在获取……",
    ERROR_GENERIC: "内容暂时没有加载出来",
    ERROR_RETRY_HINT: "请稍后重试，或返回后重新打开。",
    ERROR_INPUT_NOT_SAVED: "你刚填的内容已保留在当前页面，不会丢失。",
    EMPTY_NO_OPPORTUNITY: "目前没有可推荐的机会",
    EMPTY_HAS_FOLLOWED: "你关注的机会都在这里了",
  },

  /** 关注/取消/主要目标的影响说明（用于 StatusMessage 与详情） */
  FOLLOW: {
    ADDED: "已加入关注，时间已加入日程",
    REMOVED: "已取消关注",
    UNDO: "撤销",
    REMOVE_CONFIRM: "取消关注后，这个机会会从你的关注列表和日程中移除。",
    CHANGE_PRIMARY_IMPACT:
      "更换主要目标后，原目标的备考计划会进入暂停，新目标的备考会按当前信息重新生成。",
  },

  /** 30 秒说明（"先了解"路径）三段标题与要点，文案来源：核心方案 §4.3 */
  LEARN: {
    CARD1_TITLE: "看过招聘公告，为什么还是不知道自己能不能报？",
    CARD1_BODY:
      "公告中的学历、专业、身份和教师资格条件通常分散在正文与岗位表中，逐项核对需要时间。",
    CARD2_TITLE: "我们会把公告要求和你的情况逐项核对",
    CARD2_BODY: "每一条重要判断都可以回到官方公告查看依据。",
    CARD3_TITLE: "判断不了的条件会明确告诉你",
    CARD3_BODY:
      "判断不了的地方，会明确告诉你需要补充或向招聘单位确认。预筛结果帮助你减少漏看，不替代招聘单位最终审核。",
  },

  /** 主行动按钮文案规则（第六节）：少用笼统"下一步""确定""提交" */
  CTA: {
    START_MATCH: "开始匹配",
    CONTINUE_LAST: "继续上次填写",
    ENTER_OPPORTUNITIES: "查看机会",
    VIEW_EVIDENCE: "查看判断依据",
    VIEW_PRIORITY: "查看优先机会",
    FOLLOW: "关注",
    SCHEDULE_ACTION: "处理下一项",
    START_STUDY: "开始今日备考",
    SET_PRIMARY: "设为主要目标",
    LEARN_MORE: "先花 30 秒了解我们怎么判断",
  },
} as const;

/** 取匹配状态的用户表达；未知 key 安全回退到"还不能判断" */
export function matchStatusLabel(status: string | undefined | null): string {
  if (!status) return USER_COPY.MATCH_STATUS.UNKNOWN;
  return (
    USER_COPY.MATCH_STATUS[status] ?? USER_COPY.MATCH_STATUS.UNKNOWN
  );
}

/** 取按钮主行动文案：未知键安全回退到通用"继续" */
export function ctaLabel(key: keyof typeof USER_COPY.CTA | string): string {
  return (USER_COPY.CTA as Record<string, string>)[key] ?? "继续";
}
