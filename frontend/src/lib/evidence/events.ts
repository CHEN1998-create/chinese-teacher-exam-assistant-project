/**
 * 考情证据存储的共享变更事件。
 *
 * evidenceService（用户端提取/纠错）与 adminReviewService（后台审核）
 * 写的是同一份 localStorage 数据（kb_evidence_items），
 * 必须共用同一个监听器集合：审核员在后台通过/驳回后，
 * 用户端 useEvidence 通过本事件自动刷新，反之亦然。
 */
const evidenceListeners = new Set<() => void>();
let evidenceStoreVersion = 0;

export function subscribeEvidence(listener: () => void): () => void {
  evidenceListeners.add(listener);
  return () => {
    evidenceListeners.delete(listener);
  };
}

export function emitEvidenceChanged(): void {
  evidenceStoreVersion += 1;
  evidenceListeners.forEach((fn) => fn());
}

export function getEvidenceStoreVersion(): number {
  return evidenceStoreVersion;
}
