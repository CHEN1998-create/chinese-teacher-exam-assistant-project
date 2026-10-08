import type { RegionRef } from '../matching/types.js';

/** 地区文案：省+市（有区则加区），与前端 ia/labels 保持一致口径 */
export function regionLabel(region: RegionRef): string {
  const parts = [region.province, region.city, region.district].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  return parts.join('·');
}
