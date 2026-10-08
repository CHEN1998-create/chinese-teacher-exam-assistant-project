/**
 * 受邀验证阶段的结构化公告目录（模块 5）。
 *
 * 来源与定位：
 * - 每条公告都带有不可变版本（original/supplement、versionNumber、publishedAt）、
 *   官方来源锚点与逐条件 EvidenceAnchor（原文摘录 + 官方 URL + 核对时间）；
 * - 匹配引擎只读这里的“当前已发布版本”，与模块 2“用户端只能读取已发布版本”一致；
 * - 模块 2 的提取流水线目前落库的是扁平字段候选（ExtractionCandidate），
 *   尚无结构化报考单元落库；受邀阶段由人工审核后维护本目录作为
 *   “已发布公告版本的结构化视图”。待流水线支持结构化发布后，
 *   只替换本文件的数据来源，匹配 API 与规则不变。
 *
 * 七个场景（PRD 7.4 四档结果 + 时效 + 版本链 + 来源失效异常态）：
 * 1. hangzhou 杭州市直属初中   → 初步符合
 * 2. yinzhou 宁波鄞州岗位组    → 缺户籍，补充信息后判断
 * 3. suzhou  苏州高新区岗位组  → 专业目录歧义，建议人工确认
 * 4. nanjing 南京市直属高中    → 明确学历不符（要求硕士）
 * 5. wenzhou 温州龙湾区岗位组  → 报名已截止，不进入有效推荐
 * 6. hefei   合肥市直初中      → 补充公告 v2（延期+扩招），v1 保留
 * 7. jiaxing 嘉兴市直初中      → 官方来源巡检失效（404），历史留档不进推荐
 */
import type {
  AllocationMethod,
  AnnouncementSourceKind,
  AnnouncementTimeline,
  AnnouncementVersion,
  ApplicationUnit,
  EmploymentNature,
  EvidenceAnchor,
  EvidenceLocator,
  MaterialItem,
  RecruitmentAnnouncement,
  RegionRef,
  Requirement,
  RequirementCriterion,
  RequirementDimension,
  StageCode,
  SubjectCode,
} from './types.js';

/** 目录数据版本：公告/证据更新时递增，随匹配响应返回 */
export const CATALOG_VERSION = 'kb-opportunity-catalog-1.0.0';

/** 目录统一核对时间（演示数据固定，保证确定性） */
export const CATALOG_CHECKED_AT = '2026-10-04T12:00:00+08:00';

function officialAnchor(id: string, url: string, excerpt: string): EvidenceAnchor {
  const locator: EvidenceLocator = { kind: 'url', url };
  return { id, locator, excerpt, state: 'official', checkedAt: CATALOG_CHECKED_AT };
}

function requirement(
  id: string,
  dimension: RequirementDimension,
  description: string,
  criterion: RequirementCriterion,
  evidenceUrl: string,
  excerpt: string,
  hard = true,
): Requirement {
  return {
    id,
    dimension,
    description,
    hard,
    criterion,
    evidence: officialAnchor(`${id}-ev`, evidenceUrl, excerpt),
  };
}

const NATURE_PUBLIC: EmploymentNature = {
  code: 'public_institution_staff',
  officialName: '事业编制工作人员',
};
const NATURE_RECORD: EmploymentNature = {
  code: 'record_filing',
  officialName: '事业编制备案管理（备案制）',
};
const NATURE_QUOTA: EmploymentNature = {
  code: 'post_quota',
  officialName: '员额池管理（员额制）',
};

const ALLOC_DIRECT: AllocationMethod = {
  code: 'direct_school',
  description: '按报考学校直接定岗',
};
const ALLOC_CHOICE: AllocationMethod = {
  code: 'score_based_choice',
  description: '按总成绩从高到低依次择岗',
};
const ALLOC_ASSIGN: AllocationMethod = {
  code: 'unified_assignment',
  description: '录取后由教育局统一调配至辖区学校',
};

interface UnitSpec {
  id: string;
  code: string;
  name: string;
  region: RegionRef;
  stage: StageCode;
  headcount: number;
  nature: EmploymentNature;
  allocation: AllocationMethod;
  teachingScope?: string;
  requirements: Requirement[];
  registerUrl?: string;
  materials?: MaterialItem[];
}

function unit(
  versionId: string,
  announcementId: string,
  spec: UnitSpec,
): ApplicationUnit {
  return {
    id: spec.id,
    code: spec.code,
    name: spec.name,
    announcementId,
    versionId,
    region: spec.region,
    teachingScope: spec.teachingScope,
    subject: 'chinese' satisfies SubjectCode,
    stage: spec.stage,
    headcount: spec.headcount,
    organizationType: 'government_unified',
    employmentNature: spec.nature,
    allocation: spec.allocation,
    registerUrl: spec.registerUrl,
    requirements: spec.requirements,
    materials: spec.materials,
  };
}

/**
 * 演示数据的最小材料清单：无法从公告原文确认具体要求，
 * 故全部标记为「以公告为准」且 required=false，不误导用户。
 */
function demoMaterials(officialUrl: string): MaterialItem[] {
  const src = (id: string, excerpt: string): EvidenceAnchor => ({
    id,
    locator: { kind: 'url', url: officialUrl },
    excerpt,
    state: 'official',
    checkedAt: '2026-10-04T12:00:00+08:00',
  });
  return [
    { id: 'id-card', label: '身份证', applicableAudience: '以公告为准', required: false, source: src('demo-mat-id', '报名一般需提供有效身份证件，具体以公告为准。') },
    { id: 'edu-cert', label: '学历、学位证书', applicableAudience: '以公告为准', required: false, source: src('demo-mat-edu', '学历学位材料要求以公告原文为准。') },
    { id: 'teacher-cert', label: '教师资格证书', applicableAudience: '以公告为准', required: false, source: src('demo-mat-tc', '教师资格及学科要求以公告原文为准。') },
  ];
}

function version(
  announcementId: string,
  versionNumber: number,
  sourceKind: AnnouncementSourceKind,
  publishedAt: string,
  sourceUrl: string,
  timeline: AnnouncementTimeline,
  units: ApplicationUnit[],
  changeNote?: string,
): AnnouncementVersion {
  return {
    id: `${announcementId}-v${versionNumber}`,
    announcementId,
    versionNumber,
    sourceKind,
    publishedAt,
    officialSource: officialAnchor(
      `${announcementId}-v${versionNumber}-src`,
      sourceUrl,
      sourceKind === 'original'
        ? '公告原文（官方发布页）'
        : '补充公告原文（官方发布页）',
    ),
    timeline,
    units,
    changeNote,
  };
}

// ---------- 场景 1：杭州 · 初步符合 ----------

const HZ_URL =
  'https://www.hangzhou.example.gov.cn/edu/2026/teacher-recruit-01';

function hangzhou(): RecruitmentAnnouncement {
  const id = 'ann-hangzhou';
  const requirements: Requirement[] = [
    requirement(
      'hz-edu',
      'education',
      '具有国家承认的本科及以上学历',
      { kind: 'education', minLevel: 'bachelor' },
      HZ_URL,
      '具有国家承认的大学本科及以上学历。',
    ),
    requirement(
      'hz-degree',
      'degree',
      '具有相应学位',
      { kind: 'degree', requiredDegree: 'bachelor' },
      HZ_URL,
      '本科及以上学历，并具有相应学位。',
    ),
    requirement(
      'hz-major',
      'major',
      '专业要求：汉语言文学、汉语言文学（师范）等',
      { kind: 'major', majorNames: ['汉语言文学', '汉语言文学（师范）'] },
      HZ_URL,
      '语文教师岗位专业要求：汉语言文学、汉语言文学（师范）。',
    ),
    requirement(
      'hz-fresh',
      'graduate_status',
      '2026 届应届毕业生或往届未落实工作单位人员',
      { kind: 'graduate_status', requireFresh: true },
      HZ_URL,
      '2026届应届毕业生或离校2年内未落实工作单位的毕业生。',
    ),
    requirement(
      'hz-cert',
      'teacher_cert',
      '具有与岗位学科、学段一致的教师资格证',
      {
        kind: 'teacher_cert',
        subject: 'chinese',
        stage: 'middle',
        acceptInProgress: true,
      },
      HZ_URL,
      '具有初中语文教师资格证书；已通过资格考试待领证者可以报考。',
    ),
  ];
  const units = [
    unit(`${id}-v1`, id, {
      id: 'unit-hangzhou-01',
      code: 'HZ-CW-01',
      name: '杭州市教育局直属学校·初中语文岗位组',
      region: { code: '330100', province: '浙江省', city: '杭州市' },
      stage: 'middle',
      headcount: 12,
      nature: NATURE_PUBLIC,
      allocation: ALLOC_DIRECT,
      teachingScope: '杭州市教育局直属初中',
      requirements,
      registerUrl: 'https://www.hangzhou.example.gov.cn/edu/apply',
      materials: demoMaterials(HZ_URL),
    }),
  ];
  return {
    id,
    title: '2026年杭州市教育局直属学校公开招聘教师公告',
    publisher: '杭州市教育局',
    organizationType: 'government_unified',
    officialUrl: HZ_URL,
    subjectScope: ['chinese'],
    region: { code: '330000', province: '浙江省' },
    lifecycle: 'active',
    firstPublishedAt: '2026-09-28T09:00:00+08:00',
    versions: [
      version(
        id,
        1,
        'original',
        '2026-09-28T09:00:00+08:00',
        HZ_URL,
        {
          registrationStart: '2026-10-01',
          registrationEnd: '2026-10-20',
          writtenExamDate: '2026-11-08',
          pendingItems: ['面试时间待官方通知'],
        },
        units,
      ),
    ],
  };
}

// ---------- 场景 2：宁波鄞州 · 缺户籍 ----------

const YZ_URL = 'https://yinzhou.ningbo.example.gov.cn/hr/2026/teacher-02';

function yinzhou(): RecruitmentAnnouncement {
  const id = 'ann-yinzhou';
  const requirements: Requirement[] = [
    requirement(
      'yz-edu',
      'education',
      '本科及以上学历',
      { kind: 'education', minLevel: 'bachelor' },
      YZ_URL,
      '具有大学本科及以上学历。',
    ),
    requirement(
      'yz-major',
      'major',
      '专业要求：中国语言文学类相关专业',
      {
        kind: 'major',
        majorNames: ['汉语言文学（师范）', '汉语言文学'],
        catalogGroups: ['中国语言文学类'],
      },
      YZ_URL,
      '语文岗位专业范围：中国语言文学类（含汉语言文学师范方向）。',
    ),
    requirement(
      'yz-cert',
      'teacher_cert',
      '具有初中语文教师资格证',
      {
        kind: 'teacher_cert',
        subject: 'chinese',
        stage: 'middle',
        acceptInProgress: false,
      },
      YZ_URL,
      '报名时须已取得初中语文教师资格证书。',
    ),
    requirement(
      'yz-hukou',
      'hukou',
      '具有宁波市户籍（含生源地）',
      { kind: 'hukou', allowedRegionCodes: ['330200'], label: '宁波市户籍' },
      YZ_URL,
      '限宁波市户籍或宁波生源报考。',
    ),
  ];
  const units = [
    unit(`${id}-v1`, id, {
      id: 'unit-yinzhou-01',
      code: 'YZ-CW-01',
      name: '鄞州区教育局下属学校·初中语文岗位组',
      region: {
        code: '330212',
        province: '浙江省',
        city: '宁波市',
        district: '鄞州区',
      },
      stage: 'middle',
      headcount: 8,
      nature: NATURE_RECORD,
      allocation: ALLOC_CHOICE,
      teachingScope: '鄞州区下属公办初中，按总成绩择岗',
      requirements,
      materials: demoMaterials(YZ_URL),
    }),
  ];
  return {
    id,
    title: '2026年宁波市鄞州区公开招聘事业编制备案管理教师公告',
    publisher: '宁波市鄞州区人力资源和社会保障局',
    organizationType: 'government_unified',
    officialUrl: YZ_URL,
    subjectScope: ['chinese'],
    region: { code: '330000', province: '浙江省' },
    lifecycle: 'active',
    firstPublishedAt: '2026-09-30T10:00:00+08:00',
    versions: [
      version(
        id,
        1,
        'original',
        '2026-09-30T10:00:00+08:00',
        YZ_URL,
        {
          registrationStart: '2026-10-03',
          registrationEnd: '2026-10-22',
          writtenExamDate: '2026-11-15',
        },
        units,
      ),
    ],
  };
}

// ---------- 场景 3：苏州高新区 · 专业目录歧义 ----------

const SZ_URL = 'https://www.snd.suzhou.example.gov.cn/hr/2026/teacher-03';

function suzhou(): RecruitmentAnnouncement {
  const id = 'ann-suzhou';
  const requirements: Requirement[] = [
    requirement(
      'sz-edu',
      'education',
      '本科及以上学历',
      { kind: 'education', minLevel: 'bachelor' },
      SZ_URL,
      '具有大学本科及以上学历。',
    ),
    requirement(
      'sz-major',
      'major',
      '中国语言文学类相关专业（师范类优先）',
      {
        kind: 'major',
        // 公告未逐字列出“汉语言文学（师范）”，且使用“相关专业”开放性表述
        majorNames: ['汉语言文学'],
        catalogGroups: ['中国语言文学类'],
        ambiguous: true,
      },
      SZ_URL,
      '中国语言文学类相关专业，师范类毕业生优先，具体专业口径以招聘单位解释为准。',
    ),
    requirement(
      'sz-cert',
      'teacher_cert',
      '具有初中语文教师资格证',
      {
        kind: 'teacher_cert',
        subject: 'chinese',
        stage: 'middle',
        acceptInProgress: true,
      },
      SZ_URL,
      '具有初中语文教师资格证或已通过考试待领证。',
    ),
  ];
  const units = [
    unit(`${id}-v1`, id, {
      id: 'unit-suzhou-01',
      code: 'SZ-CW-01',
      name: '苏州高新区公办初中·语文岗位组',
      region: {
        code: '320505',
        province: '江苏省',
        city: '苏州市',
        district: '高新区',
      },
      stage: 'middle',
      headcount: 6,
      nature: NATURE_QUOTA,
      allocation: ALLOC_CHOICE,
      teachingScope: '苏州高新区公办初中',
      requirements,
      materials: demoMaterials(SZ_URL),
    }),
  ];
  return {
    id,
    title: '2026年苏州高新区公办学校员额制教师招聘公告',
    publisher: '苏州高新区（虎丘区）教育局',
    organizationType: 'institution_unified',
    officialUrl: SZ_URL,
    subjectScope: ['chinese'],
    region: { code: '320000', province: '江苏省' },
    lifecycle: 'active',
    firstPublishedAt: '2026-09-29T09:30:00+08:00',
    versions: [
      version(
        id,
        1,
        'original',
        '2026-09-29T09:30:00+08:00',
        SZ_URL,
        {
          registrationStart: '2026-10-02',
          registrationEnd: '2026-10-25',
          writtenExamDate: '2026-11-22',
        },
        units,
      ),
    ],
  };
}

// ---------- 场景 4：南京 · 明确学历不符（硕士起报） ----------

const NJ_URL = 'https://www.nanjing.example.gov.cn/jyj/2026/teacher-04';

function nanjing(): RecruitmentAnnouncement {
  const id = 'ann-nanjing';
  const requirements: Requirement[] = [
    requirement(
      'nj-edu',
      'education',
      '硕士研究生及以上学历',
      { kind: 'education', minLevel: 'master' },
      NJ_URL,
      '高中语文教师岗位须具有硕士研究生及以上学历、学位。',
    ),
    requirement(
      'nj-degree',
      'degree',
      '具有硕士及以上学位',
      { kind: 'degree', requiredDegree: 'master' },
      NJ_URL,
      '须具有硕士研究生及以上学位。',
    ),
    requirement(
      'nj-major',
      'major',
      '中国语言文学类专业',
      {
        kind: 'major',
        majorNames: ['汉语言文学', '汉语言文学（师范）'],
        catalogGroups: ['中国语言文学类'],
      },
      NJ_URL,
      '专业范围：中国语言文学类。',
    ),
    requirement(
      'nj-cert',
      'teacher_cert',
      '具有高中语文教师资格证',
      {
        kind: 'teacher_cert',
        subject: 'chinese',
        stage: 'high',
        acceptInProgress: false,
      },
      NJ_URL,
      '报名时须已取得高中语文教师资格证书。',
    ),
  ];
  const units = [
    unit(`${id}-v1`, id, {
      id: 'unit-nanjing-01',
      code: 'NJ-CG-01',
      name: '南京市教育局直属高中·语文教师',
      region: { code: '320100', province: '江苏省', city: '南京市' },
      stage: 'high',
      headcount: 4,
      nature: NATURE_PUBLIC,
      allocation: ALLOC_DIRECT,
      teachingScope: '南京市教育局直属普通高中',
      requirements,
      materials: demoMaterials(NJ_URL),
    }),
  ];
  return {
    id,
    title: '2026年南京市教育局直属学校公开招聘教师公告',
    publisher: '南京市教育局',
    organizationType: 'government_unified',
    officialUrl: NJ_URL,
    subjectScope: ['chinese'],
    region: { code: '320000', province: '江苏省' },
    lifecycle: 'active',
    firstPublishedAt: '2026-09-25T09:00:00+08:00',
    versions: [
      version(
        id,
        1,
        'original',
        '2026-09-25T09:00:00+08:00',
        NJ_URL,
        {
          registrationStart: '2026-09-28',
          registrationEnd: '2026-10-18',
          writtenExamDate: '2026-11-01',
        },
        units,
      ),
    ],
  };
}

// ---------- 场景 5：温州龙湾 · 报名已截止 ----------

const WZ_URL = 'https://www.longwan.wenzhou.example.gov.cn/2026/teacher-05';

function wenzhou(): RecruitmentAnnouncement {
  const id = 'ann-wenzhou';
  const requirements: Requirement[] = [
    requirement(
      'wz-edu',
      'education',
      '本科及以上学历',
      { kind: 'education', minLevel: 'bachelor' },
      WZ_URL,
      '具有大学本科及以上学历。',
    ),
    requirement(
      'wz-major',
      'major',
      '汉语言文学（师范）等专业',
      { kind: 'major', majorNames: ['汉语言文学（师范）', '汉语言文学'] },
      WZ_URL,
      '语文岗位专业：汉语言文学（含师范方向）。',
    ),
    requirement(
      'wz-cert',
      'teacher_cert',
      '具有初中语文教师资格证',
      {
        kind: 'teacher_cert',
        subject: 'chinese',
        stage: 'middle',
        acceptInProgress: false,
      },
      WZ_URL,
      '须具有初中语文教师资格证书。',
    ),
  ];
  const units = [
    unit(`${id}-v1`, id, {
      id: 'unit-wenzhou-01',
      code: 'LW-CW-01',
      name: '龙湾区公办初中·语文岗位组',
      region: {
        code: '330303',
        province: '浙江省',
        city: '温州市',
        district: '龙湾区',
      },
      stage: 'middle',
      headcount: 5,
      nature: NATURE_RECORD,
      allocation: ALLOC_ASSIGN,
      teachingScope: '龙湾区公办初中，录取后统一调配',
      requirements,
      materials: demoMaterials(WZ_URL),
    }),
  ];
  return {
    id,
    title: '2026年温州市龙湾区公开招聘教师公告（报名已结束）',
    publisher: '温州市龙湾区教育局',
    organizationType: 'government_unified',
    officialUrl: WZ_URL,
    subjectScope: ['chinese'],
    region: { code: '330000', province: '浙江省' },
    lifecycle: 'active',
    firstPublishedAt: '2026-08-20T09:00:00+08:00',
    versions: [
      version(
        id,
        1,
        'original',
        '2026-08-20T09:00:00+08:00',
        WZ_URL,
        {
          registrationStart: '2026-09-01',
          registrationEnd: '2026-09-20', // 早于参考时间
          writtenExamDate: '2026-10-18',
        },
        units,
      ),
    ],
  };
}

// ---------- 场景 6：合肥 · 补充公告 v2（延期 + 扩招），v1 保留 ----------

const HF_URL = 'https://www.hefei.example.gov.cn/rsj/2026/teacher-06';
const HF_SUPPLEMENT_URL =
  'https://www.hefei.example.gov.cn/rsj/2026/teacher-06-supplement';

function hefei(): RecruitmentAnnouncement {
  const id = 'ann-hefei';
  const makeRequirements = (): Requirement[] => [
    requirement(
      'hf-edu',
      'education',
      '本科及以上学历',
      { kind: 'education', minLevel: 'bachelor' },
      HF_URL,
      '具有大学本科及以上学历。',
    ),
    requirement(
      'hf-major',
      'major',
      '汉语言文学、汉语言文学（师范）专业',
      { kind: 'major', majorNames: ['汉语言文学', '汉语言文学（师范）'] },
      HF_URL,
      '初中语文岗位专业：汉语言文学、汉语言文学（师范）。',
    ),
    requirement(
      'hf-cert',
      'teacher_cert',
      '具有初中语文教师资格证',
      {
        kind: 'teacher_cert',
        subject: 'chinese',
        stage: 'middle',
        acceptInProgress: true,
      },
      HF_URL,
      '具有初中语文教师资格证或已通过考试待领证。',
    ),
  ];

  const v1Units = [
    unit('ann-hefei-v1', id, {
      id: 'unit-hefei-01-v1',
      code: 'HF-CW-01',
      name: '合肥市教育局直属初中·语文岗位组',
      region: { code: '340100', province: '安徽省', city: '合肥市' },
      stage: 'middle',
      headcount: 5,
      nature: NATURE_PUBLIC,
      allocation: ALLOC_ASSIGN,
      teachingScope: '合肥市教育局直属初中，录取后统一调配',
      requirements: makeRequirements(),
      materials: demoMaterials(HF_URL),
    }),
  ];
  const v2Units = [
    unit('ann-hefei-v2', id, {
      id: 'unit-hefei-01-v2',
      code: 'HF-CW-01',
      name: '合肥市教育局直属初中·语文岗位组',
      region: { code: '340100', province: '安徽省', city: '合肥市' },
      stage: 'middle',
      headcount: 8, // 补充公告扩招 5 → 8
      nature: NATURE_PUBLIC,
      allocation: ALLOC_ASSIGN,
      teachingScope: '合肥市教育局直属初中，录取后统一调配',
      requirements: makeRequirements(),
      materials: demoMaterials(HF_URL),
    }),
  ];

  const v2PublishedAt = '2026-10-02T15:00:00+08:00';

  const v1Announced = version(
    id,
    1,
    'original',
    '2026-09-15T09:00:00+08:00',
    HF_URL,
    {
      registrationStart: '2026-09-25',
      registrationEnd: '2026-10-12',
      writtenExamDate: '2026-11-02',
    },
    v1Units,
  );
  // v2 发布时 v1 被取代：业务内容原样保留，仅加 supersededAt 标记
  const v1 = { ...v1Announced, supersededAt: v2PublishedAt };
  const v2 = version(
    id,
    2,
    'supplement',
    v2PublishedAt,
    HF_SUPPLEMENT_URL,
    {
      registrationStart: '2026-09-25',
      registrationEnd: '2026-11-15', // 延期
      writtenExamDate: '2026-12-06',
    },
    v2Units,
    '补充公告：语文岗位组招聘计划由5人调整为8人；报名截止时间延至2026年11月15日，笔试时间调整为12月6日。',
  );

  return {
    id,
    title: '2026年合肥市教育局直属学校公开招聘教师公告',
    publisher: '合肥市教育局、合肥市人力资源和社会保障局',
    organizationType: 'government_unified',
    officialUrl: HF_URL,
    subjectScope: ['chinese'],
    region: { code: '340000', province: '安徽省' },
    lifecycle: 'active',
    firstPublishedAt: '2026-09-15T09:00:00+08:00',
    versions: [v1, v2],
  };
}

// ---------- 场景 7：嘉兴 · 官方来源巡检失效（历史留档，不进推荐） ----------

const JX_URL = 'https://www.jiaxing.example.gov.cn/edu/2026/teacher-07';

/**
 * 报名窗口名义上仍开放，但人工巡检确认官方发布页 404（疑似撤稿或链接调整）。
 * source_unavailable 闸门失败 → 不进推荐；公告原文锚点与核对记录保留为历史留档。
 * 演示「来源失效」异常态：它不是过期、不是资格不符合，来源恢复并复核后可重新评估。
 */
function jiaxing(): RecruitmentAnnouncement {
  const id = 'ann-jiaxing';
  const requirements: Requirement[] = [
    requirement(
      'jx-edu',
      'education',
      '本科及以上学历',
      { kind: 'education', minLevel: 'bachelor' },
      JX_URL,
      '具有大学本科及以上学历。',
    ),
    requirement(
      'jx-major',
      'major',
      '汉语言文学、汉语言文学（师范）专业',
      { kind: 'major', majorNames: ['汉语言文学', '汉语言文学（师范）'] },
      JX_URL,
      '初中语文岗位专业：汉语言文学、汉语言文学（师范）。',
    ),
    requirement(
      'jx-cert',
      'teacher_cert',
      '具有初中语文教师资格证',
      {
        kind: 'teacher_cert',
        subject: 'chinese',
        stage: 'middle',
        acceptInProgress: false,
      },
      JX_URL,
      '须具有初中语文教师资格证书。',
    ),
  ];
  const units = [
    unit(`${id}-v1`, id, {
      id: 'unit-jiaxing-01',
      code: 'JX-CW-01',
      name: '嘉兴市教育局直属初中·语文岗位组',
      region: { code: '330400', province: '浙江省', city: '嘉兴市' },
      stage: 'middle',
      headcount: 6,
      nature: NATURE_PUBLIC,
      allocation: ALLOC_ASSIGN,
      teachingScope: '嘉兴市教育局直属初中，录取后统一调配',
      requirements,
      registerUrl: 'https://www.jiaxing.example.gov.cn/edu/2026/teacher-07-apply',
    }),
  ];
  return {
    id,
    title: '2026年嘉兴市教育局直属学校公开招聘教师公告（来源巡检失效）',
    publisher: '嘉兴市教育局',
    organizationType: 'government_unified',
    officialUrl: JX_URL,
    subjectScope: ['chinese'],
    region: { code: '330000', province: '浙江省' },
    lifecycle: 'active',
    firstPublishedAt: '2026-09-25T09:00:00+08:00',
    versions: [
      version(
        id,
        1,
        'original',
        '2026-09-25T09:00:00+08:00',
        JX_URL,
        {
          registrationStart: '2026-10-01',
          registrationEnd: '2026-10-20',
          writtenExamDate: '2026-11-08',
        },
        units,
      ),
    ],
    // 人工巡检确认的故障（非网络抖动）：恢复并复核前不进入推荐，历史留档保留
    sourceHealth: {
      ok: false,
      checkedAt: '2026-10-04T09:00:00+08:00',
      failReason: '官方发布页返回 404，疑似撤稿或链接调整',
    },
  };
}

/** 七个受邀演示场景公告（顺序固定，测试依赖该顺序） */
export const CATALOG_ANNOUNCEMENTS: readonly RecruitmentAnnouncement[] = [
  hangzhou(),
  yinzhou(),
  suzhou(),
  nanjing(),
  wenzhou(),
  hefei(),
  jiaxing(),
];

/** 场景 id 常量，避免测试写魔法字符串 */
export const SCENARIO_IDS = {
  eligible: 'ann-hangzhou',
  needHukou: 'ann-yinzhou',
  majorAmbiguous: 'ann-suzhou',
  educationFail: 'ann-nanjing',
  closed: 'ann-wenzhou',
  supplemented: 'ann-hefei',
  sourceUnavailable: 'ann-jiaxing',
} as const;
